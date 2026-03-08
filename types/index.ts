// ========================================
// SanHub 类型定义
// ========================================

// 用户角色
// admin: 超级管理员，拥有所有权限
// moderator: 小管理员，只能管理用户（积分、密码、禁用），不能修改超级管理员
// user: 普通用户
export type UserRole = 'user' | 'admin' | 'moderator';

// 生成类型
export type GenerationType =
  | 'sora-video'
  | 'flow-video'
  | 'sora-image'
  | 'flow-image'
  | 'gemini-image'
  | 'zimage-image'
  | 'gitee-image'
  | 'chat'
  | 'character-card'
  | 'video-capture'; // 视频帧截图

// 聊天模型配置
export interface ChatModel {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  modelId: string;
  supportsVision: boolean;
  maxTokens: number;
  enabled: boolean;
  costPerMessage: number;
  createdAt: number;
}

// 聊天会话
export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
}

// 聊天消息
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // base64 图片
  tokenCount: number;
  createdAt: number;
}

// 用户模型
export interface User {
  id: string;
  email: string;
  password: string; // bcrypt hashed
  name: string;
  role: UserRole;
  balance: number; // 积分余额
  disabled: boolean; // 是否禁用
  createdAt: number;
  updatedAt: number;
}

// 用户 (不含密码，用于前端)
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  balance: number;
  disabled: boolean;
  createdAt: number;
}

// 生成记录
export type GenerationVisibility = 'private' | 'public';

export interface Generation {
  id: string;
  userId: string;
  type: GenerationType;
  prompt: string;
  params: GenerationParams;
  resultUrl: string; // base64 data URL 或外链
  cost: number; // 消耗积分
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  balancePrecharged?: boolean;
  balanceRefunded?: boolean;
  errorMessage?: string;
  visibility?: GenerationVisibility;
  publicShareId?: string;
  publicViewCount?: number;
  createdAt: number;
  updatedAt: number;
}

// 生成参数
export interface GenerationParams {
  modelId?: string;
  model?: string;
  aspectRatio?: string;
  duration?: string;
  imageSize?: string;
  size?: string; // Z-Image 分辨率
  referenceImages?: string[]; // base64 数组
  loras?: string | Record<string, number>; // Z-Image LoRA 配置
  channel?: 'modelscope' | 'gitee'; // Z-Image 渠道
  imageCount?: number; // 参考图数量
  videoId?: string;
  videoChannelId?: string;
  permalink?: string;
  revised_prompt?: string;
  progress?: number; // 生成进度 0-100
  // 视频帧截图参数
  sourceVideoId?: string; // 来源视频 generation ID
  captureTimestamp?: number; // 截取时间点（秒）
  originalWidth?: number; // 原始宽度
  originalHeight?: number; // 原始高度
}

// SORA 后台配置
export interface SoraBackendConfig {
  soraBackendUrl: string;
  soraBackendUsername: string;
  soraBackendPassword: string;
  soraBackendToken: string; // admin login token
}

// SORA 统计数据
export interface SoraStats {
  total_tokens: number;
  active_tokens: number;
  total_images: number;
  total_videos: number;
  today_images: number;
  today_videos: number;
  total_errors: number;
  today_errors: number;
}

// 公告配置
export interface AnnouncementConfig {
  title: string;
  content: string; // 支持 HTML
  enabled: boolean;
  updatedAt: number;
}

// 渠道启用配置
export interface ChannelEnabledConfig {
  sora: boolean;
  gemini: boolean;
  zimage: boolean;
  gitee: boolean;
}

// 每日请求限制配置
export interface DailyLimitConfig {
  imageLimit: number;      // 图像生成每日限制，0 表示不限制
  videoLimit: number;      // 视频生成每日限制，0 表示不限制
  characterCardLimit: number; // 角色卡每日限制，0 表示不限制
}

// 模型禁用配置
export interface ModelDisabledConfig {
  imageModels: string[];   // 禁用的图像模型 ID 列表
  videoModels: string[];   // 禁用的视频模型 ID 列表
}

// ========================================
// 渠道与模型配置（动态配置）
// ========================================

// 渠道类型 - 决定请求方式
export type ChannelType = 'openai-compatible' | 'openai-chat' | 'modelscope' | 'gitee' | 'gemini' | 'sora' | 'flow';

