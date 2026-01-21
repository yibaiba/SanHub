/**
 * Helper functions for Video Generation Page
 */

// Local type definitions
type VideoEngine = 'sora' | 'veo';
type CreationMode = 'normal' | 'remix' | 'storyboard';
type Veo3Mode = 't2v' | 'i2v' | 'r2v';

interface FileData {
  data: string;
  mimeType: string;
  preview: string;
  file?: File;
}

// Video styles for Sora normal mode
export const VIDEO_STYLES = [
  { id: 'festive', name: 'Festive', image: '/styles/Festive.jpg' },
  { id: 'retro', name: 'Retro', image: '/styles/Retro.jpg' },
  { id: 'news', name: 'News', image: '/styles/News.jpg' },
  { id: 'selfie', name: 'Selfie', image: '/styles/Selfie.jpg' },
  { id: 'handheld', name: 'Handheld', image: '/styles/Handheld.jpg' },
  { id: 'anime', name: 'Anime', image: '/styles/Anime.jpg' },
  { id: 'comic', name: 'Comic', image: '/styles/Comic.jpg' },
  { id: 'golden', name: 'Golden', image: '/styles/Golden.jpg' },
  { id: 'vintage', name: 'Vintage', image: '/styles/Vintage.jpg' },
];

/**
 * Get maximum allowed images based on engine and mode
 */
export function getMaxImages(
  engine: VideoEngine,
  mode: CreationMode | Veo3Mode
): number {
  if (engine === 'veo') {
    if (mode === 't2v') return 0;
    if (mode === 'i2v') return 2;
    if (mode === 'r2v') return 3;
  }
  return 10;
}

/**
 * Get current prompt based on engine and mode
 */
export function getCurrentPrompt(
  engine: VideoEngine,
  creationMode: CreationMode,
  prompt: string,
  storyboardPrompt: string
): string {
  if (engine === 'sora') {
    if (creationMode === 'normal') return prompt;
    if (creationMode === 'remix') return prompt;
    if (creationMode === 'storyboard') return storyboardPrompt;
  }
  return prompt;
}

/**
 * Prepare generation payload for API submission
 */
export async function prepareGenerationPayload(params: {
  prompt: string;
  modelId: string;
  aspectRatio: string;
  duration: string;
  files: FileData[];
  engine: VideoEngine;
  creationMode: CreationMode;
  selectedStyle: string | null;
  remixUrl: string;
}) {
  const { prompt, modelId, aspectRatio, duration, files, engine, creationMode, selectedStyle, remixUrl } = params;
  
  const payload: any = {
    prompt,
    model: modelId,
    aspectRatio,
    duration,
  };

  // Add files if present
  if (files.length > 0) {
    const { fileToBase64 } = await import('@/lib/utils');
    payload.files = await Promise.all(
      files.map(async (f) => ({
        mimeType: f.mimeType,
        data: f.data || (await fileToBase64(f.file!)),
      }))
    );
  }

  // Add style for Sora normal mode
  if (engine === 'sora' && creationMode === 'normal' && selectedStyle) {
    payload.style_id = selectedStyle;
  }

  // Add remix URL for Sora remix mode
  if (engine === 'sora' && creationMode === 'remix') {
    payload.remix_target_id = remixUrl;
  }

  return payload;
}
