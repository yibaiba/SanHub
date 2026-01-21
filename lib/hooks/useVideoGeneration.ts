import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from '@/components/ui/toaster';
import { fileToBase64 } from '@/lib/utils';
import type { Task } from '@/components/generator/result-gallery';
import type { Generation, CharacterCard, SafeVideoModel, DailyLimitConfig } from '@/types';

type CreationMode = 'normal' | 'remix' | 'storyboard';
type VideoEngine = 'sora' | 'veo';
type Veo3Mode = 't2v' | 'i2v' | 'r2v';

interface DailyUsage {
  imageCount: number;
  videoCount: number;
  characterCardCount: number;
}

interface FileData {
  data: string;
  mimeType: string;
  preview: string;
  file?: File;
}

interface VideoGenerationState {
  videoEngine: VideoEngine;
  creationMode: CreationMode;
  veo3Mode: Veo3Mode;
  availableModels: SafeVideoModel[];
  selectedModelId: string;
  aspectRatio: string;
  duration: string;
  prompt: string;
  files: FileData[];
  selectedStyle: string | null;
  remixUrl: string;
  storyboardPrompt: string;
  tasks: Task[];
  generations: Generation[];
  submitting: boolean;
  enhancing: boolean;
  error: string;
  keepPrompt: boolean;
  dailyUsage: DailyUsage;
  dailyLimits: DailyLimitConfig;
  currentPage: number;
  hasMoreHistory: boolean;
  loadingHistory: boolean;
  characterCards: CharacterCard[];
  modelsLoaded: boolean;
}

interface UseVideoGenerationReturn {
  state: VideoGenerationState;
  actions: {
    setVideoEngine: (engine: VideoEngine) => void;
    setCreationMode: (mode: CreationMode) => void;
    setVeo3Mode: (mode: Veo3Mode) => void;
    setSelectedModelId: (id: string) => void;
    setAspectRatio: (ratio: string) => void;
    setDuration: (duration: string) => void;
    setPrompt: (prompt: string) => void;
    setFiles: (files: FileData[] | ((prev: FileData[]) => FileData[])) => void;
    setSelectedStyle: (style: string | null) => void;
    setRemixUrl: (url: string) => void;
    setStoryboardPrompt: (prompt: string) => void;
    setKeepPrompt: (keep: boolean) => void;
    setError: (error: string) => void;
    setSubmitting: (submitting: boolean) => void;
    setEnhancing: (enhancing: boolean) => void;
    setTasks: (tasks: Task[] | ((prev: Task[]) => Task[])) => void;
    setGenerations: (generations: Generation[] | ((prev: Generation[]) => Generation[])) => void;
    handleLoadMoreHistory: () => Promise<void>;
  };
  currentModel: SafeVideoModel | undefined;
  filteredModels: SafeVideoModel[];
  isVideoLimitReached: boolean;
}

