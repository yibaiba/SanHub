/**
 * Storyboard Parser
 *
 * Parses cinematic storyboard format (storyboardContent) into structured scenes.
 * Supports both quick mode (scenes array) and cinematic mode (storyboard array).
 */

import type { StoryboardScene, StoryboardData, StoryboardCharacter, CameraMovement } from '@/types';

// Raw cinematic storyboard format from AI
interface CinematicStoryboardRaw {
  title?: string;
  frame_mode?: string;
  storyboard_mode?: string;
  total_duration?: number;
  characters?: Array<{
    name: string;
    personality?: string;
    voiceStyle?: string;
    description?: string;
  }>;
  storyboard?: Array<{
    storyboardContent: string;
  }>;
  scenes?: StoryboardScene[]; // For quick mode compatibility
}

// Parsed shot segment
interface ParsedShot {
  timeRange: string;
  startTime: number;
  endTime: number;
  duration: string;
  shotType: string;
  cameraAngle: string;
  action: string;
  cameraMovement: CameraMovement;
  transition: string;
}

/**
 * Parse time range string like "0-0.1s" or "0.1-2.5s"
 */
function parseTimeRange(timeStr: string): { start: number; end: number } {
  // Match patterns like "0-0.1s", "0.1-2.5s", "2.5-5.0s"
  const match = timeStr.match(/^(\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)\s*s?$/i);
  if (match) {
    return {
      start: parseFloat(match[1]),
      end: parseFloat(match[2]),
    };
  }
  // Fallback: try to extract any numbers
  const numbers = timeStr.match(/\d+(?:\.\d+)?/g);
  if (numbers && numbers.length >= 2) {
    return {
      start: parseFloat(numbers[0]),
      end: parseFloat(numbers[1]),
    };
  }
  return { start: 0, end: 5 }; // Default 5 seconds
}

/**
 * Extract camera movement from description
 */
function extractCameraMovement(text: string): CameraMovement {
  const lowerText = text.toLowerCase();

  // Map keywords to CameraMovement values
  if (lowerText.includes('push in') || lowerText.includes('pushing in') || lowerText.includes('move forward')) {
    return 'push_in';
  }
  if (lowerText.includes('pull out') || lowerText.includes('pulling out') || lowerText.includes('pull back')) {
    return 'pull_out';
  }
  if (lowerText.includes('pan left') || lowerText.includes('panning left')) {
    return 'pan_left';
  }
  if (lowerText.includes('pan right') || lowerText.includes('panning right')) {
    return 'pan_right';
  }
  if (lowerText.includes('pan')) {
    // Generic pan, default to pan_left
    return 'pan_left';
  }
  if (lowerText.includes('tilt up') || lowerText.includes('tilting up')) {
    return 'tilt_up';
  }
  if (lowerText.includes('tilt down') || lowerText.includes('tilting down')) {
    return 'tilt_down';
  }
  if (lowerText.includes('tilt')) {
    // Generic tilt, default to tilt_up
    return 'tilt_up';
  }
  if (lowerText.includes('dolly') || lowerText.includes('lateral')) {
    return 'dolly';
  }
  if (lowerText.includes('crane')) {
    // Crane is similar to dolly
    return 'dolly';
  }
  if (lowerText.includes('tracking') || lowerText.includes('follow') || lowerText.includes('track')) {
    return 'tracking';
  }
  if (lowerText.includes('zoom in') || lowerText.includes('zooming in')) {
    return 'zoom_in';
  }
  if (lowerText.includes('zoom out') || lowerText.includes('zooming out')) {
    return 'zoom_out';
  }
  if (lowerText.includes('zoom')) {
    // Generic zoom, default to zoom_in
    return 'zoom_in';
  }
  if (lowerText.includes('handheld') || lowerText.includes('hand held') || lowerText.includes('shaky')) {
    return 'handheld';
  }
  if (lowerText.includes('static') || lowerText.includes('steady') || lowerText.includes('hold')) {
    return 'static';
  }

  return 'static';
}