// 模型功能特性
export interface ImageModelFeatures {
  textToImage: boolean;      // 文生图
  imageToImage: boolean;     // 图生图
  upscale: boolean;          // 超分辨率
  matting: boolean;          // 抠图
  multipleImages: boolean;   // 支持多张参考图
  imageSize: boolean;        // 支持分辨率选择 (1K/2K/4K)
}

// 图像渠道配置
export interface ImageChannel {
  id: string;
  name: string;              // 渠道名称，如 "NEWAPI", "ModelScope"
  type: ChannelType;         // 渠道类型，决定请求方式
  baseUrl: string;           // 默认 Base URL
  apiKey: string;            // 默认 API Key（支持多 key 逗号分隔）
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// 图像模型配置
export interface ImageModel {
  id: string;
  channelId: string;         // 关联渠道
  name: string;              // 显示名称
  description: string;
  apiModel: string;          // 实际调用的模型名
  baseUrl?: string;          // 可选，覆盖渠道默认
  apiKey?: string;           // 可选，覆盖渠道默认
  features: ImageModelFeatures;
  aspectRatios: string[];    // 支持的画面比例
  resolutions: Record<string, string | Record<string, string>>; // 比例对应的分辨率
  imageSizes?: string[];     // 支持的分辨率档位 (1K/2K/4K)
  defaultAspectRatio: string;
  defaultImageSize?: string;
  requiresReferenceImage?: boolean; // 是否必须上传参考图
  allowEmptyPrompt?: boolean;       // 是否允许空提示词
  highlight?: boolean;              // 是否高亮显示
  enabled: boolean;
  costPerGeneration: number;
  sortOrder: number;         // 排序顺序
  createdAt: number;
  updatedAt: number;
}

// 前端使用的渠道（不含敏感信息）
export interface SafeImageChannel {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
}

// 前端使用的模型（不含敏感信息）
export interface SafeImageModel {
  id: string;
  channelId: string;
  channelType: ChannelType;
  name: string;
  description: string;
  features: ImageModelFeatures;
  aspectRatios: string[];
  resolutions: Record<string, string | Record<string, string>>;
  imageSizes?: string[];
  defaultAspectRatio: string;
  defaultImageSize?: string;
  requiresReferenceImage?: boolean;
  allowEmptyPrompt?: boolean;
  highlight?: boolean;
  enabled: boolean;
  costPerGeneration: number;
}

// ========================================
// 视频渠道与模型配置
// ========================================

// 视频模型功能特性
export interface VideoModelFeatures {
  textToVideo: boolean;      // 文生视频
  imageToVideo: boolean;     // 图生视频
  videoToVideo: boolean;     // 视频转视频
  supportStyles: boolean;    // 支持风格选择
  maxReferenceImages?: number; // 最大参考图数量 (Veo i2v=2, r2v=3; Sora=1)
}

// 视频渠道配置
export interface VideoChannel {
  id: string;
  name: string;
  type: ChannelType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// 视频时长选项
export interface VideoDuration {
  value: string;   // 如 "10s"
  label: string;   // 如 "10 秒"
  cost: number;    // 该时长的积分消耗
}

// 视频模型配置
export interface VideoModel {
  id: string;
  channelId: string;
  name: string;
  description: string;
  apiModel: string;
  baseUrl?: string;
  apiKey?: string;
  features: VideoModelFeatures;
  aspectRatios: Array<{ value: string; label: string }>;
  durations: VideoDuration[];
  defaultAspectRatio: string;
  defaultDuration: string;
  highlight?: boolean;
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// 前端使用的视频渠道
export interface SafeVideoChannel {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
}

// 前端使用的视频模型
export interface SafeVideoModel {
  id: string;
  channelId: string;
  channelType: ChannelType;
  name: string;
  description: string;
  features: VideoModelFeatures;
  aspectRatios: Array<{ value: string; label: string }>;
  durations: VideoDuration[];
  defaultAspectRatio: string;
  defaultDuration: string;
  highlight?: boolean;
  enabled: boolean;
}

// 网站配置
export interface SiteConfig {
  siteName: string;           // 网站名称，如 SANHUB
  siteTagline: string;        // 英文标语，如 Let Imagination Come Alive
  siteDescription: string;    // 中文描述
  siteSubDescription: string; // 中文副描述
  contactEmail: string;       // 联系邮箱
  copyright: string;          // 版权信息
  poweredBy: string;          // 技术支持信息
}

// 系统配置
export interface SystemConfig {
  soraApiKey: string;
  soraBaseUrl: string;
  // SORA 后台配置
  soraBackendUrl: string;
  soraBackendUsername: string;
  soraBackendPassword: string;
  soraBackendToken: string;
  geminiApiKey: string;
  geminiBaseUrl: string;
  zimageApiKey: string;
  zimageBaseUrl: string;
  giteeFreeApiKey: string;
  giteeApiKey: string; // 支持多key，用逗号分隔
  giteeBaseUrl: string;
  // PicUI 图床配置
  picuiApiKey: string;
  picuiBaseUrl: string;
  pricing: PricingConfig;
  registerEnabled: boolean;
  defaultBalance: number;
  // 公告配置
  announcement: AnnouncementConfig;
  // 渠道启用配置
  channelEnabled: ChannelEnabledConfig;
  // 每日请求限制配置
  dailyLimit: DailyLimitConfig;
  // 模型禁用配置
  disabledModels: ModelDisabledConfig;
  // 网站配置
  siteConfig: SiteConfig;
}

// 定价配置
export interface PricingConfig {
  soraVideo10s: number;
  soraVideo15s: number;
  soraVideo25s: number;
  veoVideo8s: number;
  soraImage: number;
  geminiNano: number;
  geminiPro: number;
  zimageImage: number;
  giteeImage: number;
}

// API 响应
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Sora 生成请求
export interface SoraGenerateRequest {
  prompt: string;
  model: string; // sora2-landscape-10s, sora-image 等
  files?: { mimeType: string; data: string }[];
  referenceImageUrl?: string;
  style_id?: string; // 风格: festive, retro, news, selfie, handheld, anime, comic, golden, vintage
  remix_target_id?: string; // Remix 视频 ID
}

// 生成结果
export interface GenerateResult {
  type: GenerationType;
  url: string;
  cost: number;
  videoId?: string;
  videoChannelId?: string;
  permalink?: string;
  revised_prompt?: string;
}

// NextAuth 扩展
declare module 'next-auth' {
  interface Session {
    user: SafeUser;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    balance: number;
  }
}

// 角色卡
export interface CharacterCard {
  id: string;
  userId: string;
  characterName: string; // 角色名称 (如 @lotuswhisp719)
  avatarUrl: string; // 角色头像 URL
  sourceVideoUrl?: string; // 源视频 URL (可选)
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

// ========================================
// 邀请码系统
// ========================================

export interface InviteCode {
  id: string;
  code: string;
  creatorId: string;
  usedBy?: string;
  usedAt?: number;
  bonusPoints: number;    // 被邀请人获得的额外积分
  creatorBonus: number;   // 邀请人获得的积分奖励
  expiresAt?: number;
  createdAt: number;
  creatorEmail?: string;
  creatorName?: string;
  usedByEmail?: string;
  usedByName?: string;
}

// ========================================
// 卡密系统
// ========================================

export interface RedemptionCode {
  id: string;
  code: string;
  points: number;
  usedBy?: string;
  usedAt?: number;
  expiresAt?: number;
  batchId?: string;
  note?: string;
  createdAt: number;
}

// ========================================
// 数据统计
// ========================================

export interface DailyStats {
  date: string;           // YYYY-MM-DD
  generations: number;
  users: number;
  points: number;
}

export interface GenerationTypeStat {
  type: string;
  count: number;
}

export interface StatsOverview {
  totalUsers: number;
  activeUsers: number;
  totalChatModels: number;
  enabledChatModels: number;
  totalGenerations: number;
  totalPoints: number;
  todayUsers: number;
  todayGenerations: number;
  dailyStats: DailyStats[];
  generationTypes: GenerationTypeStat[];
}

// ========================================
// Workspace types
// ========================================

export type WorkspaceNodeType = 'image' | 'video' | 'chat' | 'prompt-template';

// Storyboard types for AI Director mode
export type StoryboardFrameRole = 'keyframe' | 'first_frame' | 'last_frame' | 'storyboard_only';
export type StoryboardFrameMode = 'first_frame' | 'first_last' | 'keyframes';

// Camera movement presets for video generation
export type CameraMovement =
  | 'static'      // 静止
  | 'push_in'     // 推进
  | 'pull_out'    // 拉远
  | 'pan_left'    // 左摇
  | 'pan_right'   // 右摇
  | 'tilt_up'     // 上仰
  | 'tilt_down'   // 下俯
  | 'tracking'    // 跟踪
  | 'dolly'       // 推轨
  | 'zoom_in'     // 放大
  | 'zoom_out'    // 缩小
  | 'handheld';   // 手持

// Camera movement preset definitions
export const CAMERA_MOVEMENT_PRESETS: { value: CameraMovement; label: string; prompt: string }[] = [
  { value: 'static', label: '静止', prompt: 'static camera, fixed shot' },
  { value: 'push_in', label: '推进', prompt: 'camera slowly pushes in, moving forward' },
  { value: 'pull_out', label: '拉远', prompt: 'camera pulls back, revealing more of the scene' },
  { value: 'pan_left', label: '左摇', prompt: 'camera pans left smoothly' },
  { value: 'pan_right', label: '右摇', prompt: 'camera pans right smoothly' },
  { value: 'tilt_up', label: '上仰', prompt: 'camera tilts upward' },
  { value: 'tilt_down', label: '下俯', prompt: 'camera tilts downward' },
  { value: 'tracking', label: '跟踪', prompt: 'camera tracks the subject, following movement' },
  { value: 'dolly', label: '推轨', prompt: 'smooth dolly shot, lateral movement' },
  { value: 'zoom_in', label: '放大', prompt: 'slow zoom in on subject' },
  { value: 'zoom_out', label: '缩小', prompt: 'slow zoom out from subject' },
  { value: 'handheld', label: '手持', prompt: 'handheld camera, slight natural shake' },
];

// Character definition for consistency across scenes
export interface StoryboardCharacter {
  name: string;           // Character identifier (e.g., "Moon Man")
  description: string;    // Visual description for prompts
  alias?: string[];       // Alternative names/references
  // Cinematic mode fields
  personality?: string;   // Character personality traits
  voiceStyle?: string;    // Voice style for dubbing reference
}

// Location definition for consistency across scenes
export interface StoryboardLocation {
  name: string;           // Location identifier (e.g., "Outer Space")
  description: string;    // Visual description for prompts
}

// Voice style presets for cinematic mode
export const VOICE_STYLE_PRESETS = [
  { id: 'young-female', label: '年轻女声', value: 'female voice, young adult voice, medium-high pitch, bright timbre, light voice, clean voice' },
  { id: 'mature-female', label: '成熟女声', value: 'female voice, adult voice, medium pitch, warm timbre, medium voice, smooth voice' },
  { id: 'young-male', label: '年轻男声', value: 'male voice, young adult voice, medium pitch, clear timbre, light voice, energetic tone' },
  { id: 'mature-male', label: '成熟男声', value: 'male voice, adult voice, low-medium pitch, deep timbre, medium voice, authoritative tone' },
  { id: 'elderly-male', label: '老年男声', value: 'male voice, old-aged voice, medium-high pitch, bright timbre, slightly breathy voice, raspy voice' },
  { id: 'elderly-female', label: '老年女声', value: 'female voice, old-aged voice, medium pitch, warm timbre, slightly breathy voice, gentle tone' },
  { id: 'child', label: '儿童声', value: 'child voice, high pitch, bright timbre, light voice, innocent tone, clear articulation' },
  { id: 'narrator', label: '旁白音', value: 'neutral voice, medium pitch, clear timbre, professional tone, crisp articulation, authoritative' },
] as const;

// Storyboard mode type
export type StoryboardModeType = 'quick' | 'cinematic';

export interface StoryboardScene {
  id: number;
  visual_prompt: string;      // Image generation prompt
  video_prompt: string;       // Video generation prompt (motion description)
  duration: string;           // Duration e.g. "5s"
  aspect_ratio: string;       // Aspect ratio e.g. "16:9"
  shot_type: string;          // Shot type: wide_shot, medium_shot, close_up, etc.
  frame_role: StoryboardFrameRole;
  camera_movement?: CameraMovement;  // Camera movement preset
  // Enhanced metadata fields
  characters?: string[];      // Characters in the scene
  location?: string;          // Scene location
  dialogue?: string;          // Dialogue content
  mood?: string;              // Emotional atmosphere
  transition?: string;        // Transition type to next scene
  // UI state
  selected?: boolean;         // Whether selected for generation
  editing?: boolean;          // Whether currently being edited
  // Thumbnail preview
  thumbnailUrl?: string;      // Generated thumbnail image URL
  thumbnailLoading?: boolean; // Whether thumbnail is being generated
  // Cinematic mode fields
  timeRange?: string;         // Precise time range e.g. "0.1-2.0s" for cinematic mode
  startTime?: number;         // Start time in seconds (for editing)
  endTime?: number;           // End time in seconds (for editing)
}

export interface StoryboardData {
  title?: string;             // Project title
  frame_mode: StoryboardFrameMode;  // AI recommended frame mode
  storyboard_mode?: StoryboardModeType;  // 'quick' or 'cinematic' mode
  scenes: StoryboardScene[];
  // Character & Scene consistency (方案一)
  characters?: StoryboardCharacter[];  // Character definitions
  locations?: StoryboardLocation[];    // Location definitions
  style_prefix?: string;               // Global style prefix for all prompts
  metadata?: {
    total_duration: string;
    style: string;
    genre: string;
  };
}

// Prompt template definitions
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  type?: 'system' | 'user';  // Template type: system prompt or user prompt
  content: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: '3x3-cinematic-shots',
    name: '3x3电影镜头图',
    description: '九宫格电影镜头语言参考',
    content: `Create a 3x3 grid layout of cinematic film shots showing different camera angles and shot types for a specific scene:

Row 1 (Wide/Establishing):
- Extreme Long Shot (ELS): Establishing location
- Long Shot (LS): Full character in environment
- Full Shot (FS): Character head to toe

Row 2 (Medium):
- Medium Long Shot (MLS): Knees up
- Medium Shot (MS): Waist up
- Medium Close-Up (MCU): Chest up

Row 3 (Close/Detail):
- Close-Up (CU): Head and shoulders
- Extreme Close-Up (ECU): Eye/Mouth detail
- Insert Shot: Important object/prop detail

Requirements:
- Consistent lighting and color grading (Teal & Orange or Noir style)
- Professional cinematography composition
- High quality photorealistic render
- Aspect ratio 1:1 for the grid`,
  },
  {
    id: 'character-sheet-3view',
    name: '三视图角色设定表',
    description: '角色前/侧/后三视图 + 脸部特写',
    content: `Please create an illustrated character sheet with the following composition:

Three-view orthographic poses:
- Front view: Full body, standing straight in T-pose
- Side view: Full body profile, standing straight in T-pose  
- Back view: Full body rear, standing straight in T-pose

Close-up section:
- Face close-up portrait

Requirements:
- Label each view clearly (Front, Side, Back, Close-up)
- Aspect ratio 3:2
- Clean white or neutral background
- Consistent lighting across all views
- Professional character design reference style`,
  },
  {
    id: 'turnaround-sheet',
    name: '角色转面图',
    description: '8方向角色转面参考图',
    content: `Create a character turnaround reference sheet showing the character from 8 angles:
- Front (0°)
- Front-left (45°)
- Left profile (90°)
- Back-left (135°)
- Back (180°)
- Back-right (225°)
- Right profile (270°)
- Front-right (315°)

Requirements:
- All poses in neutral standing position
- Consistent scale across all views
- Clean background
- Professional animation/game art reference style`,
  },
  {
    id: 'expression-sheet',
    name: '表情参考图',
    description: '多种表情的角色面部参考',
    content: `Create a character expression sheet showing various facial expressions:
- Neutral/Default
- Happy/Smiling
- Sad/Melancholy
- Angry/Frustrated
- Surprised/Shocked
- Confused/Puzzled
- Embarrassed/Blushing
- Determined/Confident

Requirements:
- Head and shoulders framing for each expression
- Consistent art style across all expressions
- Clear emotional distinction between each
- Grid layout with labels`,
  },
  {
    id: 'outfit-variations',
    name: '服装变体图',
    description: '同一角色的多套服装设计',
    content: `Create a character outfit variation sheet showing the same character in different outfits:
- Casual everyday wear
- Formal/Business attire
- Athletic/Sportswear
- Sleepwear/Loungewear
- Special occasion/Party outfit

Requirements:
- Full body view for each outfit
- Consistent character appearance across all variations
- Clean presentation with outfit labels
- Professional fashion design reference style`,
  },
  {
    id: 'action-poses',
    name: '动作姿势图',
    description: '角色动态动作参考',
    content: `Create a character action pose reference sheet showing dynamic poses:
- Running/Sprinting
- Jumping/Leaping
- Fighting stance
- Sitting/Resting
- Reaching/Grabbing
- Falling/Tumbling

Requirements:
- Dynamic and expressive poses
- Show motion and energy
- Consistent character design
- Clean background for easy reference`,
  },
  {
    id: 'storyboard-director',
    name: 'AI 导演分镜表',
    description: '生成结构化的影视分镜脚本 (JSON格式)',
    content: `You are a professional film director and storyboard artist.
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
- Do not output anything else except the JSON.`,
  },
  {
    id: 'cinematic-storyboard-director',
    name: '影视级分镜导演',
    description: '专业影视分镜模式，支持角色定义、智能分镜规划',
    type: 'system',
    content: `You are a professional cinematic storyboard director specializing in film-quality storyboard generation.

IMPORTANT RULES:
1. Ensure the content of the video fills the entire frame without any margins or borders.
2. Each storyboard entry = ONE video generation task (8-10 seconds each).
3. Split scenes ONLY at major changes: character switch, location change, or significant action shift.
4. Do NOT over-fragment: a continuous action should be ONE storyboard entry, not multiple 2-second clips.

Your task is to analyze the user's story/script and create a detailed cinematic storyboard with:
1. Character definitions with personality and voice style for dubbing reference
2. Scene-based planning (each scene = one video generation, typically 8-10s)
3. Professional cinematography guidance with camera movements

Output format (JSON only):
{
  "title": "storyboard title",
  "frame_mode": "first_frame",
  "storyboard_mode": "cinematic",
  "total_duration": 30.0,
  "characters": [
    {
      "name": "detailed character visual description (e.g., woman in black professional attire with long hair)",
      "personality": "character personality traits (e.g., Proud, fiercely defensive of her family, and emotionally intense.)",
      "voiceStyle": "voice characteristics for dubbing (e.g., female voice, young adult voice, medium-high pitch, bright timbre, light voice, clean voice, crisp articulation.)"
    }
  ],
  "storyboard": [
    {
      "storyboardContent": "Scene 1 (0-8s): Medium shot, the woman in black attire stands in the hospital corridor, morning light streaming through windows. She takes a deep breath, clenches her fist, then walks determinedly forward. Camera slowly dollies alongside her movement, maintaining eye-level angle. Ambient hospital sounds in background."
    },
    {
      "storyboardContent": "Scene 2 (8-16s): Close-up on elderly doctor's face as he looks up from medical charts. His expression shifts from surprise to calculation. Camera holds steady, natural office lighting. Cut to over-shoulder shot as he removes his glasses, preparing to speak."
    }
  ]
}

Guidelines:
- CRITICAL: Each storyboardContent = ONE video generation (8-10s). Do not fragment into 2s clips!
- storyboardContent format: "Scene N (start-end): Shot type, detailed action description, camera movement, lighting, audio notes"
- Split scenes at: character changes, location changes, significant emotional beats, or when camera angle fundamentally changes
- Keep continuous actions in ONE scene (e.g., "character walks and speaks" = one scene, not three)
- Character name in "characters" array should be a complete visual description, not just a name
- personality: Character's emotional and behavioral traits
- voiceStyle: Detailed dubbing reference (gender, age, pitch, timbre, voice quality, articulation)
- Include camera movements: static, pan, tilt, dolly, crane, handheld, tracking, zoom
- Include shot types: establishing, wide, medium, close-up, extreme close-up, over-shoulder, POV, aerial
- For dialogue scenes, one speaking turn = typically one scene (8-10s allows ~20-25 words of dialogue)
- Time ranges are for editing reference only; actual video length is determined by the generation model
- Do not output anything else except the JSON.`,
  },
  {
    id: 'storyboard-to-video-prompt',
    name: '分镜图转视频提示词',
    description: '根据分镜图片生成视频提示词',
    content: `你是一个专业的视频提示词生成专家。

用户会提供：
1. 一张分镜图片
2. 故事背景/上下文

请根据图片内容和故事上下文，生成一段详细的视频生成提示词。

提示词应包含：
- 画面主体描述（人物、场景、物体）
- 动作/运动描述（人物动作、物体运动）
- 镜头运动建议（如推进、平移、跟踪、固定等）
- 氛围/光影描述（时间、天气、光线、色调）

输出格式要求：
- 纯英文描述
- 不要 JSON 格式
- 不要额外解释
- 直接输出可用于视频生成的提示词`,
  },
  {
    id: 'perspective-explosion-3x3',
    name: '视角裂变 3x3',
    description: '基于单张参考图生成9个多视角分镜提示词（NanoBananaPro）',
    content: `你是"多维视角一致性生成助手"，专门为 NanoBananaPro 图像模型生成 3x3 九宫格分镜提示词。

## 核心能力
- **视觉锁定**：精准提取并锁定参考图中的核心元素（人物ID、衣着细节、环境布局、光影），确保9张分镜中这些描述高度一致
- **特定镜头强化**：侧重沉浸式和关系视角，重点生成背后、过肩及主观镜头
- **高张力构图**：避免平庸的平视镜头，使用极端或有张力的景别

## 镜头变量库

景别（禁止使用 Medium Shot, Long Shot, Close-up）：
- Extreme Close-up (ECU - Focus on eyes/details)
- Full Body Shot
- Cowboy Shot (Thigh-up)
- Upper Body Shot (Chest-up)
- Wide Angle Full Shot

视角：
- Back View (Walking away/Looking at scenery)
- Over-the-Shoulder (OTS)
- Point of View (POV)
- Low Angle (Heroic)
- High Angle (Vulnerable)
- Dutch Angle (Tilted)
- Top-Down / God's Eye View

构图：
- Rule of Thirds
- Center Composition
- Depth of Field (Bokeh)
- Framing within a frame
- Dynamic Diagonal

## 强制视角分布（9个分镜）
- 至少 2个 背后视角 (Back View)
- 至少 3个 过肩视角 (Over-the-Shoulder)
- 至少 2个 主观视角 (Point of View/POV)
- 剩余 2个 自由选择高张力视角（如上帝视角或大特写）

## 输入处理
1. 将用户的图片描述定义为 [Base_Prompt]，这部分不可修改
2. 按强制分布分配视角
3. Prompt结构 = [Camera_Setup] + [Base_Prompt] + [Quality_Tags] + [Marking_Instructions]

## 输出格式
必须输出纯净的 JSON，包含精确 9 个分镜：

\`\`\`json
{
  "image_generation_model": "NanoBananaPro",
  "grid_layout": "3x3",
  "grid_aspect_ratio": "16:9",
  "global_watermark": {
    "position": "bottom_center",
    "size": "small"
  },
  "shots": [
    {
      "shot_number": "分镜1",
      "prompt_text": "[镜头语言], [固定参考图描述], [画质词]. '分镜1' in the top-left corner. No timecode, no subtitles."
    },
    // ... 共9个
  ]
}
\`\`\`

## 硬性约束
- C1: 一致性绝对优先，人物特征和环境必须保持一致
- C2: 严格遵守视角强制分布
- C3: 禁止使用 Medium Shot, Long Shot, Close-up 等平庸描述
- C4: shots 数组必须精确包含 9 个对象
- C5: 每个 prompt 必须包含 "'分镜X' in the top-left corner" 和 "no timecode, no subtitles"
- C6: Prompt 内容必须为英文

请根据用户提供的参考图描述，生成 JSON 格式的 9 个分镜提示词。`,
  },
  {
    id: 'zodiac-preferences',
    name: '12星座喜好分镜',
    description: '生成12星座各自喜好的主题分镜表，适合制作星座系列短视频',
    content: `你是一位专业的星座内容创作者和视觉导演。
请根据用户提供的主题（如：喜欢的食物、约会方式、穿搭风格、旅行目的地等），为12星座分别生成对应的视觉分镜。

## 12星座列表
1. 白羊座 (Aries) - 3/21-4/19 - 火象、冲动热情
2. 金牛座 (Taurus) - 4/20-5/20 - 土象、稳重务实
3. 双子座 (Gemini) - 5/21-6/21 - 风象、灵活多变
4. 巨蟹座 (Cancer) - 6/22-7/22 - 水象、温柔顾家
5. 狮子座 (Leo) - 7/23-8/22 - 火象、自信张扬
6. 处女座 (Virgo) - 8/23-9/22 - 土象、追求完美
7. 天秤座 (Libra) - 9/23-10/23 - 风象、优雅平衡
8. 天蝎座 (Scorpio) - 10/24-11/22 - 水象、神秘深沉
9. 射手座 (Sagittarius) - 11/23-12/21 - 火象、自由奔放
10. 摩羯座 (Capricorn) - 12/22-1/19 - 土象、稳健踏实
11. 水瓶座 (Aquarius) - 1/20-2/18 - 风象、独立创新
12. 双鱼座 (Pisces) - 2/19-3/20 - 水象、浪漫梦幻

## 输出格式 (JSON)
{
  "title": "12星座最喜欢的[主题]",
  "frame_mode": "first_frame",
  "metadata": {
    "total_duration": "60s",
    "style": "modern minimalist with zodiac elements",
    "genre": "lifestyle/astrology"
  },
  "scenes": [
    {
      "id": 1,
      "zodiac": "Aries",
      "zodiac_cn": "白羊座",
      "visual_prompt": "A vibrant scene showing [具体喜好内容], dynamic composition with red and orange color scheme, Aries constellation symbol subtly integrated, energetic and bold atmosphere, high quality, 8k",
      "video_prompt": "Camera slowly zooms in, energetic movement, upbeat vibe",
      "duration": "5s",
      "aspect_ratio": "9:16",
      "shot_type": "medium_shot",
      "frame_role": "first_frame",
      "preference": "[该星座的具体喜好]",
      "reason": "[为什么这个星座喜欢这个]",
      "mood": "energetic"
    }
  ]
}

## 创作要求
1. **性格匹配**: 每个星座的喜好必须符合其性格特点
2. **视觉差异**: 12个场景要有明显的视觉区分度
3. **色彩运用**:
   - 火象星座（白羊、狮子、射手）：红、橙、金色调
   - 土象星座（金牛、处女、摩羯）：绿、棕、米色调
   - 风象星座（双子、天秤、水瓶）：蓝、紫、银色调
   - 水象星座（巨蟹、天蝎、双鱼）：蓝绿、深蓝、珍珠色调
4. **构图建议**: 可融入星座符号、星空元素
5. **文案风格**: reason 字段用轻松幽默的语气解释
6. **scenes数组必须包含完整12个星座**

请根据用户提供的主题，生成完整的12星座分镜JSON。不要输出其他内容。`,
  },
];

export interface WorkspaceNode {
  id: string;
  type: WorkspaceNodeType;
  name: string;
  position: { x: number; y: number };
  data: {
    // Common fields
    prompt: string;
    status?: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
    errorMessage?: string;
    progress?: number; // 0-100 execution progress
    progressMessage?: string; // Progress status message (e.g., "正在生成...")

    // Image/Video node fields
    modelId?: string;
    aspectRatio?: string;
    duration?: string;
    imageSize?: string;
    outputUrl?: string;
    outputType?: 'image' | 'video';
    generationId?: string;
    revisedPrompt?: string;
    uploadedImages?: string[]; // User uploaded reference images (base64 or URLs)

    // Chat node fields
    chatModelId?: string;
    chatMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
    chatOutput?: string; // The generated text output
    inputImages?: string[]; // URLs of input images from connected nodes
    pureMode?: boolean; // If true, output only the prompt without conversational filler

    // Storyboard mode fields (Chat node enhancement)
    storyboardMode?: boolean; // Enable AI storyboard director mode
    storyboardStep?: 'collecting' | 'preview' | 'confirmed'; // Current step in storyboard workflow
    storyboardData?: StoryboardData; // Parsed storyboard data from AI
    selectedScenes?: number[]; // Scene IDs selected for generation
    generatedNodeIds?: string[]; // IDs of nodes generated from storyboard explosion
    sceneNodeMapping?: Array<{ sceneId: number; imageNodeId?: string; videoNodeId?: string }>; // Scene to node mapping

    // Prompt template node fields
    templateId?: string;
    templateOutput?: string; // The selected template content
  };
}

export interface WorkspaceEdge {
  id: string;
  from: string;
  to: string;
}

export interface WorkspaceData {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
}

export interface Workspace {
  id: string;
  userId: string;
  name: string;
  data: WorkspaceData;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}


