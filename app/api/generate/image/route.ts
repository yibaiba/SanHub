/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateImage, resolveImageTarget, type ImageGenerateRequest } from '@/lib/image-generator';
import {
  saveGeneration,
  updateUserBalance,
  getUserById,
  updateGeneration,
  getImageModelWithChannel,
  refundGenerationBalance,
} from '@/lib/db';
import { saveMediaAsync } from '@/lib/media-storage';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import { fetchExternalBuffer } from '@/lib/safe-fetch';
import { validateGeneratedMediaUrl } from '@/lib/media-url-validator';
import type { ChannelType, Generation, GenerationType } from '@/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPE_BY_CHANNEL: Record<ChannelType, GenerationType> = {
  'openai-compatible': 'gemini-image',
  'openai-chat': 'gemini-image',
  flow: 'flow-image',
  gemini: 'gemini-image',
  modelscope: 'zimage-image',
  gitee: 'gitee-image',
  sora: 'sora-image',
};

class ClientInputError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ClientInputError';
    this.statusCode = statusCode;
  }
}

async function fetchImageAsBase64(
  imageUrl: string,
  origin: string
): Promise<{ mimeType: string; data: string }> {
  // Handle base64 data URL (from local upload in workspace)
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new ClientInputError('Invalid data URL format');
    }
    const [, mimeType, data] = match;
    if (!mimeType.startsWith('image/')) {
      throw new ClientInputError('Unsupported reference image content type');
    }
    console.log(`[fetchImageAsBase64] Parsed base64 data URL, mimeType: ${mimeType}`);
    return { mimeType, data: imageUrl };
  }

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
    throw new ClientInputError('Unsupported reference image content type');
  }
  const data = buffer.toString('base64');
  return { mimeType: contentType, data: `data:${contentType};base64,${data}` };
}

