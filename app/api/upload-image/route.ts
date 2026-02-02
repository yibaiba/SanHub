/**
 * Image Upload API
 *
 * Uploads base64 image to PicUI image hosting service.
 * Falls back to returning the original base64 if PicUI is not configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadToPicUI } from '@/lib/picui';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { base64, filename } = body;

    if (!base64) {
      return NextResponse.json({ error: '缺少 base64 参数' }, { status: 400 });
    }

    // Upload to PicUI
    const url = await uploadToPicUI(base64, filename);

    if (url) {
      return NextResponse.json({
        success: true,
        url,
        isBase64: false,
      });
    } else {
      // Fallback to returning original base64
      return NextResponse.json({
        success: true,
        url: base64,
        isBase64: true,
      });
    }
  } catch (error) {
    console.error('[API] Upload image error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
