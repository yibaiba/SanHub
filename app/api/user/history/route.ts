import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserGenerations, refundGenerationBalance, updateGeneration } from '@/lib/db';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import type { Generation } from '@/types';
import { mapOwnerGenerationMediaUrl } from '@/lib/generation-urls';
import { getRequestOrigin } from '@/lib/request-origin';
import { resolveExpectedMediaType, validateGeneratedMediaUrl } from '@/lib/media-url-validator';

function convertToMediaUrl(generation: Generation): Generation {
  return mapOwnerGenerationMediaUrl(generation);
}

export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;

    let generations = await getUserGenerations(session.user.id, limit, offset);
    let hasReconciled = false;

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
    const processedGenerations = generations.map((generation) =>
      convertToMediaUrl(generation)
    );

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
