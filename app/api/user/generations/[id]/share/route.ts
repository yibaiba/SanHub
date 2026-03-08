import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeneration } from '@/lib/db';
import { buildGenerationShareUrl } from '@/lib/generation-urls';
import { getRequestOrigin } from '@/lib/request-origin';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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
    if (generation.visibility !== 'public' || !generation.publicShareId) {
      return NextResponse.json({ error: '请先公开作品' }, { status: 400 });
    }
    if (generation.status !== 'completed' || !generation.resultUrl) {
      return NextResponse.json({ error: '当前作品暂不可分享' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      data: {
        url: buildGenerationShareUrl(getRequestOrigin(request), generation.publicShareId),
      },
    });
  } catch (error) {
    console.error('Get generation share error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取分享链接失败' },
      { status: 500 }
    );
  }
}
