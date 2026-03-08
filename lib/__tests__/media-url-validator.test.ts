import { describe, expect, it } from 'vitest';
import { validatePublishableMediaUrl } from '../media-url-validator';

describe('publishable media url validation', () => {
  it('rejects non-media extensions for published images and videos', () => {
    expect(validatePublishableMediaUrl('https://example.com/file.json', 'image')).toEqual(
      expect.objectContaining({ valid: false })
    );
    expect(validatePublishableMediaUrl('https://example.com/file.txt', 'video')).toEqual(
      expect.objectContaining({ valid: false })
    );
  });

  it('accepts extensionless absolute urls when media type is otherwise allowed', () => {
    expect(validatePublishableMediaUrl('https://example.com/media/serve?id=1', 'image')).toEqual(
      expect.objectContaining({ valid: true })
    );
  });

  it('accepts known local media files and rejects unknown ones', () => {
    expect(validatePublishableMediaUrl('file:gen-1.mp4', 'video')).toEqual(
      expect.objectContaining({ valid: true })
    );
    expect(validatePublishableMediaUrl('file:gen-1.bin', 'video')).toEqual(
      expect.objectContaining({ valid: false })
    );
  });
});