/**
 * Extract shot type from description
 */
function extractShotType(text: string): string {
  const shotTypes = [
    'extreme close-up',
    'close-up',
    'medium close-up',
    'medium shot',
    'medium',
    'wide shot',
    'wide',
    'establishing',
    'over-shoulder',
    'pov',
    'aerial',
    'bird eye',
    'low angle',
    'high angle',
  ];

  const lowerText = text.toLowerCase();
  for (const shotType of shotTypes) {
    if (lowerText.includes(shotType)) {
      return shotType.replace(/\s+/g, '_');
    }
  }
  return 'medium_shot';
}

/**
 * Parse a single storyboardContent string into a shot
 * New format: "Scene N (start-end): description..." - each entry is ONE video
 * Old format: "0-2s: action [Cut] 2-4s: action" - multiple segments with transitions
 */
function parseStoryboardContent(content: string): ParsedShot[] {
  const shots: ParsedShot[] = [];

  // New format: "Scene N (start-ends): description"
  const sceneMatch = content.match(/^Scene\s*\d+\s*\((\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)\s*s?\)\s*[:：]?\s*/i);
  if (sceneMatch) {
    const start = parseFloat(sceneMatch[1]);
    const end = parseFloat(sceneMatch[2]);
    const description = content.slice(sceneMatch[0].length).trim();

    shots.push({
      timeRange: `${start}-${end}s`,
      startTime: start,
      endTime: end,
      duration: `${(end - start).toFixed(1)}s`,
      shotType: extractShotType(description),
      cameraAngle: description.toLowerCase().includes('low angle') ? 'low' :
                   description.toLowerCase().includes('high angle') ? 'high' : 'level',
      action: description,
      cameraMovement: extractCameraMovement(description),
      transition: 'cut',
    });
    return shots;
  }

  // Old format: Split by transitions [Cut], [Fade], [Dissolve], [Wipe]
  const segments = content.split(/\s*\[(Cut|Fade|Dissolve|Wipe|Match Cut)\]\s*/i);

  let currentTransition = 'cut';

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim();

    // Check if this segment is a transition marker
    if (/^(Cut|Fade|Dissolve|Wipe|Match Cut)$/i.test(segment)) {
      currentTransition = segment.toLowerCase().replace(' ', '_');
      continue;
    }

    if (!segment) continue;

    // Parse time range at the beginning: "0-0.1s:" or "0.1-2s:"
    const timeMatch = segment.match(/^(\d+(?:\.\d+)?\s*[-~～]\s*\d+(?:\.\d+)?)\s*s?\s*[:：]/);

    if (timeMatch) {
      const timeRange = timeMatch[1] + 's';
      const { start, end } = parseTimeRange(timeMatch[1]);
      const description = segment.slice(timeMatch[0].length).trim();

      shots.push({
        timeRange,
        startTime: start,
        endTime: end,
        duration: `${(end - start).toFixed(1)}s`,
        shotType: extractShotType(description),
        cameraAngle: description.includes('low angle') ? 'low' :
                     description.includes('high angle') ? 'high' : 'level',
        action: description,
        cameraMovement: extractCameraMovement(description),
        transition: currentTransition,
      });
    } else {
      // No time range found, treat as continuation or standalone segment
      // Try to extract any time information
      const anyTimeMatch = segment.match(/(\d+(?:\.\d+)?)\s*[-~～]\s*(\d+(?:\.\d+)?)/);
      if (anyTimeMatch) {
        const start = parseFloat(anyTimeMatch[1]);
        const end = parseFloat(anyTimeMatch[2]);

        shots.push({
          timeRange: `${start}-${end}s`,
          startTime: start,
          endTime: end,
          duration: `${(end - start).toFixed(1)}s`,
          shotType: extractShotType(segment),
          cameraAngle: 'level',
          action: segment,
          cameraMovement: extractCameraMovement(segment),
          transition: currentTransition,
        });
      }
    }

    // Reset transition for next segment
    currentTransition = 'cut';
  }

  return shots;
}

