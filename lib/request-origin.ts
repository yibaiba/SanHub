import type { NextRequest } from 'next/server';

function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

export function getRequestOrigin(request: NextRequest): string {
  const originHeader = normalizeOrigin(request.headers.get('origin'));
  if (originHeader) {
    return originHeader;
  }

  const refererOrigin = normalizeOrigin(request.headers.get('referer'));
  if (refererOrigin) {
    return refererOrigin;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, '') || 'http';

  if (host) {
    return `${protocol}://${host}`;
  }

  return request.nextUrl.origin;
}
