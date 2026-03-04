'use client';

import { useState, useCallback, useRef, useEffect, memo } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  FileText,
  Film,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Monitor,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Video,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoryboardData, StoryboardScene, StoryboardFrameMode, StoryboardCharacter, StoryboardLocation, CameraMovement, StoryboardModeType } from '@/types';
import { CAMERA_MOVEMENT_PRESETS, VOICE_STYLE_PRESETS } from '@/types';
import { STORYBOARD_TEMPLATES, applyTemplate, type StoryboardTemplate } from '@/lib/storyboard-templates';

// Style presets for quick selection
export const STYLE_PRESETS = [
  { id: 'cinematic', label: '电影感', value: 'cinematic lighting, film grain, dramatic shadows, professional color grading' },
  { id: 'anime', label: '动漫风', value: 'anime style, cel shading, vibrant colors, detailed linework' },
  { id: 'realistic', label: '写实', value: 'photorealistic, 8K, ultra detailed, natural lighting' },
  { id: 'commercial', label: '商业广告', value: 'commercial photography, clean background, professional lighting, product focused' },
  { id: 'vintage', label: '复古', value: 'vintage film look, warm tones, soft focus, nostalgic atmosphere' },
  { id: 'scifi', label: '科幻', value: 'sci-fi aesthetic, neon lights, futuristic, cyberpunk influences' },
  { id: 'dreamy', label: '梦幻', value: 'dreamy atmosphere, soft pastel colors, ethereal lighting, fantasy mood' },
  { id: 'minimal', label: '极简', value: 'minimalist style, clean lines, simple composition, negative space' },
] as const;

interface StoryboardPreviewCardProps {
  scene: StoryboardScene;
  index: number;
  isSelected: boolean;  // For batch selection
  onToggleSelect: (id: number) => void;
  onUpdateScene: (id: number, updates: Partial<StoryboardScene>) => void;
  onGenerateThumbnail: (id: number) => void;
  onDeleteScene: (id: number) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  dragOverIndex: number | null;
  stylePrefix?: string;
  aspectRatio: '16:9' | '9:16';
}

