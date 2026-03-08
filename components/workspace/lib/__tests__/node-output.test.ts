import { describe, expect, it } from 'vitest';
import { getNodeOutputUpdates } from '../node-output';

describe('node-output helper', () => {
  it('treats relative media urls as media outputs for workflow nodes', () => {
    expect(getNodeOutputUpdates('video', '/api/media/gen-1')).toEqual({
      outputUrl: '/api/media/gen-1',
      outputType: 'video',
    });
  });

  it('keeps chat text outputs as text fields', () => {
    expect(getNodeOutputUpdates('chat', 'hello world')).toEqual({
      chatOutput: 'hello world',
      templateOutput: 'hello world',
    });
  });
});
