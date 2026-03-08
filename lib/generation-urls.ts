import type { Generation } from '@/types';

export function buildGenerationMediaProxyPath(id: string): string {
  return `/api/media/${id}`;
}

export function buildGenerationMediaProxyUrl(origin: string, id: string): string {
  return `${origin}${buildGenerationMediaProxyPath(id)}`;
}

export function extractGenerationIdFromMediaProxyUrl(url: string): string | null {
  try {
    const parsed = url.startsWith('/') ? new URL(url, 'http://localhost') : new URL(url);
    const match = parsed.pathname.match(/^\/api\/media\/([^/?#]+)$/i);
    return match?.[1] || null;
  } catch {
    const match = url.match(/\/api\/media\/([^/?#]+)/i);
    return match?.[1] || null;
  }
}

export function buildGenerationSharePath(shareId: string): string {
  return `/g/${shareId}`;
}

export function buildGenerationShareUrl(origin: string, shareId: string): string {
  return `${origin}${buildGenerationSharePath(shareId)}`;
}

export function mapOwnerGenerationMediaUrl(generation: Generation): Generation {
  if (!generation.resultUrl) {
    return generation;
  }

  return {
    ...generation,
    resultUrl: buildGenerationMediaProxyPath(generation.id),
  };
}
