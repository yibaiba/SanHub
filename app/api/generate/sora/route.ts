/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateWithSora } from '@/lib/sora';
import { generateVideo, type VideoGenerateRequest } from '@/lib/video-generator';
import {
  saveGeneration,
  updateUserBalance,
  getUserById,
  updateGeneration,
  getSystemConfig,
  refundGenerationBalance,
  getVideoModelWithChannel,
} from '@/lib/db';
import type { Generation, GenerationType, SoraGenerateRequest } from '@/types';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { fetchExternalBuffer } from '@/lib/safe-fetch';

// 配置路由段选项
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_REFERENCE_IMAGE_BYTES = 50 * 1024 * 1024;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1500;
const RATE_LIMIT_MAX_DELAY_MS = 10000;

function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('rate limited') ||
    message.includes('too many requests')
  );
}

function getRateLimitDelayMs(attempt: number): number {
  const delay = Math.min(RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1), RATE_LIMIT_MAX_DELAY_MS);
  const jitter = Math.floor(delay * 0.25 * Math.random());
  return delay - jitter;
}

async function generateWithRateLimitRetry(
  body: SoraGenerateRequest,
  onProgress: (progress: number) => void,
  taskId: string
) {
  let attempt = 0;
  while (true) {
    try {
      if (attempt > 0) {
        console.warn(`[Task ${taskId}] Retry attempt ${attempt} after rate limit`);
      }
      return await generateWithSora(body, onProgress);
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= RATE_LIMIT_RETRIES) {
        throw error;
      }
      attempt += 1;
      const delayMs = getRateLimitDelayMs(attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function fetchImageAsBase64(imageUrl: string, origin: string): Promise<{ mimeType: string; data: string }> {
  const { buffer, contentType } = await fetchExternalBuffer(imageUrl, {
    origin,
    allowRelative: true,
    maxBytes: MAX_REFERENCE_IMAGE_BYTES,
    timeoutMs: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!contentType.startsWith('image/')) {
    throw new Error('Unsupported reference image content type');
  }
  const data = buffer.toString('base64');
  return { mimeType: contentType, data };
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  body: SoraGenerateRequest,
  prechargedCost: number
): Promise<void> {
  try {
    console.log(`[Task ${generationId}] 开始处理生成任务`);
    
    // 更新状态为 processing
    await updateGeneration(generationId, { status: 'processing' }).catch(err => {
      console.error(`[Task ${generationId}] 更新状态失败:`, err);
    });

    // 进度更新回调（节流：每5%更新一次）
    let lastProgress = 0;
    const onProgress = async (progress: number) => {
      if (progress - lastProgress >= 5 || progress >= 100) {
        lastProgress = progress;
        await updateGeneration(generationId, { 
          params: { model: body.model, progress } 
        }).catch(err => {
          console.error(`[Task ${generationId}] 更新进度失败:`, err);
        });
      }
    };

    // 调用 Sora API 生成内容
    const result = await generateWithRateLimitRetry(body, onProgress, generationId);

    console.log(`[Task ${generationId}] 生成成功:`, result.url);

    // 更新生成记录为完成状态
    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: result.url,
      params: {
        model: body.model,
        videoId: result.videoId,
        videoChannelId: result.videoChannelId,
        permalink: result.permalink,
        revised_prompt: result.revised_prompt,
      },
    }).catch(err => {
      console.error(`[Task ${generationId}] 更新完成状态失败:`, err);
    });

    console.log(`[Task ${generationId}] 任务完成`);
  } catch (error) {
    console.error(`[Task ${generationId}] 任务失败:`, error);
    
    // 确保错误消息格式正确
    let errorMessage = '生成失败';
    if (error instanceof Error) {
      errorMessage = error.message;
      // 处理 cause 属性中的额外信息
      if ('cause' in error && error.cause) {
        console.error(`[Task ${generationId}] 错误原因:`, error.cause);
      }
    }
    
    // 更新为失败状态（用 try-catch 确保不会抛出）
    try {
      await updateGeneration(generationId, {
        status: 'failed',
        errorMessage,
      });
    } catch (updateErr) {
      console.error(`[Task ${generationId}] 更新失败状态时出错:`, updateErr);
    }

    // 退款
    console.log(`[Task ${generationId}] Attempting refund: ${prechargedCost} credits to user ${userId}`);
    try {
      const refunded = await refundGenerationBalance(generationId, userId, prechargedCost);
      if (refunded) {
        console.log(`[Task ${generationId}] ✓ Refund successful: ${prechargedCost} credits returned to user ${userId}`);
      } else {
        console.warn(`[Task ${generationId}] ✗ Refund skipped (already refunded or not precharged)`);
      }
    } catch (refundErr) {
      console.error(`[Task ${generationId}] ✗ Refund failed:`, refundErr);
    }
  }
}

type VideoGeneratePayload = {
  modelId?: string;
  model?: string;
  prompt?: string;
  aspectRatio?: string;
  duration?: string;
  files?: { mimeType: string; data: string }[];
  referenceImageUrl?: string;
  style_id?: string;
  remix_target_id?: string;
};

async function processVideoTask(
  generationId: string,
  userId: string,
  request: VideoGenerateRequest,
  meta: { modelId: string; apiModel: string; aspectRatio: string; duration: string },
  prechargedCost: number
): Promise<void> {
  try {
    await updateGeneration(generationId, { status: 'processing' }).catch((err) => {
      console.error(`[Task ${generationId}] Failed to update status:`, err);
    });

    let lastProgress = 0;
    const onProgress = async (progress: number) => {
      if (progress - lastProgress >= 5 || progress >= 100) {
        lastProgress = progress;
        await updateGeneration(generationId, {
          params: {
            modelId: meta.modelId,
            model: meta.apiModel,
            aspectRatio: meta.aspectRatio,
            duration: meta.duration,
            progress,
          },
        }).catch((err) => {
          console.error(`[Task ${generationId}] Failed to update progress:`, err);
        });
      }
    };

    const result = await generateVideo(request, onProgress);

    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: result.url,
      params: {
        modelId: meta.modelId,
        model: meta.apiModel,
        aspectRatio: meta.aspectRatio,
        duration: meta.duration,
        videoId: result.videoId,
        videoChannelId: result.videoChannelId,
        permalink: result.permalink,
        revised_prompt: result.revised_prompt,
      },
    }).catch((err) => {
      console.error(`[Task ${generationId}] Failed to update completion:`, err);
    });
  } catch (error) {
    console.error(`[Task ${generationId}] Video task failed:`, error);

    let errorMessage = 'Video generation failed';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    try {
      await updateGeneration(generationId, {
        status: 'failed',
        errorMessage,
      });
    } catch (updateErr) {
      console.error(`[Task ${generationId}] Failed to update failure status:`, updateErr);
    }

    // 退款
    console.log(`[Task ${generationId}] Attempting refund: ${prechargedCost} credits to user ${userId}`);
    try {
      const refunded = await refundGenerationBalance(generationId, userId, prechargedCost);
      if (refunded) {
        console.log(`[Task ${generationId}] ✓ Refund successful: ${prechargedCost} credits returned to user ${userId}`);
      } else {
        console.warn(`[Task ${generationId}] ✗ Refund skipped (already refunded or not precharged)`);
      }
    } catch (refundErr) {
      console.error(`[Task ${generationId}] ✗ Refund failed:`, refundErr);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.GENERATE, 'generate-sora-video');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body: VideoGeneratePayload = await request.json();
    const hasModelId = typeof body.modelId === 'string' && body.modelId.trim().length > 0;

    const origin = new URL(request.url).origin;
    const normalizedFiles = body.files ? [...body.files] : [];
    if (body.referenceImageUrl) {
      const file = await fetchImageAsBase64(body.referenceImageUrl, origin);
      normalizedFiles.push(file);
    }

    if (hasModelId) {
      const modelId = body.modelId!.trim();
      const modelConfig = await getVideoModelWithChannel(modelId);
      if (!modelConfig) {
        return NextResponse.json({ error: 'Video model not found' }, { status: 404 });
      }
      const { model, channel } = modelConfig;
      if (!model.enabled) {
        return NextResponse.json({ error: 'Video model is disabled' }, { status: 400 });
      }
      if (!channel.enabled) {
        return NextResponse.json({ error: 'Video channel is disabled' }, { status: 400 });
      }

      const prompt = (body.prompt || '').trim();
      const hasPrompt = Boolean(prompt);
      const hasFiles = normalizedFiles.length > 0;

      if (!hasPrompt && !hasFiles) {
        return NextResponse.json(
          { error: 'Prompt or reference images are required' },
          { status: 400 }
        );
      }

      const aspectRatio = body.aspectRatio || model.defaultAspectRatio;
      const duration = body.duration || model.defaultDuration;
      
      console.log('[Video Generation] Model info:', {
        modelId,
        modelName: model.name,
        apiModel: model.apiModel,
        channelType: channel.type,
        channelName: channel.name,
        aspectRatio,
        duration,
      });
      
      // Calculate cost based on channel type
      let estimatedCost = 0;
      if (channel.type === 'flow') {
        // Flow (Veo) models: use database pricing for 8s videos
        const config = await getSystemConfig();
        estimatedCost = config.pricing.veoVideo8s;
        console.log('[Video Generation] Flow/Veo model cost calculation:', {
          veoVideo8s: config.pricing.veoVideo8s,
          estimatedCost,
        });
      } else {
        // Sora models: use duration-based pricing from model config
        const durationCost = model.durations.find((d) => d.value === duration)?.cost;
        estimatedCost = typeof durationCost === 'number'
          ? durationCost
          : model.durations[0]?.cost || 0;
        console.log('[Video Generation] Sora model cost calculation:', {
          duration,
          durationCost,
          estimatedCost,
          availableDurations: model.durations,
        });
      }

      const user = await getUserById(session.user.id);
      console.log('[Video Generation] User balance check:', {
        userId: user?.id,
        userBalance: user?.balance,
        estimatedCost,
        isAdmin: user?.role === 'admin',
      });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 401 });
      }

      // Check balance (admin exempt)
      const isAdmin = user.role === 'admin';
      if (!isAdmin && user.balance < estimatedCost) {
        console.log('[Video Generation] Insufficient balance:', {
          userId: user.id,
          userBalance: user.balance,
          estimatedCost,
          shortfall: estimatedCost - user.balance,
        });
        return NextResponse.json(
          { error: `Insufficient balance. Need at least ${estimatedCost}.` },
          { status: 402 }
        );
      }

      // Deduct credits (admin exempt)
      if (!isAdmin) {
        try {
          console.log('[Video Generation] Deducting balance:', {
            userId: user.id,
            amount: -estimatedCost,
            beforeBalance: user.balance,
          });
          await updateUserBalance(user.id, -estimatedCost, 'strict');
          console.log('[Video Generation] Balance deducted successfully');
        } catch (err) {
          console.error('[Video Generation] Balance deduction failed:', err);
          const message = err instanceof Error ? err.message : 'Insufficient balance';
          if (message.includes('Insufficient balance')) {
            return NextResponse.json(
              { error: `Insufficient balance. Need at least ${estimatedCost}.` },
              { status: 402 }
            );
          }
          throw err;
        }
      } else {
        console.log('[Video Generation] Admin user, skipping balance deduction');
      }

      const generationType: GenerationType = channel.type === 'flow' ? 'flow-video' : 'sora-video';

      let generation: Generation;
      try {
        generation = await saveGeneration({
          userId: user.id,
          type: generationType,
          prompt,
          params: {
            modelId,
            model: model.apiModel,
            aspectRatio,
            duration,
            imageCount: normalizedFiles.length,
          },
          resultUrl: '',
          cost: estimatedCost,
          status: 'pending',
          balancePrecharged: true,
          balanceRefunded: false,
        });
      } catch (saveErr) {
        await updateUserBalance(user.id, estimatedCost, 'strict').catch((refundErr) => {
          console.error('[API] Precharge rollback failed:', refundErr);
        });
        throw saveErr;
      }

      const videoRequest: VideoGenerateRequest = {
        modelId,
        prompt,
        aspectRatio,
        duration,
        files: normalizedFiles,
        styleId: body.style_id,
        remixTargetId: body.remix_target_id,
      };

      processVideoTask(
        generation.id,
        user.id,
        videoRequest,
        { modelId, apiModel: model.apiModel, aspectRatio, duration },
        estimatedCost
      ).catch((err) => {
        console.error('[API] Video task start failed:', err);
      });

      return NextResponse.json({
        success: true,
        data: {
          id: generation.id,
          status: 'pending',
          type: generation.type,
          message: 'Task created. Processing in background.',
        },
      });
    }

    const legacyBody = body as SoraGenerateRequest;
    const hasPrompt = Boolean(legacyBody.prompt && legacyBody.prompt.trim());
    const hasFiles = Boolean(legacyBody.files && legacyBody.files.length > 0);
    const hasReferenceUrl = Boolean(legacyBody.referenceImageUrl);

    if (!hasPrompt && !hasFiles && !hasReferenceUrl) {
      return NextResponse.json(
        { error: 'Prompt or reference images are required' },
        { status: 400 }
      );
    }

    const normalizedBody: SoraGenerateRequest = {
      ...legacyBody,
      files: legacyBody.files ? [...legacyBody.files] : [],
    };

    if (legacyBody.referenceImageUrl) {
      const file = await fetchImageAsBase64(legacyBody.referenceImageUrl, origin);
      normalizedBody.files?.push(file);
    }

    // 获取最新用户信息
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    // 预估成本
    const config = await getSystemConfig();
    const estimatedCost = legacyBody.model.includes('25s')
      ? config.pricing.soraVideo25s
      : legacyBody.model.includes('15s')
        ? config.pricing.soraVideo15s
        : config.pricing.soraVideo10s;

    // 检查余额（管理员豁免）
    const isAdmin = user.role === 'admin';
    if (!isAdmin && user.balance < estimatedCost) {
      return NextResponse.json(
        { error: `余额不足，需要至少 ${estimatedCost} 积分` },
        { status: 402 }
      );
    }

    // 扣除积分（管理员豁免）
    if (!isAdmin) {
      try {
        await updateUserBalance(user.id, -estimatedCost, 'strict');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Insufficient balance';
        if (message.includes('Insufficient balance')) {
          return NextResponse.json(
            { error: `余额不足，需要至少 ${estimatedCost} 积分` },
            { status: 402 }
          );
        }
        throw err;
      }
    }

    // 生成类型固定为视频
    const type = 'sora-video';

    // 立即创建生成记录（状态为 pending）
    let generation: Generation;
    try {
      generation = await saveGeneration({
        userId: user.id,
        type,
        prompt: legacyBody.prompt || '',
        params: { model: legacyBody.model },
        resultUrl: '',
        cost: estimatedCost,
        status: 'pending',
        balancePrecharged: true,
        balanceRefunded: false,
      });
    } catch (saveErr) {
      await updateUserBalance(user.id, estimatedCost, 'strict').catch(refundErr => {
        console.error('[API] Precharge rollback failed:', refundErr);
      });
      throw saveErr;
    }

    // 在后台异步处理（不等待完成）
    processGenerationTask(generation.id, user.id, normalizedBody, estimatedCost).catch((err) => {
      console.error('[API] 后台任务启动失败:', err);
    });

    // 立即返回任务 ID
    return NextResponse.json({
      success: true,
      data: {
        id: generation.id,
        status: 'pending',
        type,
        message: '任务已创建，正在后台处理中',
      },
    });
  } catch (error) {
    console.error('[API] Sora generation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : '生成失败';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('[API] Error details:', {
      message: errorMessage,
      stack: errorStack,
    });

    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}
