import type { WorkspaceNode } from '@/types';

const PURE_MODE_SUFFIX = '\n\n(IMPORTANT: Output ONLY the resulting prompt text. Do not include any conversational filler, intro, outro, or explanations. Just the raw prompt.)';

export function getStoryboardSystemPrompt(): string {
  return `You are a professional film director and storyboard artist.
Please convert the user's story or description into a structured storyboard list.

IMPORTANT: Analyze the content and recommend the best frame_mode:
- "first_frame": Only generate first frame for each scene (fast, good for prototyping)
- "first_last": Generate first and last frame (good for transitions and motion control)
- "keyframes": Generate multiple keyframes based on scene complexity (best quality, slower)

Output MUST be a valid JSON object with the following structure:
{
  "title": "Project title based on content",
  "frame_mode": "first_frame | first_last | keyframes",
  "metadata": {
    "total_duration": "estimated total duration",
    "style": "visual style description",
    "genre": "content genre"
  },
  "scenes": [
    {
      "id": 1,
      "visual_prompt": "Detailed image generation prompt for the scene (English, highly descriptive for AI image generators)",
      "video_prompt": "Motion description focusing on camera movement and subject action (English)",
      "duration": "5s",
      "aspect_ratio": "16:9",
      "shot_type": "wide_shot | medium_shot | close_up | extreme_close_up | over_shoulder | pov",
      "frame_role": "keyframe | first_frame | last_frame | storyboard_only",
      "characters": ["list of character names appearing in this scene"],
      "location": "scene location description",
      "dialogue": "any dialogue in this scene (optional)",
      "mood": "emotional atmosphere (e.g., tense, joyful, melancholic)",
      "transition": "transition to next scene (cut, fade, dissolve, wipe)"
    }
  ]
}

Guidelines:
- visual_prompt should be highly descriptive, including lighting, color palette, composition
- video_prompt should focus on motion and camera work
- Use "frame_role": "storyboard_only" for static reference shots
- Use "frame_role": "first_frame" for scenes that will be animated
- Use "frame_role": "last_frame" for ending frames when frame_mode is "first_last"
- characters array helps track consistency across scenes
- location helps maintain scene continuity
- Do not output anything else except the JSON.`;
}

export type WorkspaceChatRequestBody = {
  modelId?: string;
  prompt: string;
  images: string[];
  systemPrompt?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export function buildWorkspaceChatRequestBody(
  node: Pick<WorkspaceNode, 'data'>,
  prompt: string,
  images: string[],
  modelId?: string
): WorkspaceChatRequestBody {
  let finalPrompt = prompt;
  if (node.data.pureMode) {
    finalPrompt = `${finalPrompt}${PURE_MODE_SUFFIX}`;
  }

  const requestBody: WorkspaceChatRequestBody = {
    modelId: modelId || node.data.chatModelId,
    prompt: finalPrompt,
    images,
  };

  if (node.data.storyboardMode) {
    requestBody.systemPrompt = getStoryboardSystemPrompt();
    if (node.data.chatMessages && node.data.chatMessages.length > 0) {
      requestBody.history = node.data.chatMessages;
    }
  }

  return requestBody;
}
