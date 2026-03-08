import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchExternalBuffer } from '@/lib/safe-fetch';

export const dynamic = 'force-dynamic';

const COMMUNITY_MEDIA_CACHE_CONTROL = 'private, no-store, max-age=0, must-revalidate';
const COMMUNITY_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

function withCommunityMediaHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', COMMUNITY_MEDIA_CACHE_CONTROL);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Vary', 'Cookie');
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return withCommunityMediaHeaders(new NextResponse('Unauthorized', { status: 401 }));
    }

    const remoteUrl = request.nextUrl.searchParams.get('url') || '';
    if (!remoteUrl) {
      return withCommunityMediaHeaders(new NextResponse('Missing url', { status: 400 }));
    }

    const origin = request.nextUrl.origin;
    const { buffer, contentType } = await fetchExternalBuffer(remoteUrl, {
      origin,
      allowRelative: false,
      maxBytes: COMMUNITY_MEDIA_MAX_BYTES,
      timeoutMs: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    return withCommunityMediaHeaders(
      new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
        },
      })
    );
  } catch (error) {
    console.error('[Community Media API] Error:', error);
    return withCommunityMediaHeaders(new NextResponse('Bad Gateway', { status: 502 }));
  }
}
