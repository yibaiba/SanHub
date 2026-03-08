import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeneration, publishGeneration, unpublishGeneration } from '@/lib/db';
import { buildGenerationShareUrl, mapOwnerGenerationMediaUrl } from '@/lib/generation-urls';
import { getRequestOrigin } from '@/lib/request-origin';
import { resolveExpectedMediaType, validatePublishableMediaUrl } from '../../../../../../lib/media-url-validator';
import type { Generation } from '@/types';

function toOwnerGeneration(generation: Generation): Generation {
  return mapOwnerGenerationMediaUrl(generation);
}

function buildShareUrl(request: NextRequest, generation: Generation): string | null {
  if (!generation.publicShareId) return null;
  return buildGenerationShareUrl(getRequestOrigin(request), generation.publicShareId);
}

function getPublishErrorMessage(generation: Generation): string {
  if (generation.status !== 'completed') {
    return '只有已完成作品才能公开';
  }
  if (!resolveExpectedMediaType(generation.type)) {
    return '只有图片或视频作品才能公开';
  }
  if (!generation.resultUrl) {
    return '作品缺少有效媒体文件，暂时无法公开';
  }
  const expectedMediaType = resolveExpectedMediaType(generation.type);
  if (!expectedMediaType) {
    return '只有图片或视频作品才能公开';
  }
  const validation = validatePublishableMediaUrl(generation.resultUrl, expectedMediaType);
  if (!validation.valid) {
    return '作品缺少有效媒体文件，暂时无法公开';
  }
  return '当前作品可以公开';
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const generation = await getGeneration(params.id);
    if (!generation) {
      return NextResponse.json({ error: '作品不存在' }, { status: 404 });
    }
    if (generation.userId !== session.user.id) {
      return NextResponse.json({ error: '无权操作此作品' }, { status: 403 });
    }
    const publishErrorMessage = getPublishErrorMessage(generation);
    if (publishErrorMessage !== '当前作品可以公开') {
      return NextResponse.json({ error: publishErrorMessage }, { status: 400 });
    }

    const updated = await publishGeneration(params.id, session.user.id);
    return NextResponse.json({
      success: true,
      data: {
        generation: toOwnerGeneration(updated),
        shareUrl: buildShareUrl(request, updated),
      },
    });
  } catch (error) {
    console.error('Publish generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '公开失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const generation = await getGeneration(params.id);
    if (!generation) {
      return NextResponse.json({ error: '作品不存在' }, { status: 404 });
    }
    if (generation.userId !== session.user.id) {
      return NextResponse.json({ error: '无权操作此作品' }, { status: 403 });
    }

    const updated = await unpublishGeneration(params.id, session.user.id);
    return NextResponse.json({
      success: true,
      data: {
        generation: toOwnerGeneration(updated),
      },
    });
  } catch (error) {
    console.error('Unpublish generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取消公开失败' },
      { status: 500 }
    );
  }
}