/**
 * Convert parsed shots to StoryboardScene array
 */
function shotsToScenes(shots: ParsedShot[], baseId: number = 1): StoryboardScene[] {
  return shots.map((shot, index) => ({
    id: baseId + index,
    visual_prompt: shot.action,
    video_prompt: `${shot.cameraMovement} camera. ${shot.action}`,
    duration: shot.duration,
    aspect_ratio: '16:9',
    shot_type: shot.shotType,
    frame_role: 'first_frame' as const,
    camera_movement: shot.cameraMovement,
    transition: shot.transition,
    timeRange: shot.timeRange,
    startTime: shot.startTime,
    endTime: shot.endTime,
    selected: true,
  }));
}

/**
 * Parse cinematic storyboard format to StoryboardData
 *
 * Handles both formats:
 * 1. Cinematic: { storyboard: [{ storyboardContent: "..." }] }
 * 2. Quick: { scenes: [...] }
 */
export function parseCinematicStoryboard(raw: CinematicStoryboardRaw): StoryboardData {
  // If already has scenes array (quick mode or already parsed), return as-is
  if (raw.scenes && raw.scenes.length > 0) {
    return {
      title: raw.title,
      frame_mode: (raw.frame_mode as 'first_frame' | 'first_last' | 'keyframes') || 'first_frame',
      storyboard_mode: (raw.storyboard_mode as 'quick' | 'cinematic') || 'quick',
      scenes: raw.scenes,
      characters: raw.characters?.map(c => ({
        name: c.name,
        description: c.description || c.name,
        personality: c.personality,
        voiceStyle: c.voiceStyle,
      })),
      metadata: raw.total_duration ? {
        total_duration: `${raw.total_duration}s`,
        style: '',
        genre: '',
      } : undefined,
    };
  }

  // Parse cinematic format (storyboard array)
  const allScenes: StoryboardScene[] = [];
  let sceneId = 1;

  if (raw.storyboard) {
    for (const item of raw.storyboard) {
      if (item.storyboardContent) {
        const shots = parseStoryboardContent(item.storyboardContent);
        const scenes = shotsToScenes(shots, sceneId);
        allScenes.push(...scenes);
        sceneId += scenes.length;
      }
    }
  }

  // Convert characters format
  const characters: StoryboardCharacter[] = (raw.characters || []).map(c => ({
    name: c.name,
    description: c.description || c.name,
    personality: c.personality,
    voiceStyle: c.voiceStyle,
  }));

  return {
    title: raw.title,
    frame_mode: (raw.frame_mode as 'first_frame' | 'first_last' | 'keyframes') || 'first_frame',
    storyboard_mode: 'cinematic',
    scenes: allScenes,
    characters: characters.length > 0 ? characters : undefined,
    metadata: raw.total_duration ? {
      total_duration: `${raw.total_duration}s`,
      style: '',
      genre: '',
    } : undefined,
  };
}

/**
 * Check if the raw data is in cinematic format
 */
export function isCinematicFormat(raw: unknown): raw is CinematicStoryboardRaw {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return Array.isArray(obj.storyboard) && obj.storyboard.some(
    (item: unknown) => item && typeof item === 'object' && 'storyboardContent' in (item as object)
  );
}

/**
 * Auto-detect and parse storyboard data
 */
export function parseStoryboardAuto(raw: unknown): StoryboardData | null {
  if (!raw || typeof raw !== 'object') return null;

  try {
    return parseCinematicStoryboard(raw as CinematicStoryboardRaw);
  } catch (error) {
    console.error('[parseStoryboardAuto] Failed to parse storyboard:', error);
    return null;
  }
}
