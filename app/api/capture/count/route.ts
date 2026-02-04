/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGeneration, getUserById, initializeDatabase, getAdapter } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/capture/count?videoId=xxx
 * 查询指定视频已截取的图片数量
 */
export async function GET(request: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
      return NextResponse.json({ error: '缺少视频 ID' }, { status: 400 });
    }

    // 验证来源视频存在且属于当前用户
    const sourceVideo = await getGeneration(videoId);
    if (!sourceVideo) {
      return NextResponse.json({ error: '视频不存在' }, { status: 404 });
    }

    // 权限检查
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }

    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (sourceVideo.userId !== userId && !isAdmin) {
      return NextResponse.json({ error: '无权访问该视频' }, { status: 403 });
    }

    // 查询截图数量
    await initializeDatabase();
    const db = getAdapter();

    const [rows] = await db.execute(
      `SELECT COUNT(*) as count FROM generations
       WHERE type = 'video-capture'
       AND JSON_EXTRACT(params, '$.sourceVideoId') = ?`,
      [videoId]
    );

    const result = rows as any[];
    const count = result[0]?.count || result[0]?.['COUNT(*)'] || 0;

    return NextResponse.json({
      success: true,
      data: {
        videoId,
        captureCount: Number(count),
        maxCaptures: 6,
      },
    });
  } catch (error) {
    console.error('[Capture Count] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 }
    );
  }
}
