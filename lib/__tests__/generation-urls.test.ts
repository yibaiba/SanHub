import { describe, expect, it } from 'vitest';
import {
  buildGenerationMediaProxyPath,
  buildGenerationMediaProxyUrl,
  buildGenerationSharePath,
  buildGenerationShareUrl,
  extractGenerationIdFromMediaProxyUrl,
  mapOwnerGenerationMediaUrl,
} from '../generation-urls';

describe('generation url helpers', () => {
  it('builds owner media proxy paths and absolute urls', () => {
    expect(buildGenerationMediaProxyPath('gen-1')).toBe('/api/media/gen-1');
    expect(buildGenerationMediaProxyUrl('http://localhost', 'gen-1')).toBe('http://localhost/api/media/gen-1');
  });

  it('builds relative and absolute public share urls', () => {
    expect(buildGenerationSharePath('share-123')).toBe('/g/share-123');
    expect(buildGenerationShareUrl('http://localhost', 'share-123')).toBe('http://localhost/g/share-123');
  });

  it('extracts generation ids from relative and absolute media proxy urls', () => {
    expect(extractGenerationIdFromMediaProxyUrl('/api/media/gen-1')).toBe('gen-1');
    expect(extractGenerationIdFromMediaProxyUrl('http://localhost/api/media/gen-2')).toBe('gen-2');
    expect(extractGenerationIdFromMediaProxyUrl('https://example.com/file.png')).toBe(null);
  });

  it('maps owner generation result urls onto the absolute media proxy', () => {
    expect(
      mapOwnerGenerationMediaUrl({
        id: 'gen-1',
        userId: 'user-1',
        type: 'sora-video',
        prompt: 'test',
        params: {},
        resultUrl: 'https://example.com/video.mp4',
        cost: 10,
        status: 'completed',
        createdAt: 1,
        updatedAt: 2,
      }).resultUrl
    ).toBe('/api/media/gen-1');
  });
});
