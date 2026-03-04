import { NextRequest } from 'next/server';
import { getVideoStatus } from '@/lib/sora-api';
import { buildErrorResponse, extractBearerToken, isAuthorized } from '@/lib/v1';

export const dynamic = 'force-dynamic';

function statusFromError(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('not found') || lower.includes('404')) return 404;
  if (lower.includes('unauthorized') || lower.includes('401')) return 401;
  return 500;
}

export async function GET(request: NextRequest, context: { params: { video_id: string } }) {
  const token = extractBearerToken(request);
  if (!isAuthorized(token)) {
    return buildErrorResponse('Unauthorized', 401, 'authentication_error');
  }

  const videoId = context.params.video_id;
  if (!videoId) {
    return buildErrorResponse('Video ID is required', 400);
  }

  try {
    const status = await getVideoStatus(videoId);
    return Response.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get video status';
    const statusCode = statusFromError(message);
    return buildErrorResponse(message, statusCode, statusCode === 500 ? 'server_error' : 'invalid_request_error');
  }
}
