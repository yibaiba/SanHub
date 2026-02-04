/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { saveGeneration, getGeneration, getUserById } from '@/lib/db';
import { saveMediaAsync } from '@/lib/media-storage';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// 单个视频最大截图数量
const MAX_CAPTURES_PER_VIDEO = 6;

interface CaptureFrameRequest {
  sourceGenerationId: string;
  imageData: string; // Base64 图片数据
  timestamp: number; // 截取时间点（秒）
  width?: number;
  height?: number;
}

/**
 * POST /api/capture/frame
 * 保存视频帧截图到图片库
 */
export async function POST(request: NextRequest) {
  try {
    // 速率限制
    const rateLimit = checkRateLimit(request, RateLimitConfig.GENERATE, 'capture-frame');
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

    const userId = session.user.id;

    // 解析请求体
    const body: CaptureFrameRequest = await request.json();
    const { sourceGenerationId, imageData, timestamp, width, height } = body;

    // 参数验证
    if (!sourceGenerationId) {
      return NextResponse.json({ error: '缺少来源视频 ID' }, { status: 400 });
    }
    if (!imageData || !imageData.startsWith('data:image/')) {
      return NextResponse.json({ error: '无效的图片数据' }, { status: 400 });
    }
    if (typeof timestamp !== 'number' || timestamp < 0) {
      return NextResponse.json({ error: '无效的时间戳' }, { status: 400 });
    }

    // 验证来源视频存在且属于当前用户
    const sourceVideo = await getGeneration(sourceGenerationId);
    if (!sourceVideo) {
      return NextResponse.json({ error: '来源视频不存在' }, { status: 404 });
    }

    // 权限检查：只能截取自己的视频（管理员可以截取任何视频）
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 401 });
    }
    if (user.disabled) {
      return NextResponse.json({ error: '账号已被禁用' }, { status: 403 });
    }

    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (sourceVideo.userId !== userId && !isAdmin) {
      return NextResponse.json({ error: '无权访问该视频' }, { status: 403 });
    }

    // 检查该视频的截图数量是否已达上限
    const { captureCount } = await getCaptureCountForVideo(sourceGenerationId);
    if (captureCount >= MAX_CAPTURES_PER_VIDEO) {
      return NextResponse.json(
        { error: `该视频截图已达上限 (${MAX_CAPTURES_PER_VIDEO} 张)` },
        { status: 429 }
      );
    }

    // 保存图片到存储
    const tempId = `capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const savedUrl = await saveMediaAsync(tempId, imageData);

    // 创建 generation 记录
    const generation = await saveGeneration({
      userId,
      type: 'video-capture',
      prompt: `视频截图 @ ${formatTimestamp(timestamp)}`,
      params: {
        sourceVideoId: sourceGenerationId,
        captureTimestamp: timestamp,
        originalWidth: width,
        originalHeight: height,
      },
      resultUrl: savedUrl,
      cost: 0, // 免费，不消耗积分
      status: 'completed',
    });

    console.log(`[Capture] User ${userId} captured frame from video ${sourceGenerationId} at ${timestamp}s`);

    return NextResponse.json({
      success: true,
      data: {
        id: generation.id,
        resultUrl: generation.resultUrl,
      },
      captureCount: captureCount + 1,
    });
  } catch (error) {
    console.error('[Capture] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '截图保存失败' },
      { status: 500 }
    );
  }
}

/**
 * 获取指定视频的截图数量
 */
async function getCaptureCountForVideo(videoId: string): Promise<{ captureCount: number }> {
  // 动态导入以避免循环依赖
  const { initializeDatabase, getAdapter } = await import('@/lib/db');
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

  return { captureCount: Number(count) };
}

/**
 * 格式化时间戳为可读格式
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