export function useVideoGeneration(): UseVideoGenerationReturn {
  // Engine & Mode
  const [videoEngine, setVideoEngine] = useState<VideoEngine>('sora');
  const [creationMode, setCreationMode] = useState<CreationMode>('normal');
  const [veo3Mode, setVeo3Mode] = useState<Veo3Mode>('i2v');

  // Models
  const [availableModels, setAvailableModels] = useState<SafeVideoModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Parameters
  const [aspectRatio, setAspectRatio] = useState<string>('landscape');
  const [duration, setDuration] = useState<string>('10s');

  // Content
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<FileData[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [remixUrl, setRemixUrl] = useState('');
  const [storyboardPrompt, setStoryboardPrompt] = useState('');

  // Tasks & Results
  const [tasks, setTasks] = useState<Task[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);

  // UI State
  const [submitting, setSubmitting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState('');
  const [keepPrompt, setKeepPrompt] = useState(false);

  // Daily Limits
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({
    imageCount: 0,
    videoCount: 0,
    characterCardCount: 0,
  });
  const [dailyLimits, setDailyLimits] = useState<DailyLimitConfig>({
    imageLimit: 0,
    videoLimit: 0,
    characterCardLimit: 0,
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Character Cards
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);

  // Load models on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/video-models');
        if (res.ok) {
          const data = await res.json();
          const models = data.data?.models || [];
          setAvailableModels(models);
          if (models.length > 0) {
            setSelectedModelId((prev) => {
              if (prev) return prev;
              setAspectRatio(models[0].defaultAspectRatio);
              setDuration(models[0].defaultDuration);
              return models[0].id;
            });
          }
        }
      } catch (err) {
        console.error('Failed to load models:', err);
      } finally {
        setModelsLoaded(true);
      }
    };
    loadModels();
  }, []);

  // Load daily usage on mount
  useEffect(() => {
    const loadDailyUsage = async () => {
      try {
        const res = await fetch('/api/user/daily-usage');
        if (res.ok) {
          const data = await res.json();
          setDailyUsage(data.data.usage);
          setDailyLimits(data.data.limits);
        }
      } catch (err) {
        console.error('Failed to load daily usage:', err);
      }
    };
    loadDailyUsage();
  }, []);

  // Load character cards on mount
  useEffect(() => {
    const loadCharacterCards = async () => {
      try {
        const res = await fetch('/api/user/character-cards');
        if (res.ok) {
          const data = await res.json();
          const completedCards = (data.data || []).filter(
            (c: CharacterCard) => c.status === 'completed' && c.characterName
          );
          setCharacterCards(completedCards);
        }
      } catch (err) {
        console.error('Failed to load character cards:', err);
      }
    };
    loadCharacterCards();
  }, []);

  // Get current selected model
  const currentModel = useMemo(() => {
    return availableModels.find((m) => m.id === selectedModelId) || availableModels[0];
  }, [availableModels, selectedModelId]);

  // Filter models based on engine and mode
  const filteredModels = useMemo(() => {
    if (videoEngine === 'sora') {
      return availableModels.filter((model) => {
        const modelName = model.name.toLowerCase();
        return !modelName.includes('veo');
      });
    } else {
      return availableModels.filter((model) => {
        const modelName = model.name.toLowerCase();
        const isVeo = modelName.includes('veo');

        if (!isVeo) return false;

        if (veo3Mode === 't2v') {
          return modelName.includes('文生视频');
        } else if (veo3Mode === 'i2v') {
          return modelName.includes('图生视频');
        } else if (veo3Mode === 'r2v') {
          return modelName.includes('多图生成') || modelName.includes('融合');
        }

        return false;
      });
    }
  }, [availableModels, videoEngine, veo3Mode]);

  // Auto-select first model when engine or mode changes
  useEffect(() => {
    if (filteredModels.length > 0) {
      const firstModel = filteredModels[0];
      setSelectedModelId(firstModel.id);
      setAspectRatio(firstModel.defaultAspectRatio);
      setDuration(firstModel.defaultDuration);
      // Clear files
      files.forEach((f) => URL.revokeObjectURL(f.preview));
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEngine, veo3Mode]);

  // Reset parameters when model changes
  useEffect(() => {
    const model = availableModels.find((m) => m.id === selectedModelId);
    if (model) {
      setAspectRatio(model.defaultAspectRatio);
      setDuration(model.defaultDuration);
      if (!model.features.imageToVideo) {
        setFiles((prev) => {
          prev.forEach((f) => URL.revokeObjectURL(f.preview));
          return [];
        });
      }
    }
  }, [selectedModelId, availableModels]);

  // Check if video limit is reached
  const isVideoLimitReached =
    dailyLimits.videoLimit > 0 && dailyUsage.videoCount >= dailyLimits.videoLimit;

  // Load more history
  const handleLoadMoreHistory = useCallback(async () => {
    if (loadingHistory || !hasMoreHistory) return;

    setLoadingHistory(true);
    try {
      const nextPage = currentPage + 1;
      const res = await fetch(`/api/user/history?limit=20&page=${nextPage}`);
      if (res.ok) {
        const data = await res.json();
        const videoGenerations = (data.data || []).filter(
          (g: Generation) => g.type === 'sora-video' || g.type === 'flow-video'
        );
        setGenerations((prev) => [...prev, ...videoGenerations]);
        setHasMoreHistory(videoGenerations.length === 20);
        setCurrentPage(nextPage);
      }
    } catch (err) {
      console.error('Failed to load more history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [currentPage, loadingHistory, hasMoreHistory]);

  return {
    state: {
      videoEngine,
      creationMode,
      veo3Mode,
      availableModels,
      selectedModelId,
      aspectRatio,
      duration,
      prompt,
      files,
      selectedStyle,
      remixUrl,
      storyboardPrompt,
      tasks,
      generations,
      submitting,
      enhancing,
      error,
      keepPrompt,
      dailyUsage,
      dailyLimits,
      currentPage,
      hasMoreHistory,
      loadingHistory,
      characterCards,
      modelsLoaded,
    },
    actions: {
      setVideoEngine,
      setCreationMode,
      setVeo3Mode,
      setSelectedModelId,
      setAspectRatio,
      setDuration,
      setPrompt,
      setFiles,
      setSelectedStyle,
      setRemixUrl,
      setStoryboardPrompt,
      setKeepPrompt,
      setError,
      setSubmitting,
      setEnhancing,
      setTasks,
      setGenerations,
      handleLoadMoreHistory,
    },
    currentModel,
    filteredModels,
    isVideoLimitReached,
  };
}
