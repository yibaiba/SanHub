/**
 * Upscale Image API
 *
 * Handles the full workflow: URL -> Upload to Veo -> Upscale -> Return result
 * Used by the storyboard splitter for batch upscaling slices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadImageToVeo } from '@/lib/image-upload';
import { createUpscaleTask } from '@/lib/sora-api';
import { getAdapter } from '@/lib/db';

// Get Flow config for Veo API
async function getFlowConfig(): Promise<{ apiKey: string; baseUrl: string } | null> {
  const db = getAdapter();
  const [channels] = await db.execute(
    `SELECT api_key, base_url FROM video_channels WHERE type = 'flow' AND enabled = 1 LIMIT 1`
  );
  const channel = (channels as any[])[0];
  if (!channel?.api_key) return null;
  return {
    apiKey: channel.api_key,
    baseUrl: channel.base_url || 'https://api.flow.ai',
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { imageUrl, quality = '1080p' } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: '缺少 imageUrl 参数' }, { status: 400 });
    }

    if (!['1080p', '4k'].includes(quality)) {
      return NextResponse.json({ error: '无效的 quality 参数' }, { status: 400 });
    }

    const config = await getFlowConfig();
    if (!config) {
      return NextResponse.json({ error: 'Flow API 未配置' }, { status: 500 });
    }

    // 1. Fetch image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${imageResponse.status}` },
        { status: 400 }
      );
    }

    const blob = await imageResponse.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = blob.type || 'image/png';

    // 2. Upload to Veo
    const mediaId = await uploadImageToVeo(config.baseUrl, config.apiKey, base64, mimeType);

    // 3. Submit upscale task
    const task = await createUpscaleTask({ mediaId, quality });

    // 4. Poll for result (max 2 minutes)
    const maxAttempts = 60;
    const intervalMs = 2000;
    let resultUrl: string | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const statusUrl = `${config.baseUrl.replace(/\/$/, '')}/v1/videos/${task.taskId}`;
      const statusResponse = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      const statusData = (await statusResponse.json()) as {
        status: string;
        output?: { url?: string };
        error?: { message?: string };
      };

      if (statusData.status === 'completed' || statusData.status === 'succeeded') {
        resultUrl = statusData.output?.url || null;
        break;
      }

      if (statusData.status === 'failed') {
        throw new Error(statusData.error?.message || 'Upscale failed');
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    if (!resultUrl) {
      return NextResponse.json({ error: 'Upscale timeout' }, { status: 504 });
    }

    return NextResponse.json({
      success: true,
      url: resultUrl,
      mediaId,
    });
  } catch (error) {
    console.error('[API] Upscale image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
