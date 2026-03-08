import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeneration, refundGenerationBalance, updateGeneration } from '@/lib/db';
import { buildGenerationMediaProxyPath } from '@/lib/generation-urls';
import { resolveExpectedMediaType, validateGeneratedMediaUrl } from '../../../../../lib/media-url-validator';

export const dynamic = 'force-dynamic';

// 处理媒体 URL：
// - 需要认证的 URL（如 /content）：转换为同源绝对代理 URL
// - 外部公开 URL：保持原样
// - base64/file：转换为同源绝对代理 URL
function convertToMediaUrl(
  resultUrl: string | undefined,
  id: string,
  type: string,
  origin: string
): string {
  if (!resultUrl) return '';

  if (resolveExpectedMediaType(type) === 'video') {
    return buildGenerationMediaProxyPath(id);
  }

  if (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content')) {
    return buildGenerationMediaProxyPath(id);
  }

  if (resultUrl.startsWith('data:') || resultUrl.startsWith('file:')) {
    return buildGenerationMediaProxyPath(id);
  }

  return resultUrl;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const generation = await getGeneration(id);

    if (!generation) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    if (generation.userId !== session.user.id) {
      return NextResponse.json({ error: '无权访问此任务' }, { status: 403 });
    }

    let latestGeneration = generation;

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
        url: convertToMediaUrl(
          latestGeneration.resultUrl,
          latestGeneration.id,
          latestGeneration.type,
          request.nextUrl.origin
        ),
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
