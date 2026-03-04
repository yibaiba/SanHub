import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeneration, refundGenerationBalance, updateGeneration } from '@/lib/db';
import { resolveExpectedMediaType, validateGeneratedMediaUrl } from '@/lib/media-url-validator';

export const dynamic = 'force-dynamic';

// 处理媒体 URL：
// - 需要认证的 URL（如 /content）：转换为代理 URL
// - 外部公开 URL：保持原样
// - base64/file：转换为代理 URL
function convertToMediaUrl(resultUrl: string | undefined, id: string, type: string): string {
  if (!resultUrl) return '';

  if (type.includes('video')) {
    return `/api/media/${id}`;
  }
  
  // 需要 API Key 认证的 Sora /content URL，转换为代理 URL
  if (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content')) {
    return `/api/media/${id}`;
  }
  
  // base64 data URL 或本地文件，转换为代理 URL
  if (resultUrl.startsWith('data:') || resultUrl.startsWith('file:')) {
    return `/api/media/${id}`;
  }
  
  // 外部公开 URL，保持原样
  return resultUrl;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const generation = await getGeneration(id);

    if (!generation) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    // 验证任务所有权
    if (generation.userId !== session.user.id) {
      return NextResponse.json({ error: '无权访问此任务' }, { status: 403 });
    }

    let latestGeneration = generation;

    // 兜底纠偏：媒体任务必须有有效 URL，completed 但无效 URL 统一改成失败
    const expectedMediaType = resolveExpectedMediaType(latestGeneration.type);
    if (latestGeneration.status === 'completed' && expectedMediaType) {
      const validation = validateGeneratedMediaUrl(latestGeneration.resultUrl || '', expectedMediaType);
      if (!validation.valid) {
        try {
          const updated = await updateGeneration(latestGeneration.id, {
            status: 'failed',
            errorMessage:
              latestGeneration.errorMessage ||
              `Generation failed: missing valid ${expectedMediaType} URL (${validation.reason})`,
          });
          if (updated) {
            latestGeneration = updated;
          }
        } catch (markErr) {
          console.error('[API] Mark invalid completed generation as failed error:', markErr);
        }
      }
    }

    // 兜底补偿：失败/取消但尚未退款时，自动补退一次
    if (
      (latestGeneration.status === 'failed' || latestGeneration.status === 'cancelled') &&
      latestGeneration.balancePrecharged &&
      !latestGeneration.balanceRefunded &&
      latestGeneration.cost > 0
    ) {
      try {
        const refunded = await refundGenerationBalance(
          latestGeneration.id,
          latestGeneration.userId,
          latestGeneration.cost
        );
        if (refunded) {
          const refreshed = await getGeneration(latestGeneration.id);
          if (refreshed) {
            latestGeneration = refreshed;
          }
        }
      } catch (refundErr) {
        console.error('[API] Auto refund on status check failed:', refundErr);
      }
    }

    // 解析 params（可能是 JSON 字符串或对象）
    let generationParams: Record<string, unknown> | undefined;
    if (latestGeneration.params) {
      if (typeof latestGeneration.params === 'string') {
        try {
          generationParams = JSON.parse(latestGeneration.params);
        } catch {
          generationParams = undefined;
        }
      } else {
        generationParams = latestGeneration.params as Record<string, unknown>;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: latestGeneration.id,
        status: latestGeneration.status,
        type: latestGeneration.type,
        url: convertToMediaUrl(latestGeneration.resultUrl, latestGeneration.id, latestGeneration.type),
        cost: latestGeneration.cost,
        progress: generationParams?.progress ?? 0,
        errorMessage: latestGeneration.errorMessage,
        params: generationParams,
        createdAt: latestGeneration.createdAt,
        updatedAt: latestGeneration.updatedAt,
      },
    });
  } catch (error) {
    console.error('[API] Get generation status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}
