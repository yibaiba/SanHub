import { describe, expect, it } from 'vitest';
import {
  buildCommunityMediaProxyUrl,
  buildRawMediaDownloadUrl,
  inferDownloadExtension,
  isMediaProxyUrl,
} from '../media-download';

describe('media-download helpers', () => {
  it('prefers the file extension from the url when present', () => {
    expect(inferDownloadExtension('https://cdn.example.com/file.webm?download=1', 'image/png')).toBe('webm');
  });

  it('falls back to attachment kind for videos', () => {
    expect(inferDownloadExtension('https://cdn.example.com/file', 'video/mp4')).toBe('mp4');
  });

  it('falls back to attachment kind for images', () => {
    expect(inferDownloadExtension('https://cdn.example.com/file', 'image/jpeg')).toBe('jpg');
  });

  it('builds a same-origin proxy url for community downloads', () => {
    expect(buildCommunityMediaProxyUrl('https://cdn.example.com/file.mp4', 'video/mp4'))
      .toBe('/api/community/media?url=https%3A%2F%2Fcdn.example.com%2Ffile.mp4&kind=video%2Fmp4');
  });

  it('detects relative and same-origin absolute media proxy urls', () => {
    expect(isMediaProxyUrl('/api/media/gen-1')).toBe(true);
    expect(isMediaProxyUrl('https://example.com/api/media/gen-1')).toBe(true);
    expect(isMediaProxyUrl('https://example.com/file.mp4')).toBe(false);
  });

  it('appends raw=true to relative media proxy urls', () => {
    expect(buildRawMediaDownloadUrl('/api/media/gen-1')).toBe('/api/media/gen-1?raw=true');
  });

  it('appends raw=true to same-origin absolute media proxy urls', () => {
    expect(buildRawMediaDownloadUrl('https://example.com/api/media/gen-1'))
      .toBe('https://example.com/api/media/gen-1?raw=true');
  });
});