// Memoized card component to prevent unnecessary re-renders
const StoryboardPreviewCard = memo(function StoryboardPreviewCard({
  scene,
  index,
  isSelected,
  onToggleSelect,
  onUpdateScene,
  onGenerateThumbnail,
  onDeleteScene,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  dragOverIndex,
  stylePrefix,
  aspectRatio,
}: StoryboardPreviewCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState(scene.visual_prompt);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto focus on textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }
  }, [editing]);

  const handleSaveEdit = () => {
    onUpdateScene(scene.id, { visual_prompt: editPrompt });
    setEditing(false);
  };

  // Keyboard shortcuts for editing
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditPrompt(scene.visual_prompt);
      setEditing(false);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSaveEdit();
    }
  };

  const frameRoleLabel = {
    keyframe: '关键帧',
    first_frame: '首帧',
    last_frame: '尾帧',
    storyboard_only: '分镜板',
  }[scene.frame_role] || scene.frame_role;

  const frameRoleColor = {
    keyframe: 'bg-purple-500/20 text-purple-400',
    first_frame: 'bg-blue-500/20 text-blue-400',
    last_frame: 'bg-orange-500/20 text-orange-400',
    storyboard_only: 'bg-gray-500/20 text-gray-400',
  }[scene.frame_role] || 'bg-gray-500/20 text-gray-400';

  const currentMovement = CAMERA_MOVEMENT_PRESETS.find(p => p.value === scene.camera_movement) || CAMERA_MOVEMENT_PRESETS[0];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={cn(
        'border rounded-lg transition-all',
        scene.selected !== false
          ? 'border-blue-500/50 bg-blue-500/5'
          : 'border-border/50 bg-card/30 opacity-60',
        isDragging && 'opacity-50',
        dragOverIndex === index && 'border-t-2 border-t-green-500'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-2">
        {/* Drag handle */}
        <div className="cursor-grab text-foreground/30 hover:text-foreground/50">
          <GripVertical className="w-3 h-3" />
        </div>

        <button
          onClick={() => onToggleSelect(scene.id)}
          className={cn(
            'w-5 h-5 rounded border flex items-center justify-center transition-colors',
            scene.selected !== false
              ? 'bg-blue-500 border-blue-500 text-white'
              : 'border-border/70 hover:border-foreground/50'
          )}
        >
          {scene.selected !== false && <Check className="w-3 h-3" />}
        </button>

        <span className="text-xs font-medium text-foreground/70">
          #{index + 1}
        </span>

        <span className={cn('text-[10px] px-1.5 py-0.5 rounded', frameRoleColor)}>
          {frameRoleLabel}
        </span>

        {/* Time display: precise timeRange for cinematic mode, duration for quick mode */}
        {scene.timeRange ? (
          <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-400 flex items-center gap-0.5" title="精确时间轴">
            <Clock className="w-2.5 h-2.5" />
            {scene.timeRange}
          </span>
        ) : (
          <span className="text-[10px] text-foreground/40">{scene.duration}</span>
        )}

        {/* Camera movement badge */}
        <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400 flex items-center gap-0.5">
          <Video className="w-2.5 h-2.5" />
          {currentMovement.label}
        </span>

        <div className="flex-1" />

        <button
          onClick={() => setEditing(!editing)}
          className="p-1 text-foreground/40 hover:text-foreground/70 transition"
          title="编辑提示词"
        >
          <Edit3 className="w-3 h-3" />
        </button>

        <button
          onClick={() => onDeleteScene(scene.id)}
          className="p-1 text-foreground/40 hover:text-red-400 transition"
          title="删除分镜"
        >
          <Trash2 className="w-3 h-3" />
        </button>

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-foreground/40 hover:text-foreground/70 transition"
        >
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {/* Collapsed preview - with thumbnail */}
      {!expanded && !editing && (
        <div className="px-2 pb-2 flex gap-2">
          {/* Thumbnail area */}
          <div
            className={cn(
              'flex-shrink-0 rounded overflow-hidden bg-card/40 border border-border/30 flex items-center justify-center',
              aspectRatio === '16:9' ? 'w-[80px] h-[45px]' : 'w-[45px] h-[80px]'
            )}
          >
            {scene.thumbnailLoading ? (
              <Loader2 className="w-4 h-4 text-foreground/30 animate-spin" />
            ) : scene.thumbnailUrl ? (
              <img
                src={scene.thumbnailUrl}
                alt={`分镜 ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <button
                onClick={() => onGenerateThumbnail(scene.id)}
                className="w-full h-full flex flex-col items-center justify-center text-foreground/30 hover:text-foreground/50 hover:bg-card/60 transition group"
                title="生成预览图"
              >
                <ImageIcon className="w-4 h-4 group-hover:scale-110 transition" />
                <span className="text-[8px] mt-0.5">预览</span>
              </button>
            )}
          </div>
          {/* Prompt preview */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-foreground/50 line-clamp-2">
              {stylePrefix ? `${stylePrefix}, ` : ''}{scene.visual_prompt}
            </p>
          </div>
        </div>
      )}

      {/* Editing mode */}
      {editing && (
        <div className="px-2 pb-2 space-y-2">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-20 px-2 py-1.5 text-[10px] bg-card/60 border border-border/70 rounded text-foreground resize-none focus:outline-none focus:border-blue-500/50"
              placeholder="编辑图像提示词..."
            />
            <span className="absolute bottom-1.5 right-2 text-[9px] text-foreground/30">
              {editPrompt.length} 字符
            </span>
          </div>

          {/* Camera movement selector */}
          <div className="space-y-1">
            <label className="text-[10px] text-foreground/50 flex items-center gap-1">
              <Video className="w-3 h-3" />
              镜头运动
            </label>
            <div className="flex flex-wrap gap-1">
              {CAMERA_MOVEMENT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => onUpdateScene(scene.id, { camera_movement: preset.value })}
                  className={cn(
                    'px-1.5 py-0.5 text-[9px] rounded transition',
                    scene.camera_movement === preset.value
                      ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50'
                      : 'bg-card/60 text-foreground/50 hover:bg-card/80'
                  )}
                  title={preset.prompt}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1 items-center">
            <button
              onClick={handleSaveEdit}
              className="flex-1 py-1 text-[10px] bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition"
            >
              保存 <span className="text-[8px] opacity-60">(Ctrl+Enter)</span>
            </button>
            <button
              onClick={() => {
                setEditPrompt(scene.visual_prompt);
                setEditing(false);
              }}
              className="flex-1 py-1 text-[10px] bg-card/60 text-foreground/50 rounded hover:bg-card/80 transition"
            >
              取消 <span className="text-[8px] opacity-60">(Esc)</span>
            </button>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && !editing && (
        <div className="px-2 pb-2 space-y-2 text-[10px]">
          {/* Thumbnail in expanded view */}
          <div className="flex gap-3">
            <div
              className={cn(
                'flex-shrink-0 rounded overflow-hidden bg-card/40 border border-border/30 flex items-center justify-center',
                aspectRatio === '16:9' ? 'w-[120px] h-[68px]' : 'w-[68px] h-[120px]'
              )}
            >
              {scene.thumbnailLoading ? (
                <Loader2 className="w-5 h-5 text-foreground/30 animate-spin" />
              ) : scene.thumbnailUrl ? (
                <img
                  src={scene.thumbnailUrl}
                  alt={`分镜 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <button
                  onClick={() => onGenerateThumbnail(scene.id)}
                  className="w-full h-full flex flex-col items-center justify-center text-foreground/30 hover:text-foreground/50 hover:bg-card/60 transition group"
                  title="生成预览图"
                >
                  <ImageIcon className="w-5 h-5 group-hover:scale-110 transition" />
                  <span className="text-[9px] mt-1">生成预览</span>
                </button>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="space-y-1">
                <span className="text-foreground/40 uppercase tracking-wider">图像提示词</span>
                <p className="text-foreground/70 bg-card/40 rounded p-1.5">
                  {stylePrefix ? `${stylePrefix}, ` : ''}{scene.visual_prompt}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-foreground/40 uppercase tracking-wider">视频提示词</span>
            <p className="text-foreground/70 bg-card/40 rounded p-1.5">
              {scene.video_prompt}
            </p>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap gap-2">
            {scene.characters && scene.characters.length > 0 && (
              <div className="flex items-center gap-1 text-foreground/50">
                <Users className="w-3 h-3" />
                <span>{scene.characters.join(', ')}</span>
              </div>
            )}
            {scene.location && (
              <div className="flex items-center gap-1 text-foreground/50">
                <MapPin className="w-3 h-3" />
                <span>{scene.location}</span>
              </div>
            )}
            {scene.dialogue && (
              <div className="flex items-center gap-1 text-foreground/50">
                <MessageSquare className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{scene.dialogue}</span>
              </div>
            )}
            {scene.mood && (
              <div className="flex items-center gap-1 text-foreground/50">
                <Sparkles className="w-3 h-3" />
                <span>{scene.mood}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// Helper: Extract unique characters from scenes
function extractCharactersFromScenes(scenes: StoryboardScene[]): StoryboardCharacter[] {
  const charMap = new Map<string, StoryboardCharacter>();
  scenes.forEach((scene) => {
    scene.characters?.forEach((charName) => {
      if (charName && !charMap.has(charName)) {
        charMap.set(charName, { name: charName, description: '' });
      }
    });
  });
  return Array.from(charMap.values());
}

// Helper: Extract unique locations from scenes
function extractLocationsFromScenes(scenes: StoryboardScene[]): StoryboardLocation[] {
  const locMap = new Map<string, StoryboardLocation>();
  scenes.forEach((scene) => {
    if (scene.location && !locMap.has(scene.location)) {
      locMap.set(scene.location, { name: scene.location, description: '' });
    }
  });
  return Array.from(locMap.values());
}

// Generation status for progress tracking
export type GenerationStatus = 'idle' | 'pending' | 'processing' | 'completed' | 'failed';

export interface SceneGenerationProgress {
  sceneId: number;
  imageNodeId?: string;
  videoNodeId?: string;
  imageStatus: GenerationStatus;
  videoStatus: GenerationStatus;
  imageResult?: string;
  videoResult?: string;
  error?: string;
}

interface StoryboardPreviewProps {
  data: StoryboardData;
  onUpdateData: (data: StoryboardData) => void;
  onConfirm: (data: StoryboardData) => void;
  onConfirmAndExecute?: (data: StoryboardData) => void;
  onCancel: () => void;
  // Progress tracking props (optional)
  generationProgress?: SceneGenerationProgress[];
  onRetryScene?: (sceneId: number) => void;
  onRetryAllFailed?: () => void;
  isExecuting?: boolean;
}

export function StoryboardPreview({
  data,
  onUpdateData,
  onConfirm,
  onConfirmAndExecute,
  onCancel,
  generationProgress,
  onRetryScene,
  onRetryAllFailed,
  isExecuting = false,
}: StoryboardPreviewProps) {
  const [frameMode, setFrameMode] = useState<StoryboardFrameMode>(data.frame_mode || 'first_frame');
  const [storyboardMode, setStoryboardMode] = useState<StoryboardModeType>(data.storyboard_mode || 'quick');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>(
    data.scenes[0]?.aspect_ratio?.includes('9:16') ? '9:16' : '16:9'
  );

  // Global consistency settings (方案二)
  const [showSettings, setShowSettings] = useState(false);
  const [stylePrefix, setStylePrefix] = useState(data.style_prefix || data.metadata?.style || '');
  const [characters, setCharacters] = useState<StoryboardCharacter[]>(
    data.characters || extractCharactersFromScenes(data.scenes)
  );
  const [locations, setLocations] = useState<StoryboardLocation[]>(
    data.locations || extractLocationsFromScenes(data.scenes)
  );

  // Drag and drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Batch edit state
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchDuration, setBatchDuration] = useState('5s');
  const [batchCameraMovement, setBatchCameraMovement] = useState<CameraMovement>('static');

  const handleToggleSelect = useCallback(
    (id: number) => {
      const updatedScenes = data.scenes.map((scene) =>
        scene.id === id
          ? { ...scene, selected: scene.selected === false ? true : false }
          : scene
      );
      onUpdateData({ ...data, scenes: updatedScenes });
    },
    [data, onUpdateData]
  );

  const handleUpdateScene = useCallback(
    (id: number, updates: Partial<StoryboardScene>) => {
      const updatedScenes = data.scenes.map((scene) =>
        scene.id === id ? { ...scene, ...updates } : scene
      );
      onUpdateData({ ...data, scenes: updatedScenes });
    },
    [data, onUpdateData]
  );

  // Generate thumbnail for a scene
  const handleGenerateThumbnail = useCallback(
    async (id: number) => {
      const scene = data.scenes.find((s) => s.id === id);
      if (!scene) return;

      // Set loading state
      const loadingScenes = data.scenes.map((s) =>
        s.id === id ? { ...s, thumbnailLoading: true } : s
      );
      onUpdateData({ ...data, scenes: loadingScenes });

      try {
        // Build prompt with style prefix
        const fullPrompt = stylePrefix
          ? `${stylePrefix}, ${scene.visual_prompt}`
          : scene.visual_prompt;

        // Call image generation API (using a fast, low-cost model for thumbnails)
        const response = await fetch('/api/generate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: fullPrompt,
            aspectRatio: aspectRatio,
            // Use a fast model for thumbnails - this can be configured
            modelId: 'flux-schnell', // Fast model for quick previews
            size: '512x512', // Small size for thumbnails
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to generate thumbnail');
        }

        const result = await response.json();
        const thumbnailUrl = result.data?.url || result.url || result.data?.[0]?.url;

        if (thumbnailUrl) {
          const updatedScenes = data.scenes.map((s) =>
            s.id === id ? { ...s, thumbnailUrl, thumbnailLoading: false } : s
          );
          onUpdateData({ ...data, scenes: updatedScenes });
        } else {
          throw new Error('No thumbnail URL in response');
        }
      } catch (error) {
        console.error('Thumbnail generation failed:', error);
        // Clear loading state on error
        const errorScenes = data.scenes.map((s) =>
          s.id === id ? { ...s, thumbnailLoading: false } : s
        );
        onUpdateData({ ...data, scenes: errorScenes });
      }
    },
    [data, onUpdateData, stylePrefix, aspectRatio]
  );

  // Delete a scene
  const handleDeleteScene = useCallback(
    (id: number) => {
      if (data.scenes.length <= 1) {
        // Don't delete the last scene
        return;
      }
      const updatedScenes = data.scenes
        .filter((scene) => scene.id !== id)
        .map((scene, idx) => ({ ...scene, id: idx + 1 })); // Re-assign IDs
      onUpdateData({ ...data, scenes: updatedScenes });
    },
    [data, onUpdateData]
  );

  // Add a new scene
  const handleAddScene = useCallback(
    (afterIndex?: number) => {
      const insertIndex = afterIndex !== undefined ? afterIndex + 1 : data.scenes.length;
      const newScene: StoryboardScene = {
        id: data.scenes.length + 1,
        visual_prompt: '',
        video_prompt: '',
        duration: '5s',
        aspect_ratio: aspectRatio,
        shot_type: 'medium_shot',
        frame_role: frameMode === 'first_frame' ? 'first_frame' : 'keyframe',
        camera_movement: 'static',
        selected: true,
      };
      const newScenes = [
        ...data.scenes.slice(0, insertIndex),
        newScene,
        ...data.scenes.slice(insertIndex),
      ].map((scene, idx) => ({ ...scene, id: idx + 1 })); // Re-assign IDs
      onUpdateData({ ...data, scenes: newScenes });
    },
    [data, onUpdateData, aspectRatio, frameMode]
  );

  // Export storyboard data as JSON
  const handleExport = useCallback(() => {
    const exportData: StoryboardData = {
      ...data,
      style_prefix: stylePrefix || undefined,
      characters: characters.filter((c) => c.name.trim()),
      locations: locations.filter((l) => l.name.trim()),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `storyboard-${data.title || 'untitled'}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, stylePrefix, characters, locations]);

  // Import storyboard data from JSON file
  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const importedData = JSON.parse(content) as StoryboardData;

          // Validate basic structure
          if (!importedData.scenes || !Array.isArray(importedData.scenes)) {
            throw new Error('Invalid storyboard format: missing scenes array');
          }

          // Ensure all scenes have required fields
          const validatedScenes = importedData.scenes.map((scene, idx) => ({
            id: idx + 1,
            visual_prompt: scene.visual_prompt || '',
            video_prompt: scene.video_prompt || '',
            duration: scene.duration || '5s',
            aspect_ratio: scene.aspect_ratio || aspectRatio,
            shot_type: scene.shot_type || 'medium_shot',
            frame_role: scene.frame_role || 'first_frame',
            camera_movement: scene.camera_movement,
            characters: scene.characters,
            location: scene.location,
            dialogue: scene.dialogue,
            mood: scene.mood,
            transition: scene.transition,
            selected: true,
          }));

          const newData: StoryboardData = {
            ...importedData,
            frame_mode: importedData.frame_mode || 'first_frame',
            scenes: validatedScenes,
          };

          onUpdateData(newData);

          // Update local state if imported data has these fields
          if (importedData.style_prefix) {
            setStylePrefix(importedData.style_prefix);
          }
          if (importedData.characters) {
            setCharacters(importedData.characters);
          }
          if (importedData.locations) {
            setLocations(importedData.locations);
          }

          console.log('[StoryboardPreview] Imported storyboard:', newData);
        } catch (error) {
          console.error('[StoryboardPreview] Import failed:', error);
          alert('导入失败：请确保文件格式正确');
        }
      };
      reader.readAsText(file);

      // Reset input value to allow re-importing same file
      e.target.value = '';
    },
    [onUpdateData, aspectRatio]
  );

  // Template selection
  const [showTemplates, setShowTemplates] = useState(false);

  const handleApplyTemplate = useCallback(
    (template: StoryboardTemplate) => {
      const newData = applyTemplate(template, aspectRatio);
      onUpdateData(newData);
      if (template.style_prefix) {
        setStylePrefix(template.style_prefix);
      }
      setFrameMode(template.frame_mode);
      setShowTemplates(false);
    },
    [onUpdateData, aspectRatio]
  );

  const handleSelectAll = () => {
    const updatedScenes = data.scenes.map((scene) => ({ ...scene, selected: true }));
    onUpdateData({ ...data, scenes: updatedScenes });
  };

  const handleDeselectAll = () => {
    const updatedScenes = data.scenes.map((scene) => ({ ...scene, selected: false }));
    onUpdateData({ ...data, scenes: updatedScenes });
  };

  const handleFrameModeChange = (mode: StoryboardFrameMode) => {
    setFrameMode(mode);
    onUpdateData({ ...data, frame_mode: mode });
  };

  const handleAspectRatioChange = (ratio: '16:9' | '9:16') => {
    setAspectRatio(ratio);
    // Update all scenes with the new aspect ratio
    const updatedScenes = data.scenes.map((scene) => ({
      ...scene,
      aspect_ratio: ratio,
    }));
    onUpdateData({ ...data, scenes: updatedScenes });
  };

  // Character management
  const handleAddCharacter = () => {
    setCharacters([...characters, { name: '', description: '' }]);
  };

  const handleUpdateCharacter = (index: number, field: keyof StoryboardCharacter, value: string) => {
    const updated = [...characters];
    updated[index] = { ...updated[index], [field]: value };
    setCharacters(updated);
  };

  const handleRemoveCharacter = (index: number) => {
    setCharacters(characters.filter((_, i) => i !== index));
  };

  // Location management
  const handleAddLocation = () => {
    setLocations([...locations, { name: '', description: '' }]);
  };

  const handleUpdateLocation = (index: number, field: keyof StoryboardLocation, value: string) => {
    const updated = [...locations];
    updated[index] = { ...updated[index], [field]: value };
    setLocations(updated);
  };

  const handleRemoveLocation = (index: number) => {
    setLocations(locations.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const newScenes = [...data.scenes];
      const [removed] = newScenes.splice(dragIndex, 1);
      newScenes.splice(dragOverIndex, 0, removed);
      // Re-assign IDs to maintain order
      const reorderedScenes = newScenes.map((scene, idx) => ({
        ...scene,
        id: idx + 1,
      }));
      onUpdateData({ ...data, scenes: reorderedScenes });
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // Batch edit handlers
  const handleBatchApplyDuration = () => {
    const updatedScenes = data.scenes.map((scene) =>
      scene.selected !== false ? { ...scene, duration: batchDuration } : scene
    );
    onUpdateData({ ...data, scenes: updatedScenes });
  };

  const handleBatchApplyCameraMovement = () => {
    const updatedScenes = data.scenes.map((scene) =>
      scene.selected !== false ? { ...scene, camera_movement: batchCameraMovement } : scene
    );
    onUpdateData({ ...data, scenes: updatedScenes });
  };

  const selectedCount = data.scenes.filter((s) => s.selected !== false).length;

  const handleConfirm = () => {
    // Filter out empty characters and locations
    const validCharacters = characters.filter((c) => c.name.trim());
    const validLocations = locations.filter((l) => l.name.trim());

    // Apply frame_mode to scene frame_role and aspect_ratio
    const finalData: StoryboardData = {
      ...data,
      frame_mode: frameMode,
      storyboard_mode: storyboardMode,
      // Consistency settings (方案一 + 方案二)
      style_prefix: stylePrefix.trim() || undefined,
      characters: validCharacters.length > 0 ? validCharacters : undefined,
      locations: validLocations.length > 0 ? validLocations : undefined,
      scenes: data.scenes
        .filter((s) => s.selected !== false)
        .map((scene, idx, arr) => {
          let frame_role = scene.frame_role;
          if (frameMode === 'first_frame') {
            frame_role = 'first_frame';
          } else if (frameMode === 'first_last') {
            // For first_last mode, alternate or mark appropriately
            frame_role = idx === arr.length - 1 ? 'last_frame' : 'first_frame';
          }
          // keyframes mode keeps original frame_role
          return { ...scene, frame_role, aspect_ratio: aspectRatio };
        }),
    };
    console.log('[StoryboardPreview] handleConfirm - input data:', JSON.stringify(data, null, 2));
    console.log('[StoryboardPreview] handleConfirm - finalData:', JSON.stringify(finalData, null, 2));
    onConfirm(finalData);
  };

  return (
    <div className="space-y-3">
      {/* Header with title and metadata */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-medium text-foreground/80">
            {data.title || '分镜预览'}
          </span>
          <span className="text-[10px] text-foreground/40">
            {data.scenes.length} 个分镜
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Template button */}
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className={cn(
              'p-1 transition',
              showTemplates
                ? 'text-green-400'
                : 'text-foreground/40 hover:text-foreground/70'
            )}
            title="分镜模板"
          >
            <FileText className="w-4 h-4" />
          </button>
          {/* Export button */}
          <button
            onClick={handleExport}
            className="p-1 text-foreground/40 hover:text-foreground/70 transition"
            title="导出分镜 JSON"
          >
            <Download className="w-4 h-4" />
          </button>
          {/* Import button */}
          <label
            className="p-1 text-foreground/40 hover:text-foreground/70 transition cursor-pointer"
            title="导入分镜 JSON"
          >
            <Upload className="w-4 h-4" />
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'p-1 transition',
              showSettings
                ? 'text-purple-400'
                : 'text-foreground/40 hover:text-foreground/70'
            )}
            title="一致性设置"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={onCancel}
            className="p-1 text-foreground/40 hover:text-foreground/70 transition"
            title="取消"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Storyboard Mode Switcher */}
      <div className="flex items-center gap-2 py-1">
        <span className="text-[10px] text-foreground/50">模式:</span>
        <div className="flex items-center gap-1 bg-background/50 rounded-md p-0.5">
          <button
            onClick={() => setStoryboardMode('quick')}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded transition-colors',
              storyboardMode === 'quick'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-foreground/50 hover:text-foreground/70'
            )}
            title="快速分镜模式"
          >
            ⚡ 快速
          </button>
          <button
            onClick={() => setStoryboardMode('cinematic')}
            className={cn(
              'px-2 py-0.5 text-[10px] rounded transition-colors',
              storyboardMode === 'cinematic'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-foreground/50 hover:text-foreground/70'
            )}
            title="影视级分镜模式 - 支持精确时间轴和角色配音"
          >
            🎬 影视级
          </button>
        </div>
        {storyboardMode === 'cinematic' && (
          <span className="text-[9px] text-purple-400/70">
            支持精确时间轴 · 角色配音参考
          </span>
        )}
      </div>

      {/* Quick Style Selector - Always visible */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] text-foreground/50 flex items-center gap-1">
            <Palette className="w-3 h-3" />
            画面风格
          </label>
          {stylePrefix && (
            <button
              onClick={() => setStylePrefix('')}
              className="text-[9px] text-foreground/40 hover:text-red-400 transition"
            >
              清除
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setStylePrefix(stylePrefix === preset.value ? '' : preset.value)}
              className={cn(
                'px-2 py-1 text-[9px] rounded border transition',
                stylePrefix === preset.value
                  ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                  : 'bg-card/60 text-foreground/60 border-border/50 hover:bg-card/80 hover:text-foreground/80 hover:border-purple-500/30'
              )}
              title={preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {stylePrefix && (
          <div className="text-[9px] text-purple-400/70 bg-purple-500/10 rounded px-2 py-1 break-words">
            {stylePrefix}
          </div>
        )}
      </div>

      {/* Template Selection Panel */}
      {showTemplates && (
        <div className="border border-green-500/30 rounded-lg p-2 bg-green-500/5 space-y-2">
          <div className="flex items-center gap-1 text-[10px] text-green-400 uppercase tracking-wider">
            <FileText className="w-3 h-3" />
            <span>选择分镜模板</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STORYBOARD_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => handleApplyTemplate(template)}
                className="text-left p-2 rounded border border-border/50 hover:border-green-500/50 hover:bg-green-500/10 transition"
              >
                <div className="text-[10px] font-medium text-foreground/80">
                  {template.name}
                </div>
                <div className="text-[9px] text-foreground/40 line-clamp-1">
                  {template.description}
                </div>
                <div className="flex gap-1 mt-1">
                  <span className="text-[8px] px-1 py-0.5 rounded bg-card/60 text-foreground/50">
                    {template.scenes.length}场
                  </span>
                  <span className="text-[8px] px-1 py-0.5 rounded bg-card/60 text-foreground/50">
                    {template.duration}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-foreground/30 italic">
            ⚠️ 应用模板将替换当前所有分镜内容
          </p>
        </div>
      )}

      {/* Consistency Settings Panel (方案二) */}
      {showSettings && (
        <div className="border border-purple-500/30 rounded-lg p-2 bg-purple-500/5 space-y-3">
          <div className="flex items-center gap-1 text-[10px] text-purple-400 uppercase tracking-wider">
            <Palette className="w-3 h-3" />
            <span>角色与场景一致性</span>
          </div>

          {/* Style Prefix with Presets */}
          <div className="space-y-2">
            <label className="text-[10px] text-foreground/50">风格前缀 (自动添加到每个提示词前)</label>
            {/* Style preset buttons */}
            <div className="flex flex-wrap gap-1">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setStylePrefix(preset.value)}
                  className={cn(
                    'px-2 py-0.5 text-[9px] rounded border transition',
                    stylePrefix === preset.value
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                      : 'bg-card/60 text-foreground/50 border-border/50 hover:bg-card/80 hover:text-foreground/70'
                  )}
                  title={preset.value}
                >
                  {preset.label}
                </button>
              ))}
              {stylePrefix && !STYLE_PRESETS.some(p => p.value === stylePrefix) && (
                <span className="px-2 py-0.5 text-[9px] bg-purple-500/20 text-purple-400 rounded border border-purple-500/50">
                  自定义
                </span>
              )}
            </div>
            {/* Custom input */}
            <input
              type="text"
              value={stylePrefix}
              onChange={(e) => setStylePrefix(e.target.value)}
              placeholder="输入自定义风格或点击上方预设"
              className="w-full px-2 py-1 text-[10px] bg-card/60 border border-border/50 rounded text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-purple-500/50"
            />
            {stylePrefix && (
              <button
                onClick={() => setStylePrefix('')}
                className="text-[9px] text-foreground/40 hover:text-red-400 transition"
              >
                清除风格
              </button>
            )}
          </div>

          {/* Characters */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-foreground/50 flex items-center gap-1">
                <Users className="w-3 h-3" />
                角色定义
              </label>
              <button
                onClick={handleAddCharacter}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                添加
              </button>
            </div>
            {characters.length === 0 ? (
              <p className="text-[9px] text-foreground/30 italic">暂无角色定义</p>
            ) : (
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {characters.map((char, idx) => (
                  <div key={idx} className="space-y-1">
                    {/* Basic info row */}
                    <div className="flex gap-1 items-start">
                      <input
                        type="text"
                        value={char.name}
                        onChange={(e) => handleUpdateCharacter(idx, 'name', e.target.value)}
                        placeholder="角色名"
                        className="w-20 px-1.5 py-0.5 text-[10px] bg-card/60 border border-border/50 rounded text-foreground focus:outline-none focus:border-purple-500/50"
                      />
                      <input
                        type="text"
                        value={char.description}
                        onChange={(e) => handleUpdateCharacter(idx, 'description', e.target.value)}
                        placeholder="外观描述 (如: tall man with silver hair)"
                        className="flex-1 px-1.5 py-0.5 text-[10px] bg-card/60 border border-border/50 rounded text-foreground focus:outline-none focus:border-purple-500/50"
                      />
                      <button
                        onClick={() => handleRemoveCharacter(idx)}
                        className="p-0.5 text-foreground/30 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Cinematic mode extra fields */}
                    {storyboardMode === 'cinematic' && (
                      <div className="flex gap-1 items-start ml-0 pl-0">
                        <input
                          type="text"
                          value={char.personality || ''}
                          onChange={(e) => handleUpdateCharacter(idx, 'personality', e.target.value)}
                          placeholder="性格特点 (如: 开朗、内向、勇敢)"
                          className="flex-1 px-1.5 py-0.5 text-[10px] bg-purple-500/10 border border-purple-500/30 rounded text-foreground focus:outline-none focus:border-purple-500/50"
                        />
                        <select
                          value={char.voiceStyle || ''}
                          onChange={(e) => handleUpdateCharacter(idx, 'voiceStyle', e.target.value)}
                          className="w-24 px-1 py-0.5 text-[10px] bg-purple-500/10 border border-purple-500/30 rounded text-foreground focus:outline-none focus:border-purple-500/50"
                        >
                          <option value="">配音风格</option>
                          {VOICE_STYLE_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.value}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Locations */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-foreground/50 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                场景定义
              </label>
              <button
                onClick={handleAddLocation}
                className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                添加
              </button>
            </div>
            {locations.length === 0 ? (
              <p className="text-[9px] text-foreground/30 italic">暂无场景定义</p>
            ) : (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {locations.map((loc, idx) => (
                  <div key={idx} className="flex gap-1 items-start">
                    <input
                      type="text"
                      value={loc.name}
                      onChange={(e) => handleUpdateLocation(idx, 'name', e.target.value)}
                      placeholder="场景名"
                      className="w-20 px-1.5 py-0.5 text-[10px] bg-card/60 border border-border/50 rounded text-foreground focus:outline-none focus:border-purple-500/50"
                    />
                    <input
                      type="text"
                      value={loc.description}
                      onChange={(e) => handleUpdateLocation(idx, 'description', e.target.value)}
                      placeholder="环境描述 (如: futuristic city at night)"
                      className="flex-1 px-1.5 py-0.5 text-[10px] bg-card/60 border border-border/50 rounded text-foreground focus:outline-none focus:border-purple-500/50"
                    />
                    <button
                      onClick={() => handleRemoveLocation(idx)}
                      className="p-0.5 text-foreground/30 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-[9px] text-foreground/30 italic">
            💡 定义角色和场景后，生成时会自动替换提示词中的相关名称，确保视觉一致性
          </p>

          {/* Preview of final prompt */}
          {(stylePrefix || characters.some(c => c.name && c.description)) && data.scenes[0] && (
            <div className="border-t border-purple-500/20 pt-2 mt-2 space-y-1">
              <span className="text-[9px] text-purple-400 uppercase tracking-wider">最终提示词预览</span>
              <p className="text-[9px] text-foreground/60 bg-card/40 rounded p-1.5 break-words">
                {stylePrefix && <span className="text-purple-400">{stylePrefix}, </span>}
                {(() => {
                  let prompt = data.scenes[0].visual_prompt;
                  // Highlight character replacements
                  characters.forEach(char => {
                    if (char.name && char.description) {
                      const regex = new RegExp(char.name, 'gi');
                      prompt = prompt.replace(regex, char.description);
                    }
                  });
                  return prompt;
                })()}
              </p>
              <p className="text-[8px] text-foreground/30">
                (以第一个分镜为例，紫色部分为风格前缀)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Frame mode selector */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-foreground/40">
          分镜模式 (AI 推荐: {data.frame_mode || 'first_frame'})
        </label>
        <div className="flex gap-1">
          {[
            { value: 'first_frame', label: '首帧', desc: '快速' },
            { value: 'first_last', label: '首尾帧', desc: '过渡' },
            { value: 'keyframes', label: '关键帧', desc: '精细' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleFrameModeChange(option.value as StoryboardFrameMode)}
              className={cn(
                'flex-1 py-1.5 px-2 text-[10px] rounded transition',
                frameMode === option.value
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                  : 'bg-card/60 text-foreground/50 border border-transparent hover:bg-card/80'
              )}
            >
              {option.label}
              <span className="block text-[8px] opacity-60">{option.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect ratio selector */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-foreground/40">
          画面比例
        </label>
        <div className="flex gap-1">
          <button
            onClick={() => handleAspectRatioChange('16:9')}
            className={cn(
              'flex-1 py-1.5 px-2 text-[10px] rounded transition flex items-center justify-center gap-1',
              aspectRatio === '16:9'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-card/60 text-foreground/50 border border-transparent hover:bg-card/80'
            )}
          >
            <Monitor className="w-3 h-3" />
            <span>16:9 横屏</span>
          </button>
          <button
            onClick={() => handleAspectRatioChange('9:16')}
            className={cn(
              'flex-1 py-1.5 px-2 text-[10px] rounded transition flex items-center justify-center gap-1',
              aspectRatio === '9:16'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-card/60 text-foreground/50 border border-transparent hover:bg-card/80'
            )}
          >
            <Smartphone className="w-3 h-3" />
            <span>9:16 竖屏</span>
          </button>
        </div>
      </div>

      {/* Selection controls */}
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-foreground/40">
          已选 {selectedCount}/{data.scenes.length}
        </span>
        <button
          onClick={handleSelectAll}
          className="text-blue-400 hover:text-blue-300 transition"
        >
          全选
        </button>
        <button
          onClick={handleDeselectAll}
          className="text-foreground/50 hover:text-foreground/70 transition"
        >
          全不选
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowBatchEdit(!showBatchEdit)}
          className={cn(
            'px-2 py-0.5 rounded transition',
            showBatchEdit
              ? 'bg-orange-500/20 text-orange-400'
              : 'bg-card/60 text-foreground/50 hover:bg-card/80'
          )}
        >
          批量编辑
        </button>
      </div>

      {/* Batch edit panel */}
      {showBatchEdit && selectedCount > 0 && (
        <div className="border border-orange-500/30 rounded-lg p-2 bg-orange-500/5 space-y-2">
          <div className="text-[10px] text-orange-400">批量修改已选中的 {selectedCount} 个分镜</div>

          <div className="flex gap-2">
            {/* Batch duration */}
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-foreground/50">时长</label>
              <div className="flex gap-1">
                <select
                  value={batchDuration}
                  onChange={(e) => setBatchDuration(e.target.value)}
                  className="flex-1 px-1.5 py-0.5 text-[10px] bg-card/60 border border-border/50 rounded text-foreground"
                >
                  <option value="3s">3秒</option>
                  <option value="5s">5秒</option>
                  <option value="8s">8秒</option>
                  <option value="10s">10秒</option>
                </select>
                <button
                  onClick={handleBatchApplyDuration}
                  className="px-2 py-0.5 text-[9px] bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30"
                >
                  应用
                </button>
              </div>
            </div>

            {/* Batch camera movement */}
            <div className="flex-1 space-y-1">
              <label className="text-[9px] text-foreground/50">镜头运动</label>
              <div className="flex gap-1">
                <select
                  value={batchCameraMovement}
                  onChange={(e) => setBatchCameraMovement(e.target.value as CameraMovement)}
                  className="flex-1 px-1.5 py-0.5 text-[10px] bg-card/60 border border-border/50 rounded text-foreground"
                >
                  {CAMERA_MOVEMENT_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleBatchApplyCameraMovement}
                  className="px-2 py-0.5 text-[9px] bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30"
                >
                  应用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene list */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {data.scenes.map((scene, index) => (
          <StoryboardPreviewCard
            key={scene.id}
            scene={scene}
            index={index}
            isSelected={scene.selected !== false}
            onToggleSelect={handleToggleSelect}
            onUpdateScene={handleUpdateScene}
            onGenerateThumbnail={handleGenerateThumbnail}
            onDeleteScene={handleDeleteScene}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            isDragging={dragIndex === index}
            dragOverIndex={dragOverIndex}
            stylePrefix={stylePrefix}
            aspectRatio={aspectRatio}
          />
        ))}

        {/* Add scene button */}
        <button
          onClick={() => handleAddScene()}
          className="w-full py-2 border border-dashed border-border/50 rounded-lg text-[10px] text-foreground/40 hover:text-foreground/60 hover:border-foreground/30 transition flex items-center justify-center gap-1"
        >
          <Plus className="w-3 h-3" />
          添加分镜
        </button>
      </div>

      {/* Metadata summary */}
      {data.metadata && (
        <div className="flex flex-wrap gap-2 text-[10px] text-foreground/40">
          {data.metadata.total_duration && (
            <span>总时长: {data.metadata.total_duration}</span>
          )}
          {data.metadata.style && <span>风格: {data.metadata.style}</span>}
          {data.metadata.genre && <span>类型: {data.metadata.genre}</span>}
        </div>
      )}

      {/* Generation Progress Panel */}
      {generationProgress && generationProgress.length > 0 && (
        <div className="border border-cyan-500/30 rounded-lg p-2 bg-cyan-500/5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-cyan-400 uppercase tracking-wider">
              <Film className="w-3 h-3" />
              <span>生成进度</span>
            </div>
            {(() => {
              const completed = generationProgress.filter(
                p => p.imageStatus === 'completed' && (p.videoStatus === 'completed' || p.videoStatus === 'idle')
              ).length;
              const failed = generationProgress.filter(
                p => p.imageStatus === 'failed' || p.videoStatus === 'failed'
              ).length;
              const total = generationProgress.length;
              return (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-green-400">{completed}/{total} 完成</span>
                  {failed > 0 && <span className="text-red-400">{failed} 失败</span>}
                  {isExecuting && (
                    <span className="text-cyan-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      生成中
                    </span>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-card/60 rounded-full overflow-hidden">
            {(() => {
              const completed = generationProgress.filter(
                p => p.imageStatus === 'completed' && (p.videoStatus === 'completed' || p.videoStatus === 'idle')
              ).length;
              const processing = generationProgress.filter(
                p => p.imageStatus === 'processing' || p.videoStatus === 'processing'
              ).length;
              const failed = generationProgress.filter(
                p => p.imageStatus === 'failed' || p.videoStatus === 'failed'
              ).length;
              const total = generationProgress.length;
              const completedPct = (completed / total) * 100;
              const processingPct = (processing / total) * 100;
              const failedPct = (failed / total) * 100;
              return (
                <div className="h-full flex">
                  <div className="bg-green-500 transition-all" style={{ width: `${completedPct}%` }} />
                  <div className="bg-cyan-500 animate-pulse transition-all" style={{ width: `${processingPct}%` }} />
                  <div className="bg-red-500 transition-all" style={{ width: `${failedPct}%` }} />
                </div>
              );
            })()}
          </div>

          {/* Per-scene status */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 max-h-32 overflow-y-auto">
            {generationProgress.map((progress) => {
              const scene = data.scenes.find(s => s.id === progress.sceneId);
              const hasFailure = progress.imageStatus === 'failed' || progress.videoStatus === 'failed';
              const isComplete = progress.imageStatus === 'completed' &&
                (progress.videoStatus === 'completed' || progress.videoStatus === 'idle');
              const isProcessing = progress.imageStatus === 'processing' || progress.videoStatus === 'processing';
              const isPending = progress.imageStatus === 'pending' || progress.videoStatus === 'pending';

              return (
                <div
                  key={progress.sceneId}
                  className={cn(
                    'relative p-1.5 rounded border text-[9px] flex flex-col items-center gap-1',
                    hasFailure ? 'border-red-500/50 bg-red-500/10' :
                    isComplete ? 'border-green-500/50 bg-green-500/10' :
                    isProcessing ? 'border-cyan-500/50 bg-cyan-500/10' :
                    'border-border/50 bg-card/40'
                  )}
                >
                  <span className="text-foreground/60">分镜 {progress.sceneId}</span>
                  <div className="flex items-center gap-1">
                    {/* Image status */}
                    <div className="flex items-center gap-0.5" title={`图像: ${progress.imageStatus}`}>
                      <ImageIcon className="w-2.5 h-2.5" />
                      {progress.imageStatus === 'completed' && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                      {progress.imageStatus === 'failed' && <XCircle className="w-2.5 h-2.5 text-red-400" />}
                      {progress.imageStatus === 'processing' && <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />}
                      {progress.imageStatus === 'pending' && <Clock className="w-2.5 h-2.5 text-foreground/30" />}
                    </div>
                    {/* Video status (if applicable) */}
                    {progress.videoStatus !== 'idle' && (
                      <div className="flex items-center gap-0.5" title={`视频: ${progress.videoStatus}`}>
                        <Video className="w-2.5 h-2.5" />
                        {progress.videoStatus === 'completed' && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                        {progress.videoStatus === 'failed' && <XCircle className="w-2.5 h-2.5 text-red-400" />}
                        {progress.videoStatus === 'processing' && <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />}
                        {progress.videoStatus === 'pending' && <Clock className="w-2.5 h-2.5 text-foreground/30" />}
                      </div>
                    )}
                  </div>
                  {/* Retry button for failed scenes */}
                  {hasFailure && onRetryScene && (
                    <button
                      onClick={() => onRetryScene(progress.sceneId)}
                      className="mt-0.5 px-1.5 py-0.5 text-[8px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 flex items-center gap-0.5"
                    >
                      <RefreshCw className="w-2 h-2" />
                      重试
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Retry all failed button */}
          {onRetryAllFailed && generationProgress.some(p => p.imageStatus === 'failed' || p.videoStatus === 'failed') && (
            <button
              onClick={onRetryAllFailed}
              className="w-full py-1.5 text-[10px] bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              重试所有失败项
            </button>
          )}

          {/* Completion message */}
          {!isExecuting && generationProgress.every(p =>
            (p.imageStatus === 'completed' || p.imageStatus === 'failed') &&
            (p.videoStatus === 'completed' || p.videoStatus === 'failed' || p.videoStatus === 'idle')
          ) && (
            <div className={cn(
              'text-[10px] text-center py-1 rounded',
              generationProgress.every(p =>
                p.imageStatus === 'completed' && (p.videoStatus === 'completed' || p.videoStatus === 'idle')
              )
                ? 'bg-green-500/20 text-green-400'
                : 'bg-orange-500/20 text-orange-400'
            )}>
              {generationProgress.every(p =>
                p.imageStatus === 'completed' && (p.videoStatus === 'completed' || p.videoStatus === 'idle')
              ) ? (
                <span className="flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  所有分镜生成完成！
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  生成完成，部分失败
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={selectedCount === 0}
          className={cn(
            'flex-1 py-2 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1',
            selectedCount > 0
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-card/60 text-foreground/30 cursor-not-allowed'
          )}
        >
          <Film className="w-3 h-3" />
          生成 {selectedCount} 组分镜
        </button>
        {onConfirmAndExecute && (
          <button
            onClick={() => onConfirmAndExecute(data)}
            disabled={selectedCount === 0}
            className={cn(
              'flex-1 py-2 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1',
              selectedCount > 0
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-card/60 text-foreground/30 cursor-not-allowed'
            )}
          >
            <Play className="w-3 h-3" />
            生成并执行
          </button>
        )}
        <button
          onClick={onCancel}
          className="px-4 py-2 text-xs bg-card/60 text-foreground/50 rounded-lg hover:bg-card/80 transition"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export default StoryboardPreview;
