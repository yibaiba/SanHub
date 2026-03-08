import { describe, expect, it } from 'vitest';
import { buildWorkspaceChatRequestBody, getStoryboardSystemPrompt } from '../chat-request';

const baseNode = {
  data: {
    chatModelId: 'chat-1',
    pureMode: false,
    storyboardMode: false,
    chatMessages: [],
  },
} as any;

describe('chat-request helpers', () => {
  it('appends pure-mode instruction to the prompt', () => {
    const request = buildWorkspaceChatRequestBody(
      { ...baseNode, data: { ...baseNode.data, pureMode: true } },
      'Prompt body',
      []
    );

    expect(request.prompt).toContain('Prompt body');
    expect(request.prompt).toContain('Output ONLY the resulting prompt text');
  });

  it('includes storyboard system prompt and history', () => {
    const request = buildWorkspaceChatRequestBody(
      {
        ...baseNode,
        data: {
          ...baseNode.data,
          storyboardMode: true,
          chatMessages: [{ role: 'assistant', content: 'old reply' }],
        },
      },
      'Storyboard prompt',
      ['https://example.com/image.png']
    );

    expect(request.systemPrompt).toBe(getStoryboardSystemPrompt());
    expect(request.history).toEqual([{ role: 'assistant', content: 'old reply' }]);
    expect(request.images).toEqual(['https://example.com/image.png']);
  });
});
