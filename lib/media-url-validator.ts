export type ExpectedMediaType = 'image' | 'video';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg']);

type ValidationResult = {
  valid: boolean;
  normalizedUrl: string;
  reason?: string;
};

type TextValidationResult = {
  valid: boolean;
  normalizedText: string;
  reason?: string;
};

export function resolveExpectedMediaType(generationType: string): ExpectedMediaType | null {
  const normalizedType = generationType.toLowerCase();
  if (!normalizedType) return null;

  if (normalizedType === 'video-capture') return 'image';
  if (normalizedType === 'chat' || normalizedType === 'character-card') return null;
  if (normalizedType.includes('image')) return 'image';
  if (normalizedType.includes('video')) return 'video';
  return null;
}

function parseDataUrlMimeType(url: string): string | null {
  const match = url.match(/^data:([^;,]+);base64,[A-Za-z0-9+/=]+$/i);
  if (!match) return null;
  return match[1].toLowerCase();
}

function getPathExtension(url: URL): string | null {
  const pathname = url.pathname || '';
  const filename = pathname.split('/').pop() || '';
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return null;
  return filename.slice(dotIndex + 1).toLowerCase();
}

function isTypeCompatibleByExtension(extension: string, expectedType: ExpectedMediaType): boolean {
  if (expectedType === 'image') {
    return !VIDEO_EXTENSIONS.has(extension);
  }
  return !IMAGE_EXTENSIONS.has(extension);
}

function isTypeCompatibleByMimeType(mimeType: string, expectedType: ExpectedMediaType): boolean {
  if (expectedType === 'image') return mimeType.startsWith('image/');
  return mimeType.startsWith('video/');
}

export function validateGeneratedMediaUrl(rawUrl: string, expectedType: ExpectedMediaType): ValidationResult {
  const normalizedUrl = rawUrl.trim();
  if (!normalizedUrl) {
    return { valid: false, normalizedUrl, reason: 'URL is empty' };
  }

  if (normalizedUrl.startsWith('data:')) {
    const mimeType = parseDataUrlMimeType(normalizedUrl);
    if (!mimeType) {
      return { valid: false, normalizedUrl, reason: 'Invalid data URL format' };
    }
    if (!isTypeCompatibleByMimeType(mimeType, expectedType)) {
      return { valid: false, normalizedUrl, reason: `Expected ${expectedType} data URL but got ${mimeType}` };
    }
    return { valid: true, normalizedUrl };
  }

  if (normalizedUrl.startsWith('file:')) {
    const filename = normalizedUrl.slice('file:'.length).trim();
    if (!filename) {
      return { valid: false, normalizedUrl, reason: 'Invalid local file URL' };
    }
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex > 0 && dotIndex < filename.length - 1) {
      const extension = filename.slice(dotIndex + 1).toLowerCase();
      if (!isTypeCompatibleByExtension(extension, expectedType)) {
        return { valid: false, normalizedUrl, reason: `Unexpected file extension: .${extension}` };
      }
    }
    return { valid: true, normalizedUrl };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return { valid: false, normalizedUrl, reason: 'Invalid absolute URL' };
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { valid: false, normalizedUrl, reason: `Unsupported protocol: ${parsedUrl.protocol}` };
  }

  const extension = getPathExtension(parsedUrl);
  if (extension && !isTypeCompatibleByExtension(extension, expectedType)) {
    return { valid: false, normalizedUrl, reason: `Unexpected URL extension: .${extension}` };
  }

  return { valid: true, normalizedUrl };
}

function normalizeGeneratedText(rawText: unknown): string {
  if (typeof rawText === 'string') {
    return rawText;
  }

  if (!Array.isArray(rawText)) {
    return '';
  }

  const parts: string[] = [];
  for (const item of rawText) {
    if (typeof item === 'string') {
      parts.push(item);
      continue;
    }
    if (!item || typeof item !== 'object') {
      continue;
    }
    const textValue = (item as { text?: unknown }).text;
    if (typeof textValue === 'string') {
      parts.push(textValue);
    }
  }

  return parts.join('\n');
}

export function validateGeneratedTextContent(rawText: unknown): TextValidationResult {
  const normalizedText = normalizeGeneratedText(rawText).trim();
  if (!normalizedText) {
    return { valid: false, normalizedText: '', reason: 'Text is empty' };
  }
  return { valid: true, normalizedText };
}
