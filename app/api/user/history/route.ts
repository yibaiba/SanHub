import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGenerations, refundGenerationBalance, updateGeneration } from '@/lib/db';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import type { Generation } from '@/types';
import { resolveExpectedMediaType, validateGeneratedMediaUrl } from '@/lib/media-url-validator';

// 处理媒体 URL：
// - 所有媒体文件统一通过 /api/media/[id] 代理
// - 代理层会根据类型决定是 302 重定向还是代理请求
function convertToMediaUrl(generation: Generation): Generation {
  const { resultUrl } = generation;
  
  // 如果没有结果URL，直接返回
  if (!resultUrl) {
    return generation;
  }

  // 统一转换为代理 URL，让 /api/media/[id] 处理重定向逻辑
  return {
    ...generation,
    resultUrl: `/api/media/${generation.id}`,
  };
}

export async function GET(request: NextRequest) {
  try {
    // 限流检查
    const rateLimit = checkRateLimit(request, RateLimitConfig.API, 'history');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 支持分页
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // 最大 100
    const offset = (page - 1) * limit;

    let generations = await getUserGenerations(session.user.id, limit, offset);
    let hasReconciled = false;

    // 兜底纠偏：媒体任务 completed 但没有有效 URL，统一转失败
    const invalidCompletedCandidates = generations.filter((generation) => {
      if (generation.status !== 'completed') return false;
      const expectedMediaType = resolveExpectedMediaType(generation.type);
      if (!expectedMediaType) return false;
      const validation = validateGeneratedMediaUrl(generation.resultUrl || '', expectedMediaType);
      return !validation.valid;
    });

    if (invalidCompletedCandidates.length > 0) {
      const markResults = await Promise.allSettled(
        invalidCompletedCandidates.map(async (generation) => {
          const expectedMediaType = resolveExpectedMediaType(generation.type);
          if (!expectedMediaType) return null;
          const validation = validateGeneratedMediaUrl(generation.resultUrl || '', expectedMediaType);
          if (validation.valid) return null;

          return updateGeneration(generation.id, {
            status: 'failed',
            errorMessage:
              generation.errorMessage ||
              `Generation failed: missing valid ${expectedMediaType} URL (${validation.reason})`,
          });
        })
      );

      const updatedById = new Map<string, Generation>();
      for (const result of markResults) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        updatedById.set(result.value.id, result.value);
      }

      if (updatedById.size > 0) {
        hasReconciled = true;
        generations = generations.map((generation) => updatedById.get(generation.id) || generation);
      }
    }

    // 兜底补偿：失败/取消但尚未退款的任务，自动补退
    const refundCandidates = generations.filter((generation) =>
      (generation.status === 'failed' || generation.status === 'cancelled') &&
      generation.balancePrecharged &&
      !generation.balanceRefunded &&
      generation.cost > 0
    );

    if (refundCandidates.length > 0) {
      const results = await Promise.allSettled(
        refundCandidates.map((generation) =>
          refundGenerationBalance(generation.id, generation.userId, generation.cost)
        )
      );

      const hasRefunded = results.some(
        (result) => result.status === 'fulfilled' && result.value === true
      );

      if (hasRefunded) {
        hasReconciled = true;
      }
    }

    if (hasReconciled) {
      generations = await getUserGenerations(session.user.id, limit, offset);
    }
    
    // 将 base64 URL 转换为媒体 API URL，大幅减小响应体积
    const processedGenerations = generations.map(convertToMediaUrl);
    
    return NextResponse.json(
      { success: true, data: processedGenerations, page, limit },
      { headers: rateLimit.headers }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取历史记录失败' },
      { status: 500 }
    );
  }
}
