const KNOWN_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'svg',
  'avif',
  'mp4',
  'mov',
  'webm',
  'mkv',
  'avi',
  'm4v',
  'mpg',
  'mpeg',
]);

function getExtensionFromUrl(url: string): string | null {
  const pathname = url.split('?')[0]?.split('#')[0] || '';
  const filename = pathname.split('/').pop() || '';
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return null;
  }

  const extension = filename.slice(dotIndex + 1).toLowerCase();
  return KNOWN_EXTENSIONS.has(extension) ? extension : null;
}

function getExtensionFromKind(kind?: string): string | null {
  const value = (kind || '').trim().toLowerCase();
  if (!value) return null;

  if (value.startsWith('video/')) {
    const subtype = value.slice('video/'.length).split(/[+;]/)[0];
    return subtype || 'mp4';
  }
  if (value.startsWith('image/')) {
    const subtype = value.slice('image/'.length).split(/[+;]/)[0];
    if (subtype === 'jpeg') return 'jpg';
    return subtype || 'png';
  }
  if (value.includes('video')) return 'mp4';
  if (value.includes('image')) return 'png';
  return null;
}

export function inferDownloadExtension(url: string, kind?: string, fallback = 'png'): string {
  return getExtensionFromUrl(url) || getExtensionFromKind(kind) || fallback;
}

export function isMediaProxyUrl(url: string): boolean {
  if (url.startsWith('/api/media/')) {
    return true;
  }

  try {
    return new URL(url).pathname.startsWith('/api/media/');
  } catch {
    return false;
  }
}

export function buildRawMediaDownloadUrl(url: string): string {
  if (!isMediaProxyUrl(url)) {
    return url;
  }

  if (url.startsWith('/')) {
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.set('raw', 'true');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  const parsed = new URL(url);
  parsed.searchParams.set('raw', 'true');
  return parsed.toString();
}

export function buildCommunityMediaProxyUrl(url: string, kind?: string): string {
  const searchParams = new URLSearchParams({ url });
  if (kind) {
    searchParams.set('kind', kind);
  }
  return `/api/community/media?${searchParams.toString()}`;
}