// 后台处理任务
async function processGenerationTask(
  generationId: string,
  userId: string,
  request: ImageGenerateRequest,
  prechargedCost: number
) {
  try {
    console.log(`[Task ${generationId}] 开始处理图像生成任务`);

    await updateGeneration(generationId, { status: 'processing' });

    const result = await generateImage(request);
    const sourceUrlValidation = validateGeneratedMediaUrl(result.url, 'image');
    if (!sourceUrlValidation.valid) {
      throw new Error(`Image generation failed: invalid image URL (${sourceUrlValidation.reason})`);
    }

    // 保存到图床或本地
    const savedUrl = await saveMediaAsync(generationId, sourceUrlValidation.normalizedUrl);
    const savedUrlValidation = validateGeneratedMediaUrl(savedUrl, 'image');
    if (!savedUrlValidation.valid) {
      throw new Error(`Image generation failed: invalid saved image URL (${savedUrlValidation.reason})`);
    }

    console.log(`[Task ${generationId}] 生成成功`);

    await updateGeneration(generationId, {
      status: 'completed',
      resultUrl: savedUrlValidation.normalizedUrl,
    });

    console.log(`[Task ${generationId}] 任务完成`);
  } catch (error) {
    console.error(`[Task ${generationId}] 任务失败:`, error);

    await updateGeneration(generationId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : '生成失败',
    });

    try {
      await refundGenerationBalance(generationId, userId, prechargedCost);
    } catch (refundErr) {
      console.error(`[Task ${generationId}] Refund failed:`, refundErr);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.GENERATE, 'generate-image');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const {
      modelId,
      prompt,
      aspectRatio,
      imageSize,
      images,
      referenceImages,
      referenceImageUrl,
    } = body;

    if (!modelId) {
      return NextResponse.json({ error: '缺少模型 ID' }, { status: 400 });
    }

    // 获取模型配置
    const modelConfig = await getImageModelWithChannel(modelId);
    if (!modelConfig) {
      return NextResponse.json({ error: '模型不存在' }, { status: 404 });
    }
    const { model, channel } = modelConfig;
    if (!model.enabled) {
      return NextResponse.json({ error: '模型已禁用' }, { status: 400 });
    }

    const resolvedTarget = resolveImageTarget(
      model.apiModel,
      model.resolutions,
      aspectRatio,
      imageSize
    );

    // 检查用户
    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }
    if (user.disabled) {
      return NextResponse.json({ error: '账号已被禁用' }, { status: 403 });
    }

    const isAdmin = user.role === 'admin';
    if (!isAdmin && user.balance < model.costPerGeneration) {
      return NextResponse.json(
        { error: `余额不足，需要至少 ${model.costPerGeneration} 积分` },
        { status: 402 }
      );
    }

    const promptText = typeof prompt === 'string' ? prompt : '';
    const hasInlineImages = Array.isArray(images) && images.length > 0;
    const hasReferenceImageUrl = typeof referenceImageUrl === 'string' && referenceImageUrl.trim().length > 0;
    const hasReferenceImages = Array.isArray(referenceImages) && referenceImages.length > 0;
    const hasAnyImageInput = hasInlineImages || hasReferenceImageUrl || hasReferenceImages;

    // 轻量校验（扣费前）
    if (model.requiresReferenceImage && !hasAnyImageInput) {
      return NextResponse.json({ error: '该模型需要上传参考图' }, { status: 400 });
    }

    if (!model.allowEmptyPrompt && !promptText.trim() && !hasAnyImageInput) {
      return NextResponse.json({ error: '请输入提示词或上传参考图' }, { status: 400 });
    }

    // 原子扣费：放在重负载参考图拉取之前，避免并发滥用
    let prechargeApplied = false;
    if (!isAdmin) {
      try {
        await updateUserBalance(user.id, -model.costPerGeneration, 'strict');
        prechargeApplied = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Insufficient balance';
        if (message.includes('Insufficient balance')) {
          return NextResponse.json(
            { error: `余额不足，需要至少 ${model.costPerGeneration} 积分` },
            { status: 402 }
          );
        }
        throw err;
      }
    }

    let generationSaved = false;
    try {
      // 处理参考图（重负载）
      const origin = new URL(request.url).origin;
      const imageList: Array<{ mimeType: string; data: string }> = [];

      if (images && Array.isArray(images)) {
        imageList.push(...images);
      }

      if (hasReferenceImageUrl) {
        const ref = await fetchImageAsBase64(referenceImageUrl, origin);
        imageList.push(ref);
      }

      if (referenceImages && Array.isArray(referenceImages)) {
        for (const img of referenceImages) {
          if (typeof img !== 'string') {
            throw new ClientInputError('Invalid reference image input');
          }
          if (img.startsWith('data:')) {
            const match = img.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              imageList.push({ mimeType: match[1], data: img });
            }
          } else {
            const ref = await fetchImageAsBase64(img, origin);
            imageList.push(ref);
          }
        }
      }

      // 再次校验（处理后兜底）
      if (model.requiresReferenceImage && imageList.length === 0) {
        throw new ClientInputError('该模型需要上传参考图');
      }
      if (!model.allowEmptyPrompt && !promptText.trim() && imageList.length === 0) {
        throw new ClientInputError('请输入提示词或上传参考图');
      }

      // 构建请求
      const generateRequest: ImageGenerateRequest = {
        modelId,
        prompt: promptText,
        aspectRatio,
        imageSize,
        images: imageList.length > 0 ? imageList : undefined,
      };

      // 保存生成记录
      const generation = await saveGeneration({
        userId: user.id,
        type: IMAGE_TYPE_BY_CHANNEL[channel.type] || 'gemini-image',
        prompt: promptText,
        params: {
          model: model.apiModel,
          aspectRatio,
          imageSize,
          imageCount: imageList.length,
        },
        resultUrl: '',
        cost: model.costPerGeneration,
        status: 'pending',
        balancePrecharged: true,
        balanceRefunded: false,
      });
      generationSaved = true;

      console.log('[API] 图像生成任务已创建:', {
        id: generation.id,
        modelId,
        model: model.apiModel,
        resolvedModel: resolvedTarget.model,
        resolvedSize: resolvedTarget.size,
      });

      // 后台处理
      processGenerationTask(generation.id, user.id, generateRequest, model.costPerGeneration).catch((err) => {
        console.error('[API] 后台任务启动失败:', err);
      });

      return NextResponse.json({
        success: true,
        data: {
          id: generation.id,
          status: 'pending',
          message: '任务已创建，正在后台处理中',
        },
      });
    } catch (stageErr) {
      // 扣费后、落库前发生异常时回滚扣费
      if (prechargeApplied && !generationSaved) {
        await updateUserBalance(user.id, model.costPerGeneration, 'strict').catch((refundErr) => {
          console.error('[API] Precharge rollback failed:', refundErr);
        });
      }
      throw stageErr;
    }
  } catch (error) {
    if (error instanceof ClientInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error('[API] Image generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成失败' },
      { status: 500 }
    );
  }
}
