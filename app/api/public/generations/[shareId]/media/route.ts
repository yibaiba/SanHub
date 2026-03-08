/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getPublishedGenerationByShareId } from '@/lib/db';
import { readMediaFile, isLocalFile } from '@/lib/media-storage';
import { getVideoContentUrl } from '@/lib/sora-api';
import { fetchExternalBuffer, resolveAndValidateUrl } from '@/lib/safe-fetch';
import { resolveExpectedMediaType, type ExpectedMediaType } from '../../../../../../lib/media-url-validator';

export const dynamic = 'force-dynamic';

const PUBLIC_MEDIA_CACHE_CONTROL = 'no-store, max-age=0, must-revalidate';

function withPublicMediaCacheControl(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', PUBLIC_MEDIA_CACHE_CONTROL);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { shareId: string } }
) {
  try {
    const generation = await getPublishedGenerationByShareId(params.shareId);
    if (!generation) {
      return withPublicMediaCacheControl(new NextResponse('Not Found', { status: 404 }));
    }

    const expectedMediaType = resolveExpectedMediaType(generation.type);
    if (!expectedMediaType) {
      return withPublicMediaCacheControl(new NextResponse('Not Found', { status: 404 }));
    }

    let resultUrl = generation.resultUrl;
    const videoId = typeof generation.params?.videoId === 'string' ? generation.params.videoId : undefined;
    const videoChannelId =
      typeof generation.params?.videoChannelId === 'string' ? generation.params.videoChannelId : undefined;

    if (!resultUrl) {
      return withPublicMediaCacheControl(new NextResponse('No Content', { status: 204 }));
    }

    if (videoId) {
      try {
        resultUrl = await getVideoContentUrl(videoId, videoChannelId);
      } catch (error) {
        console.error('[Public Media API] Failed to resolve videoId content URL:', error);
      }
    }

    if (resultUrl.includes('/v1/videos/') && resultUrl.includes('/content')) {
      const match = resultUrl.match(/\/v1\/videos\/([^/]+)\/content/);
      if (match) {
        try {
          resultUrl = await getVideoContentUrl(match[1], videoChannelId);
        } catch (error) {
          console.error('[Public Media API] Failed to get Sora content URL:', error);
          return withPublicMediaCacheControl(new NextResponse('Failed to get video URL', { status: 502 }));
        }
      }
    }

    if (isLocalFile(resultUrl)) {
      const file = await readMediaFile(resultUrl);
      if (!file) {
        return withPublicMediaCacheControl(new NextResponse('File not found', { status: 404 }));
      }
      return createMediaResponse(file.buffer, file.mimeType);
    }

    if (resultUrl.startsWith('http://') || resultUrl.startsWith('https://')) {
      const origin = new URL(request.url).origin;
      let safeUrl: URL;
      try {
        safeUrl = await resolveAndValidateUrl(resultUrl, { origin });
      } catch (error) {
        console.error('[Public Media API] Blocked external URL:', error);
        return withPublicMediaCacheControl(new NextResponse('Invalid media URL', { status: 400 }));
      }

      const forceRaw = request.nextUrl.searchParams.get('raw') === 'true';
      if (!forceRaw) {
        return withPublicMediaCacheControl(NextResponse.redirect(safeUrl.toString(), 302));
      }
      return await proxyExternalUrl(safeUrl.toString(), expectedMediaType, origin);
    }

    const match = resultUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return withPublicMediaCacheControl(new NextResponse('Invalid media format', { status: 400 }));
    }

    const mimeType = match[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    return createMediaResponse(buffer, mimeType);
  } catch (error) {
    console.error('[Public Media API] Error:', error);
    return withPublicMediaCacheControl(new NextResponse('Internal Server Error', { status: 500 }));
  }
}

async function proxyExternalUrl(url: string, expectedMediaType: ExpectedMediaType, origin: string): Promise<NextResponse> {
  try {
    const maxBytes = expectedMediaType === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    const { buffer, contentType } = await fetchExternalBuffer(url, {
      origin,
      allowRelative: false,
      maxBytes,
      timeoutMs: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const isValidImage = expectedMediaType === 'image' && contentType.startsWith('image/');
    const isValidVideo = expectedMediaType === 'video' && contentType.startsWith('video/');
    if (!isValidImage && !isValidVideo) {
      return withPublicMediaCacheControl(new NextResponse('Content type mismatch', { status: 415 }));
    }

    return createMediaResponse(buffer, contentType);
  } catch (error) {
    console.error('[Public Media API] Proxy error:', error);
    return withPublicMediaCacheControl(new NextResponse('Proxy error', { status: 502 }));
  }
}

function createMediaResponse(buffer: Buffer, contentType: string): NextResponse {
  return withPublicMediaCacheControl(
    new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
      },
    })
  );
}
