import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/utils', () => ({
  fileToBase64: vi.fn(),
}));

import { fileToBase64 } from '@/lib/utils';
import {
  getCurrentPrompt,
  getMaxImages,
  prepareGenerationPayload,
} from '../utils/video-page-helpers';

const mockedFileToBase64 = vi.mocked(fileToBase64);

describe('video page helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the correct max image count for each engine mode', () => {
    expect(getMaxImages('sora', 'normal')).toBe(10);
    expect(getMaxImages('veo', 't2v')).toBe(0);
    expect(getMaxImages('veo', 'i2v')).toBe(2);
    expect(getMaxImages('veo', 'r2v')).toBe(3);
  });

  it('uses storyboard prompt only for sora storyboard mode', () => {
    expect(getCurrentPrompt('sora', 'normal', 'prompt', 'storyboard')).toBe('prompt');
    expect(getCurrentPrompt('sora', 'storyboard', 'prompt', 'storyboard')).toBe('storyboard');
    expect(getCurrentPrompt('veo', 'storyboard', 'prompt', 'storyboard')).toBe('prompt');
  });

  it('reuses inline file data and appends style for sora normal mode', async () => {
    const payload = await prepareGenerationPayload({
      prompt: 'make a cinematic clip',
      modelId: 'sora-main',
      aspectRatio: 'landscape',
      duration: '10s',
      files: [
        {
          data: 'inline-data',
          mimeType: 'image/png',
          preview: 'blob:preview-1',
        },
      ],
      engine: 'sora',
      creationMode: 'normal',
      selectedStyle: 'anime',
      remixUrl: '',
    });

    expect(mockedFileToBase64).not.toHaveBeenCalled();
    expect(payload).toEqual({
      prompt: 'make a cinematic clip',
      model: 'sora-main',
      aspectRatio: 'landscape',
      duration: '10s',
      style_id: 'anime',
      files: [
        {
          mimeType: 'image/png',
          data: 'inline-data',
        },
      ],
    });
  });

  it('encodes file inputs and appends remix target for sora remix mode', async () => {
    mockedFileToBase64.mockResolvedValueOnce('encoded-file');

    const payload = await prepareGenerationPayload({
      prompt: 'remix this clip',
      modelId: 'sora-main',
      aspectRatio: 'landscape',
      duration: '10s',
      files: [
        {
          data: '',
          mimeType: 'image/png',
          preview: 'blob:preview-2',
          file: {} as File,
        },
      ],
      engine: 'sora',
      creationMode: 'remix',
      selectedStyle: 'anime',
      remixUrl: 'share-target-1',
    });

    expect(mockedFileToBase64).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      prompt: 'remix this clip',
      model: 'sora-main',
      aspectRatio: 'landscape',
      duration: '10s',
      remix_target_id: 'share-target-1',
      files: [
        {
          mimeType: 'image/png',
          data: 'encoded-file',
        },
      ],
    });
  });
});
