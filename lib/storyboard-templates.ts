import type { StoryboardData, StoryboardScene, StoryboardFrameMode } from '@/types';

export interface StoryboardTemplate {
  id: string;
  name: string;
  description: string;
  category: 'commercial' | 'narrative' | 'music' | 'social';
  duration: string;
  scenes: Partial<StoryboardScene>[];
  style_prefix?: string;
  frame_mode: StoryboardFrameMode;
}

export const STORYBOARD_TEMPLATES: StoryboardTemplate[] = [
  {
    id: 'product-showcase-30s',
    name: '产品展示 (30秒)',
    description: '适合产品广告、App介绍，突出产品特点',
    category: 'commercial',
    duration: '30s',
    frame_mode: 'first_frame',
    style_prefix: 'commercial photography, professional lighting, clean background',
    scenes: [
      {
        visual_prompt: 'Product hero shot, dramatic lighting, clean white background',
        video_prompt: 'slow zoom in, revealing product details',
        duration: '5s',
        shot_type: 'close_up',
        camera_movement: 'push_in',
      },
      {
        visual_prompt: 'Product in use, lifestyle context, natural lighting',
        video_prompt: 'smooth pan following the action',
        duration: '5s',
        shot_type: 'medium_shot',
        camera_movement: 'tracking',
      },
      {
        visual_prompt: 'Feature highlight, detail shot with soft focus background',
        video_prompt: 'static shot with subtle product movement',
        duration: '5s',
        shot_type: 'close_up',
        camera_movement: 'static',
      },
      {
        visual_prompt: 'Multiple angle showcase, 360 view concept',
        video_prompt: 'dolly around the product',
        duration: '5s',
        shot_type: 'medium_shot',
        camera_movement: 'dolly',
      },
      {
        visual_prompt: 'Brand logo and product together, minimal design',
        video_prompt: 'slow pull out to reveal brand logo',
        duration: '5s',
        shot_type: 'wide_shot',
        camera_movement: 'pull_out',
      },
      {
        visual_prompt: 'Call to action, product with brand tagline',
        video_prompt: 'static with subtle light animation',
        duration: '5s',
        shot_type: 'medium_shot',
        camera_movement: 'static',
      },
    ],
  },
  {
    id: 'story-intro-60s',
    name: '故事开场 (60秒)',
    description: '适合短剧、微电影开场，建立氛围和人物',
    category: 'narrative',
    duration: '60s',
    frame_mode: 'keyframes',
    style_prefix: 'cinematic, film grain, dramatic lighting, 2.39:1 aspect ratio feel',
    scenes: [
      {
        visual_prompt: 'Establishing shot, wide landscape or cityscape, setting the mood',
        video_prompt: 'slow aerial or crane shot, revealing the location',
        duration: '8s',
        shot_type: 'wide_shot',
        camera_movement: 'dolly',
      },
      {
        visual_prompt: 'Environment detail, symbolic object or location element',
        video_prompt: 'slow push in on meaningful detail',
        duration: '6s',
        shot_type: 'close_up',
        camera_movement: 'push_in',
      },
      {
        visual_prompt: 'Character introduction, silhouette or partial reveal',
        video_prompt: 'tracking shot following character movement',
        duration: '8s',
        shot_type: 'medium_shot',
        camera_movement: 'tracking',
      },
      {
        visual_prompt: 'Character face reveal, contemplative expression',
        video_prompt: 'slow push in to character face',
        duration: '6s',
        shot_type: 'close_up',
        camera_movement: 'push_in',
      },
      {
        visual_prompt: 'Character action, beginning their journey or task',
        video_prompt: 'handheld following the action',
        duration: '8s',
        shot_type: 'medium_shot',
        camera_movement: 'handheld',
      },
      {
        visual_prompt: 'Point of view shot, seeing what character sees',
        video_prompt: 'subjective camera movement',
        duration: '6s',
        shot_type: 'wide_shot',
        camera_movement: 'pan_right',
      },
      {
        visual_prompt: 'Reaction shot, character responding to discovery',
        video_prompt: 'static close up on emotional reaction',
        duration: '5s',
        shot_type: 'close_up',
        camera_movement: 'static',
      },
      {
        visual_prompt: 'Cliffhanger or hook, mysterious element introduced',
        video_prompt: 'dramatic zoom or reveal',
        duration: '5s',
        shot_type: 'medium_shot',
        camera_movement: 'zoom_in',
      },
      {
        visual_prompt: 'Title card moment, stylized frame for title overlay',
        video_prompt: 'slow motion or freeze frame transition',
        duration: '8s',
        shot_type: 'wide_shot',
        camera_movement: 'static',
      },
    ],
  },
  {
    id: 'mv-chorus-45s',
    name: 'MV副歌段 (45秒)',
    description: '适合音乐视频副歌高潮部分，节奏感强',
    category: 'music',
    duration: '45s',
    frame_mode: 'first_last',
    style_prefix: 'music video aesthetic, vibrant colors, dynamic lighting, stylized',
    scenes: [
      {
        visual_prompt: 'Artist performance, energetic pose, dramatic lighting',
        video_prompt: 'fast cut feel, camera shake on beat',
        duration: '5s',
        shot_type: 'medium_shot',
        camera_movement: 'handheld',
      },
      {
        visual_prompt: 'Abstract visual, color explosion or light patterns',
        video_prompt: 'rapid zoom out with light trails',
        duration: '4s',
        shot_type: 'close_up',
        camera_movement: 'zoom_out',
      },
      {
        visual_prompt: 'Dance sequence, full body movement, synchronized',
        video_prompt: 'tracking shot following dance movement',
        duration: '6s',
        shot_type: 'wide_shot',
        camera_movement: 'tracking',
      },
      {
        visual_prompt: 'Face close up, emotional expression, singing',
        video_prompt: 'slow push in with soft focus',
        duration: '5s',
        shot_type: 'close_up',
        camera_movement: 'push_in',
      },
      {
        visual_prompt: 'Group shot, multiple performers or dancers',
        video_prompt: 'crane shot rising above the group',
        duration: '5s',
        shot_type: 'wide_shot',
        camera_movement: 'tilt_up',
      },
      {
        visual_prompt: 'Visual effects heavy shot, VFX elements',
        video_prompt: 'static with in-camera effects',
        duration: '4s',
        shot_type: 'medium_shot',
        camera_movement: 'static',
      },
      {
        visual_prompt: 'Silhouette against bright background',
        video_prompt: 'slow pan across silhouettes',
        duration: '5s',
        shot_type: 'wide_shot',
        camera_movement: 'pan_left',
      },
      {
        visual_prompt: 'Detail shot, hands, eyes, or significant prop',
        video_prompt: 'macro style slow motion',
        duration: '4s',
        shot_type: 'close_up',
        camera_movement: 'static',
      },
      {
        visual_prompt: 'Final pose or iconic moment, peak energy',
        video_prompt: 'dramatic zoom to freeze frame',
        duration: '7s',
        shot_type: 'medium_shot',
        camera_movement: 'zoom_in',
      },
    ],
  },
  {
    id: 'social-hook-15s',
    name: '社交媒体开场 (15秒)',
    description: '适合短视频开场，快速抓住注意力',
    category: 'social',
    duration: '15s',
    frame_mode: 'first_frame',
    style_prefix: 'social media style, bright colors, high contrast, trendy aesthetic',
    scenes: [
      {
        visual_prompt: 'Hook shot, eye-catching visual, question or surprise element',
        video_prompt: 'fast zoom in, attention grabbing',
        duration: '3s',
        shot_type: 'close_up',
        camera_movement: 'zoom_in',
      },
      {
        visual_prompt: 'Problem or situation setup, relatable moment',
        video_prompt: 'quick cut style, handheld feel',
        duration: '4s',
        shot_type: 'medium_shot',
        camera_movement: 'handheld',
      },
      {
        visual_prompt: 'Solution reveal or transformation, before/after feel',
        video_prompt: 'smooth transition or wipe',
        duration: '4s',
        shot_type: 'medium_shot',
        camera_movement: 'static',
      },
      {
        visual_prompt: 'Call to action or follow prompt, direct to camera',
        video_prompt: 'static with text overlay space',
        duration: '4s',
        shot_type: 'close_up',
        camera_movement: 'static',
      },
    ],
  },
];

/**
 * Apply a template to create new storyboard data
 */
export function applyTemplate(template: StoryboardTemplate, aspectRatio: '16:9' | '9:16'): StoryboardData {
  const scenes: StoryboardScene[] = template.scenes.map((scene, idx) => ({
    id: idx + 1,
    visual_prompt: scene.visual_prompt || '',
    video_prompt: scene.video_prompt || '',
    duration: scene.duration || '5s',
    aspect_ratio: aspectRatio,
    shot_type: scene.shot_type || 'medium_shot',
    frame_role: scene.frame_role || (template.frame_mode === 'first_frame' ? 'first_frame' : 'keyframe'),
    camera_movement: scene.camera_movement,
    selected: true,
  }));

  return {
    title: template.name,
    frame_mode: template.frame_mode,
    style_prefix: template.style_prefix,
    scenes,
    metadata: {
      total_duration: template.duration,
      style: template.category,
      genre: template.category,
    },
  };
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: StoryboardTemplate['category']): StoryboardTemplate[] {
  return STORYBOARD_TEMPLATES.filter(t => t.category === category);
}
