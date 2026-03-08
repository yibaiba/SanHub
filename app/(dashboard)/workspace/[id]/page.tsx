'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { WORKFLOW_PRESETS } from '@/lib/workflow-templates';
import {
  ExecutionManager,
  StateManager,
  NodeExecutionState,
  WorkflowExporter,
  WorkflowImporter,
  estimateWorkflow,
  formatEstimate
} from '@/lib/workflow-engine';
import { useWorkflowEngine } from '@/components/workspace/hooks/useWorkflowEngine';
import { useParamHighlight } from '@/components/workspace/hooks/useParamHighlight';
import { getInheritableParams, formatSyncMessage } from '@/components/workspace/lib/param-inheritance';
import { buildWorkspaceChatRequestBody } from '@/components/workspace/lib/chat-request';
import { resolveExpectedMediaType } from '../../../../lib/media-url-validator';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Link2,
  Loader2,
  MousePointer2,
  Plus,
  RefreshCw,
  Video,
  Maximize2,
  RotateCcw,
  Save,
  Trash2,
  Wand2,
  XCircle,
  ZoomIn,
  ZoomOut,
  MessageSquare,
  FileText,
  Send,
  Image as ImageIcon,
  Play,
  Square,
  Upload,
  Share2,
  Copy,
  ToggleLeft,
  ToggleRight,
  LayoutTemplate,
  X as XIcon,
  Film,
  Scissors,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import type { CharacterCard, WorkspaceData, WorkspaceEdge, WorkspaceNode, WorkspaceNodeType, ChatModel, SafeImageModel, SafeVideoModel, StoryboardData, StoryboardScene, CameraMovement, PROMPT_TEMPLATES } from '@/types';
import { CAMERA_MOVEMENT_PRESETS } from '@/types';
import { StoryboardPreview } from '@/components/workspace/StoryboardPreview';
import { StoryboardSplitter, SliceData } from '@/components/workspace/StoryboardSplitter';
import { parseCinematicStoryboard, isCinematicFormat } from '@/lib/storyboard-parser';
import { uploadSlicesWithProgress } from '@/lib/slice-upload';
import { batchUpscaleWithFallback } from '@/lib/batch-upscale';
import { formatGenerationError } from '@/lib/error-formatter';

interface PromptTemplate {
  id: string;
  name: string;
  content: string;
}

// 获取图像分辨率显示文本
function getImageResolution(
  model: SafeImageModel,
  aspectRatio: string,
  imageSize?: string
): string {
  const ratioConfig = model.resolutions[aspectRatio];

  if (!ratioConfig) return '';

  // If ratioConfig is a string, it's either a pixel resolution (e.g., "1024x1024")
  // or a model name for simple ratio->model mapping
  if (typeof ratioConfig === 'string') {
    // Check if it looks like a pixel resolution
    if (/^\d+x\d+$/.test(ratioConfig)) {
      return ratioConfig;
    }
    // Otherwise it's a model name, don't display it
    return '';
  }

  // ratioConfig is an object: { imageSize: modelName or resolution }
  if (typeof ratioConfig === 'object' && imageSize) {
    const sizeConfig = ratioConfig[imageSize];
    if (typeof sizeConfig === 'string') {
      // Check if it looks like a pixel resolution
      if (/^\d+x\d+$/.test(sizeConfig)) {
        return sizeConfig;
      }
      // Otherwise it's a model name, display the imageSize instead
      return imageSize;
    }
  }

  // For models with imageSize feature, display the selected size
  if (model.features.imageSize && imageSize) {
    return imageSize;
  }

  return '';
}

// 尝试解析分镜 JSON（支持快速分镜和影视分镜两种格式）
function tryParseStoryboard(text: string): StoryboardData | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const json = JSON.parse(jsonMatch[0]);

    // Check if it's cinematic format (storyboard array with storyboardContent)
    if (isCinematicFormat(json)) {
      console.log('[tryParseStoryboard] Detected cinematic format, parsing...');
      return parseCinematicStoryboard(json);
    }

    // Quick mode format (scenes array)
    if (json.scenes && Array.isArray(json.scenes)) {
      // Ensure all scenes have selected: true by default
      json.scenes = json.scenes.map((scene: Record<string, unknown>, idx: number) => ({
        ...scene,
        id: scene.id ?? idx + 1,
        selected: true,
      }));
      // Set default frame_mode if not provided
      if (!json.frame_mode) {
        json.frame_mode = 'first_frame';
      }
      return json as StoryboardData;
    }
    return null;
  } catch {
    return null;
  }
}

const CHAT_MAX_LENGTH = 2000;

const MOBILE_NODE_OPTIONS: Array<{
  type: WorkspaceNodeType;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'chat', label: 'Chat', icon: MessageSquare },
  { type: 'prompt-template', label: 'Template', icon: FileText },
];

const BASE_CANVAS_WIDTH = 2400;
const BASE_CANVAS_HEIGHT = 1400;
const CANVAS_PADDING = 400; // Extra space beyond nodes
const NODE_WIDTH = 280;
const NODE_HEIGHT = 400; // Approximate node height
const HANDLE_OFFSET_Y = 24;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;

type DragState = { id: string; offsetX: number; offsetY: number } | null;

export default function WorkspaceEditorPage() {
  const params = useParams();
  const workspaceId = params?.id as string;
  const { update } = useSession();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const [workspaceName, setWorkspaceName] = useState('');
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [edges, setEdges] = useState<WorkspaceEdge[]>([]);
  const [characterCards, setCharacterCards] = useState<CharacterCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<DragState>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sourceNodeId?: string } | null>(null);
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  // Storyboard splitter state
  const [splitterOpen, setSplitterOpen] = useState(false);
  const [splitterImageUrl, setSplitterImageUrl] = useState<string | null>(null);
  const [splitterSourceNode, setSplitterSourceNode] = useState<WorkspaceNode | null>(null);
  const [splitterProgress, setSplitterProgress] = useState<{ stage: string; percent: number } | null>(null);
  // Perspective explosion state
  const [perspectiveProgress, setPerspectiveProgress] = useState<{ stage: string; percent: number } | null>(null);
  const [perspectiveSourceNode, setPerspectiveSourceNode] = useState<WorkspaceNode | null>(null);
  const [hoveredCard, setHoveredCard] = useState<{
    nodeId: string;
    card: CharacterCard;
    x: number;
    y: number;
  } | null>(null);
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [imageModels, setImageModels] = useState<SafeImageModel[]>([]);
  const [videoModels, setVideoModels] = useState<SafeVideoModel[]>([]);
  const nodesRef = useRef<WorkspaceNode[]>([]);
  const edgesRef = useRef<WorkspaceEdge[]>([]);

  // 参数高亮 hook
  const { highlightedNodes, triggerHighlight } = useParamHighlight();

  // 节点状态统计
  const nodeStatusCounts = useMemo(() => {
    let pending = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;

    for (const node of nodes) {
      const status = node.data.status;
      if (status === 'idle' || !status) pending++;
      else if (status === 'pending' || status === 'processing') running++;
      else if (status === 'completed') completed++;
      else if (status === 'failed') failed++;
    }

    return { pending, running, completed, failed };
  }, [nodes]);

  // Dynamic canvas size based on node positions
  const canvasSize = useMemo(() => {
    if (nodes.length === 0) {
      return { width: BASE_CANVAS_WIDTH, height: BASE_CANVAS_HEIGHT };
    }
    
    let maxX = 0;
    let maxY = 0;
    
    for (const node of nodes) {
      const nodeRight = node.position.x + NODE_WIDTH;
      const nodeBottom = node.position.y + NODE_HEIGHT;
      if (nodeRight > maxX) maxX = nodeRight;
      if (nodeBottom > maxY) maxY = nodeBottom;
    }
    
    return {
      width: Math.max(BASE_CANVAS_WIDTH, maxX + CANVAS_PADDING),
      height: Math.max(BASE_CANVAS_HEIGHT, maxY + CANVAS_PADDING),
    };
  }, [nodes]);

  const getCanvasPoint = useCallback(
    (event: PointerEvent | MouseEvent | React.PointerEvent<Element> | React.MouseEvent<Element>) => {
    const container = scrollRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    const x = (event.clientX - rect.left + container.scrollLeft) / zoom;
    const y = (event.clientY - rect.top + container.scrollTop) / zoom;
    return { x, y };
    },
    [zoom]
  );

  const getViewportCenter = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return { x: 0, y: 0 };
    return {
      x: (container.scrollLeft + container.clientWidth / 2) / zoom,
      y: (container.scrollTop + container.clientHeight / 2) / zoom,
    };
  }, [zoom]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const setNodesDirty = useCallback((updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => {
    setNodes((prev) => {
      const next = updater(prev);
      return next;
    });
    setDirty(true);
  }, []);

  const setEdgesDirty = useCallback((updater: (prev: WorkspaceEdge[]) => WorkspaceEdge[]) => {
    setEdges((prev) => {
      const next = updater(prev);
      return next;
    });
    setDirty(true);
  }, []);

  // Track if polling recovery has been done for this workspace load
  const pollingRecoveredRef = useRef(false);

  useEffect(() => {
    const loadWorkspace = async () => {
      setLoading(true);
      pollingRecoveredRef.current = false; // Reset on new load
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '加载失败');
        }
        const workspace = data.data;
        setWorkspaceName(workspace.name || '未命名工作空间');
        const workspaceData: WorkspaceData = workspace.data || { nodes: [], edges: [] };
        setNodes(Array.isArray(workspaceData.nodes) ? workspaceData.nodes : []);
        setEdges(Array.isArray(workspaceData.edges) ? workspaceData.edges : []);
        setDirty(false);
      } catch (error) {
        toast({
          title: '加载失败',
          description: error instanceof Error ? error.message : '加载工作空间失败',
        });
      } finally {
        setLoading(false);
      }
    };

    if (workspaceId) {
      loadWorkspace();
    }
  }, [workspaceId]);

  // 并行加载所有静态数据（角色卡、模型、模板等）
  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const [
          characterCardsRes,
          chatModelsRes,
          imageModelsRes,
          videoModelsRes,
          promptsRes,
        ] = await Promise.all([
          fetch('/api/user/character-cards'),
          fetch('/api/chat/models'),
          fetch('/api/image-models'),
          fetch('/api/video-models'),
          fetch('/api/prompts'),
        ]);

        // 并行解析 JSON
        const [
          characterCardsData,
          chatModelsData,
          imageModelsData,
          videoModelsData,
          promptsData,
        ] = await Promise.all([
          characterCardsRes.ok ? characterCardsRes.json() : { data: [] },
          chatModelsRes.ok ? chatModelsRes.json() : { data: [] },
          imageModelsRes.ok ? imageModelsRes.json() : { data: { models: [] } },
          videoModelsRes.ok ? videoModelsRes.json() : { data: { models: [] } },
          promptsRes.ok ? promptsRes.json() : { data: [] },
        ]);

        // 更新状态
        const completedCards = (characterCardsData.data || []).filter(
          (card: CharacterCard) => card.status === 'completed' && card.characterName
        );
        setCharacterCards(completedCards);
        setChatModels((chatModelsData.data || []).filter((m: ChatModel) => m.enabled));
        setImageModels(imageModelsData.data?.models || []);
        setVideoModels(videoModelsData.data?.models || []);
        setPromptTemplates(promptsData.data || []);
      } catch (error) {
        console.error('Failed to load static data:', error);
      }
    };

    loadStaticData();
  }, []);

  useEffect(() => {
    const abortControllers = abortControllersRef.current;
    return () => {
      abortControllers.forEach((controller) => controller.abort());
      abortControllers.clear();
    };
  }, [setNodesDirty]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workspaceName.trim() || '未命名工作空间',
          data: { nodes, edges },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '保存失败');
      }
      setDirty(false);
      toast({ title: '已保存' });
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '保存失败',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const exporter = new WorkflowExporter();
    exporter.exportWorkflow(workspaceId, nodes, edges, workspaceName).then(template => {
      const blob = exporter.generateDownload(template);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${workspaceName || 'workflow'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const template = JSON.parse(content);
        await applyTemplate(template);
      } catch (error) {
        toast({ title: '导入失败', description: '文件格式错误' });
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset
  };

  const applyTemplate = async (template: any) => {
    const importer = new WorkflowImporter();
    const validation = importer.validateTemplate(template);

    if (!validation.valid) {
      toast({ title: '导入失败', description: validation.errors.map(e => e.message).join(', ') });
      return;
    }

    const { nodes: newNodes, edges: newEdges } = importer.parseTemplate(template);

    // Check if workspace is empty
    if (nodes.length > 0) {
      if (!confirm('应用模板将清空当前工作流，是否继续？')) return;
    }

    setNodes(newNodes);
    setEdges(newEdges);
    setDirty(true);
    setTemplateModalOpen(false);
    toast({ title: '模板应用成功' });
  };

  const handleShare = async () => {
    const exporter = new WorkflowExporter();
    const template = await exporter.exportWorkflow(workspaceId, nodes, edges, workspaceName);

    try {
      setSaving(true);
      const res = await fetch('/api/share/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          template
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Copy to clipboard
      await navigator.clipboard.writeText(data.data.url);
      toast({ title: '分享链接已复制', description: '链接有效期永久有效' });
    } catch (error) {
      toast({ title: '分享失败', description: error instanceof Error ? error.message : '未知错误' });
    } finally {
      setSaving(false);
    }
  };

  const createNode = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }) => {
      const id = crypto.randomUUID();
      if (type === 'image') {
        const model = imageModels[0];
        return {
          id,
          type,
          name: '图片生成',
          position,
          data: {
            modelId: model?.id || '',
            aspectRatio: model?.defaultAspectRatio || '1:1',
            imageSize: model?.defaultImageSize,
            prompt: '',
            status: 'idle',
          },
        } as WorkspaceNode;
      }
      if (type === 'video') {
        const model = videoModels[0];
        return {
          id,
          type,
          name: '视频生成',
          position,
          data: {
            modelId: model?.id || '',
            aspectRatio: model?.defaultAspectRatio || 'landscape',
            duration: model?.defaultDuration || '10s',
            prompt: '',
            status: 'idle',
          },
        } as WorkspaceNode;
      }
      if (type === 'chat') {
        return {
          id,
          type,
          name: '聊天节点',
          position,
          data: {
            prompt: '',
            chatModelId: chatModels[0]?.id || '',
            chatMessages: [],
            chatOutput: '',
            inputImages: [],
            status: 'idle',
          },
        } as WorkspaceNode;
      }
      // prompt-template
      return {
        id,
        type,
        name: '提示词模板',
        position,
        data: {
          prompt: '',
          templateId: '',
          templateOutput: '',
          status: 'idle',
        },
      } as WorkspaceNode;
    },
    [chatModels, imageModels, videoModels]
  );

  const addNodeAt = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }) => {
      setNodesDirty((prev) => [...prev, createNode(type, position)]);
    },
    [createNode, setNodesDirty]
  );

  const handleAddNodeAtCenter = useCallback(
    (type: WorkspaceNodeType) => {
      const point = getViewportCenter();
      addNodeAt(type, point);
      setMobileAddOpen(false);
      setContextMenu(null);
    },
    [addNodeAt, getViewportCenter]
  );

  // Open storyboard splitter for an image node
  const openSplitter = useCallback((node: WorkspaceNode) => {
    if (node.data.outputUrl) {
      setSplitterImageUrl(node.data.outputUrl);
      setSplitterSourceNode(node);
      setSplitterOpen(true);
    }
  }, []);

  const handleCanvasContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (window.innerWidth < 640) {
      return;
    }
    const point = getCanvasPoint(event);
    setContextMenu(point);
  };

  const startDrag = (event: React.PointerEvent, node: WorkspaceNode) => {
    if (event.button !== 0) return;
    const point = getCanvasPoint(event);
    setDragging({
      id: node.id,
      offsetX: point.x - node.position.x,
      offsetY: point.y - node.position.y,
    });
    setContextMenu(null);
  };

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (dragging) {
        const point = getCanvasPoint(event);
        setNodesDirty((prev) =>
          prev.map((node) =>
            node.id === dragging.id
              ? {
                  ...node,
                  position: {
                    x: Math.max(0, point.x - dragging.offsetX),
                    y: Math.max(0, point.y - dragging.offsetY),
                  },
                }
              : node
          )
        );
      }
      if (connectingFrom) {
        setCursorPos(getCanvasPoint(event));
      }
    };
    const handleUp = () => {
      setDragging(null);
      setCursorPos(null);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [connectingFrom, dragging, getCanvasPoint, setNodesDirty]);

  const handleStartConnect = (nodeId: string) => {
    if (connectingFrom === nodeId) {
      setConnectingFrom(null);
      setCursorPos(null);
      return;
    }
    setConnectingFrom(nodeId);
    setCursorPos(null);
  };

  const handleFinishConnect = (nodeId: string) => {
    if (!connectingFrom || connectingFrom === nodeId) return;
    const fromNode = nodes.find((node) => node.id === connectingFrom);
    const toNode = nodes.find((node) => node.id === nodeId);
    if (!fromNode || !toNode) return;

    // Connection rules:
    // - chat node: can receive from image nodes (multiple), output to image/video nodes
    // - prompt-template node: no input, output to image/video/chat nodes
    // - image node: can receive from image/chat/prompt-template nodes
    // - video node: can receive from image/chat/prompt-template nodes

    if (toNode.type === 'video') {
      if (fromNode.type !== 'image' && fromNode.type !== 'chat' && fromNode.type !== 'prompt-template') {
        toast({ title: '视频节点仅支持图片、聊天或模板节点连接' });
        setConnectingFrom(null);
        return;
      }
    } else if (toNode.type === 'image') {
      if (fromNode.type !== 'image' && fromNode.type !== 'chat' && fromNode.type !== 'prompt-template') {
        toast({ title: '图片节点仅支持图片、聊天或模板节点连接' });
        setConnectingFrom(null);
        return;
      }
      if (fromNode.type === 'image') {
        const targetModel = imageModels.find(m => m.id === toNode.data.modelId) || imageModels[0];
        if (targetModel && !targetModel.features.imageToImage) {
          toast({ title: '该模型不支持参考图' });
          setConnectingFrom(null);
          return;
        }
      }
    } else if (toNode.type === 'chat') {
      // Chat node can receive from image nodes (for vision) or prompt-template nodes
      if (fromNode.type !== 'image' && fromNode.type !== 'prompt-template') {
        toast({ title: '聊天节点仅支持图片或模板节点连接' });
        setConnectingFrom(null);
        return;
      }
    } else if (toNode.type === 'prompt-template') {
      // Prompt template node has no input
      toast({ title: '提示词模板节点不支持输入连接' });
      setConnectingFrom(null);
      return;
    } else {
      setConnectingFrom(null);
      return;
    }

    // For chat nodes, allow multiple inputs from image nodes
    if (toNode.type === 'chat' && fromNode.type === 'image') {
      // Check if this edge already exists
      const existingEdge = edges.find((e) => e.from === fromNode.id && e.to === toNode.id);
      if (existingEdge) {
        toast({ title: '该连接已存在' });
        setConnectingFrom(null);
        return;
      }
      setEdgesDirty((prev) => [
        ...prev,
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    } else if ((toNode.type === 'image' || toNode.type === 'video') && (fromNode.type === 'chat' || fromNode.type === 'prompt-template')) {
      // Prompt/chat connection: replace only prompt/chat connections, keep image connections
      setEdgesDirty((prev) => [
        ...prev.filter((edge) => {
          if (edge.to !== nodeId) return true;
          const sourceNode = nodes.find((n) => n.id === edge.from);
          return sourceNode?.type === 'image'; // Keep image connections
        }),
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    } else if ((toNode.type === 'image' || toNode.type === 'video') && fromNode.type === 'image') {
      // Image connection: replace only image connections, keep prompt/chat connections
      setEdgesDirty((prev) => [
        ...prev.filter((edge) => {
          if (edge.to !== nodeId) return true;
          const sourceNode = nodes.find((n) => n.id === edge.from);
          return sourceNode?.type !== 'image'; // Keep non-image connections
        }),
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    } else {
      // For other connections, replace existing input of same type
      setEdgesDirty((prev) => [
        ...prev.filter((edge) => edge.to !== nodeId),
        { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
      ]);
    }

    // 参数继承和高亮
    const inheritResult = getInheritableParams(fromNode, toNode);
    if (inheritResult) {
      const { params, syncedParamNames } = inheritResult;
      // 更新目标节点的参数
      setNodesDirty((prev) =>
        prev.map((node) =>
          node.id === toNode.id
            ? { ...node, data: { ...node.data, ...params } }
            : node
        )
      );
      // 触发参数高亮
      if (syncedParamNames.length > 0) {
        triggerHighlight(toNode.id, syncedParamNames);
        const message = formatSyncMessage(params);
        if (message) {
          toast({ title: message });
        }
      }
    }

    setConnectingFrom(null);
  };

  const clampZoom = useCallback((value: number) => {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));
  }, []);

  const handleZoomIn = () => setZoom((prev) => clampZoom(prev + ZOOM_STEP));
  const handleZoomOut = () => setZoom((prev) => clampZoom(prev - ZOOM_STEP));
  const handleZoomReset = () => setZoom(1);
  const handleZoomFit = () => {
    const container = scrollRef.current;
    if (!container) return;
    const padding = 80;
    const nextZoom = clampZoom(
      Math.min(
        (container.clientWidth - padding) / canvasSize.width,
        (container.clientHeight - padding) / canvasSize.height
      )
    );
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!scrollRef.current) return;
        const scrollLeft = Math.max(0, (canvasSize.width * nextZoom - container.clientWidth) / 2);
        const scrollTop = Math.max(0, (canvasSize.height * nextZoom - container.clientHeight) / 2);
        scrollRef.current.scrollLeft = scrollLeft;
        scrollRef.current.scrollTop = scrollTop;
      });
    });
  };

  const handleCanvasWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!event.altKey) return;
      event.preventDefault();
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const canvasX = (container.scrollLeft + offsetX) / zoom;
      const canvasY = (container.scrollTop + offsetY) / zoom;
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const nextZoom = clampZoom(zoom + delta);
      if (nextZoom === zoom) return;
      container.scrollLeft = canvasX * nextZoom - offsetX;
      container.scrollTop = canvasY * nextZoom - offsetY;
      setZoom(nextZoom);
    },
    [clampZoom, zoom]
  );

  const incomingEdges = useMemo(() => {
    const map = new Map<string, WorkspaceEdge[]>();
    edges.forEach((edge) => {
      if (!map.has(edge.to)) map.set(edge.to, []);
      map.get(edge.to)?.push(edge);
    });
    return map;
  }, [edges]);

  const updateNodeData = useCallback((id: string, partial: Partial<WorkspaceNode['data']>) => {
    setNodesDirty((prev) =>
      prev.map((node) =>
        node.id === id
          ? {
              ...node,
              data: { ...node.data, ...partial },
            }
          : node
      )
    );
  }, [setNodesDirty]);

  const { runWorkflow, stopWorkflow, runBatchNodes, retryAllFailed, isExecuting, hasFailedNodes, failedNodeIds } = useWorkflowEngine({
    workspaceId,
    nodes,
    edges,
    imageModels,
    videoModels,
    chatModels,
    updateNodeData,
  });

  // 工作流执行预估
  const workflowEstimate = useMemo(() => {
    return estimateWorkflow(nodes, edges);
  }, [nodes, edges]);

  const { timeDisplay, costDisplay, isEmpty: estimateEmpty } = useMemo(() => {
    return formatEstimate(workflowEstimate);
  }, [workflowEstimate]);

  const updateNode = (id: string, partial: Partial<WorkspaceNode>) => {
    setNodesDirty((prev) => prev.map((node) => (node.id === id ? { ...node, ...partial } : node)));
  };

  const removeNode = (id: string) => {
    setNodesDirty((prev) => prev.filter((node) => node.id !== id));
    setEdgesDirty((prev) => prev.filter((edge) => edge.from !== id && edge.to !== id));
  };

  const duplicateNode = (id: string) => {
    const sourceNode = nodes.find((n) => n.id === id);
    if (!sourceNode) return;

    const newId = crypto.randomUUID();
    const newNode: WorkspaceNode = {
      ...sourceNode,
      id: newId,
      name: `${sourceNode.name} (copy)`,
      position: {
        x: sourceNode.position.x + 50,
        y: sourceNode.position.y + 50,
      },
      data: {
        ...sourceNode.data,
        status: 'idle',
        outputUrl: undefined,
        outputType: undefined,
        chatOutput: undefined,
        templateOutput: undefined,
        errorMessage: undefined,
        progress: undefined,
      },
    };
    setNodesDirty((prev) => [...prev, newNode]);
  };

  // Explode storyboard scenes into image -> video node pairs
  const explodeStoryboard = (chatNodeId: string, storyboardData: StoryboardData) => {
    console.log('[explodeStoryboard] Input data:', JSON.stringify(storyboardData, null, 2));

    if (!storyboardData?.scenes || !Array.isArray(storyboardData.scenes)) {
      toast({ title: '无效的分镜数据格式' });
      return;
    }

    // Filter only selected scenes
    const selectedScenes = storyboardData.scenes.filter(
      (scene) => scene.selected !== false
    );

    if (selectedScenes.length === 0) {
      toast({ title: '请至少选择一个分镜' });
      return;
    }

    const chatNode = nodes.find((n) => n.id === chatNodeId);
    if (!chatNode) return;

    const newNodes: WorkspaceNode[] = [];
    const newEdges: WorkspaceEdge[] = [];

    const startX = chatNode.position.x + 450;
    const startY = chatNode.position.y;
    const frameMode = storyboardData.frame_mode || 'first_frame';

    // Calculate layout based on aspect ratio
    // Portrait (9:16) nodes are taller, need more vertical space
    const baseAspectRatio = storyboardData.scenes[0]?.aspect_ratio || '16:9';
    const isPortrait = baseAspectRatio.includes('9:16') || baseAspectRatio === '9:16';

    // Vertical spacing: 720px for portrait, 580px for landscape
    const verticalSpacing = isPortrait ? 720 : 580;
    // Horizontal spacing between image and video nodes
    const horizontalSpacing = 420;

    // Smart model selection based on aspect ratio
    // Find image model that supports the aspect ratio
    const targetImageModel = imageModels.find(m =>
      m.aspectRatios.includes(baseAspectRatio) ||
      (isPortrait && m.aspectRatios.includes('9:16')) ||
      (!isPortrait && m.aspectRatios.includes('16:9'))
    ) || imageModels[0];

    // Find video model that supports image-to-video and matching aspect ratio
    const targetVideoModel = videoModels.find(m => {
      const supportsI2V = m.features.imageToVideo;
      const matchesRatio = m.aspectRatios.some(r =>
        (isPortrait && r.value === 'portrait') ||
        (!isPortrait && r.value === 'landscape')
      );
      return supportsI2V && matchesRatio;
    }) || videoModels.find(m => m.features.imageToVideo) || videoModels[0];

    console.log('[explodeStoryboard] Selected image model:', targetImageModel?.id, targetImageModel?.name);
    console.log('[explodeStoryboard] Selected video model:', targetVideoModel?.id, targetVideoModel?.name, 'I2V:', targetVideoModel?.features.imageToVideo);

    // Helper to generate short scene description from visual_prompt
    const getShortDescription = (scene: StoryboardScene): string => {
      // Try dialogue first (most descriptive)
      if (scene.dialogue) {
        return scene.dialogue.slice(0, 20) + (scene.dialogue.length > 20 ? '...' : '');
      }
      // Try extracting key action from visual_prompt
      const prompt = scene.visual_prompt || '';
      // Get first meaningful phrase (before comma or period)
      const firstPhrase = prompt.split(/[,，.。]/)[0].trim();
      if (firstPhrase.length > 0 && firstPhrase.length <= 30) {
        return firstPhrase;
      }
      // Fallback to first N characters
      if (prompt.length > 25) {
        return prompt.slice(0, 25) + '...';
      }
      return prompt || '未命名场景';
    };

    // Helper to assemble full prompt with consistency settings (方案三)
    // Format: [style_prefix], [character descriptions], [location description], [camera movement], [original prompt]
    const assemblePrompt = (
      originalPrompt: string,
      sceneCharacters?: string[],
      sceneLocation?: string,
      cameraMovement?: CameraMovement
    ): string => {
      const parts: string[] = [];

      // 1. Add style prefix
      if (storyboardData.style_prefix) {
        parts.push(storyboardData.style_prefix);
      }

      // 2. Add character descriptions
      // For cinematic mode: character "name" is already the full visual description
      // For quick mode: use name + description matching
      if (storyboardData.characters && storyboardData.characters.length > 0) {
        const isCinematicMode = storyboardData.storyboard_mode === 'cinematic';

        if (isCinematicMode) {
          // Cinematic mode: always include all character visual descriptions
          // because the AI prompt format uses name as full visual description
          const charDescriptions = storyboardData.characters
            .map(c => c.description || c.name)
            .filter(Boolean);
          if (charDescriptions.length > 0) {
            parts.push(`Characters: ${charDescriptions.join('; ')}`);
          }
        } else if (sceneCharacters && sceneCharacters.length > 0) {
          // Quick mode: match by scene's character references
          const charDescriptions = sceneCharacters
            .map(charName => {
              const charDef = storyboardData.characters?.find(c =>
                c.name === charName || c.alias?.includes(charName)
              );
              if (charDef?.description) {
                return `${charName}: ${charDef.description}`;
              }
              return null;
            })
            .filter(Boolean);

          if (charDescriptions.length > 0) {
            parts.push(charDescriptions.join(', '));
          }
        }
      }

      // 3. Add location description (if matches scene's location)
      if (sceneLocation && storyboardData.locations) {
        const locDef = storyboardData.locations.find(l => l.name === sceneLocation);
        if (locDef?.description) {
          parts.push(`Setting: ${locDef.description}`);
        }
      }

      // 4. Add camera movement (for video prompts)
      if (cameraMovement) {
        const movementPreset = CAMERA_MOVEMENT_PRESETS.find(p => p.value === cameraMovement);
        if (movementPreset) {
          parts.push(movementPreset.prompt);
        }
      }

      // 5. Add original prompt
      if (originalPrompt) {
        parts.push(originalPrompt);
      }

      return parts.join(', ');
    };

    // Helper to assemble video prompt with camera movement
    const assembleVideoPrompt = (
      originalPrompt: string,
      sceneCharacters?: string[],
      sceneLocation?: string,
      cameraMovement?: CameraMovement
    ): string => {
      return assemblePrompt(originalPrompt, sceneCharacters, sceneLocation, cameraMovement);
    };

    // Helper to create image node
    const createImageNode = (
      scene: StoryboardScene,
      sceneIndex: number,
      position: { x: number; y: number },
      frameLabel: string
    ): WorkspaceNode => {
      const sceneNum = scene.id || sceneIndex + 1;
      const shortDesc = getShortDescription(scene);
      const nodeName = `${sceneNum}. ${shortDesc} (${frameLabel})`;

      // Assemble full prompt with consistency settings
      const fullPrompt = assemblePrompt(
        scene.visual_prompt || '',
        scene.characters,
        scene.location
      );

      return {
        id: crypto.randomUUID(),
        type: 'image',
        name: nodeName,
        position,
        data: {
          prompt: fullPrompt,
          status: 'idle',
          modelId: targetImageModel?.id,
          aspectRatio: scene.aspect_ratio || targetImageModel?.defaultAspectRatio || '16:9',
        },
      };
    };

    // Helper to create video node
    const createVideoNode = (
      sceneId: number,
      videoPrompt: string,
      duration: string,
      position: { x: number; y: number },
      description?: string,
      sceneCharacters?: string[],
      sceneLocation?: string,
      cameraMovement?: CameraMovement
    ): WorkspaceNode => {
      const nodeName = description
        ? `${sceneId}. ${description} (视频)`
        : `分镜 ${sceneId} - 视频`;

      // Assemble full prompt with consistency settings and camera movement
      const fullPrompt = assembleVideoPrompt(videoPrompt, sceneCharacters, sceneLocation, cameraMovement);

      return {
        id: crypto.randomUUID(),
        type: 'video',
        name: nodeName,
        position,
        data: {
          prompt: fullPrompt,
          status: 'idle',
          modelId: targetVideoModel?.id,
          aspectRatio: isPortrait ? 'portrait' : 'landscape',
          duration: duration || targetVideoModel?.defaultDuration || '8s',
        },
      };
    };

    // Create story overview title node (using prompt-template type as info card)
    const storyTitle = storyboardData.title || '未命名故事';
    const totalDuration = storyboardData.metadata?.total_duration || `${selectedScenes.length * 8}s`;
    const style = storyboardData.metadata?.style || '';
    const genre = storyboardData.metadata?.genre || '';
    const modeLabel = frameMode === 'first_frame' ? '首帧模式' :
                      frameMode === 'first_last' ? '首尾帧模式' : '关键帧模式';

    const overviewContent = [
      `🎬 ${storyTitle}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📊 ${selectedScenes.length} 个分镜 | ${modeLabel}`,
      `⏱️ 预计时长: ${totalDuration}`,
      style ? `🎨 风格: ${style}` : '',
      genre ? `📁 类型: ${genre}` : '',
      `━━━━━━━━━━━━━━━━━━━━`,
      `分镜概览:`,
      ...selectedScenes.slice(0, 6).map((s, i) =>
        `  ${i + 1}. ${getShortDescription(s)}`
      ),
      selectedScenes.length > 6 ? `  ... 还有 ${selectedScenes.length - 6} 个分镜` : '',
    ].filter(Boolean).join('\n');

    const overviewNode: WorkspaceNode = {
      id: crypto.randomUUID(),
      type: 'prompt-template',
      name: `🎬 ${storyTitle}`,
      position: {
        x: startX - 50,
        y: startY - 180,
      },
      data: {
        prompt: overviewContent,
        templateOutput: overviewContent,
        status: 'completed',
      },
    };
    newNodes.push(overviewNode);

    // Different layout strategies based on frame mode
    if (frameMode === 'first_last') {
      // First-Last Frame Mode: pair scenes, two images connect to one video
      // Layout:
      //   首帧图片 ──┐
      //              ├──→ 视频节点
      //   尾帧图片 ──┘
      const pairSpacing = isPortrait ? 800 : 650; // Space between pairs
      const imageVerticalGap = isPortrait ? 380 : 280; // Gap between first and last frame images

      for (let i = 0; i < selectedScenes.length; i += 2) {
        const firstScene = selectedScenes[i];
        const lastScene = selectedScenes[i + 1];
        const pairIndex = Math.floor(i / 2);
        const yOffset = pairIndex * pairSpacing;

        // First frame image (top)
        const firstImageNode = createImageNode(
          firstScene,
          i,
          { x: startX, y: startY + yOffset },
          '首帧'
        );
        newNodes.push(firstImageNode);
        console.log('[explodeStoryboard] First frame:', firstScene.id, firstScene.visual_prompt);

        if (lastScene) {
          // Last frame image (bottom, below first frame)
          const lastImageNode = createImageNode(
            lastScene,
            i + 1,
            { x: startX, y: startY + yOffset + imageVerticalGap },
            '尾帧'
          );
          newNodes.push(lastImageNode);
          console.log('[explodeStoryboard] Last frame:', lastScene.id, lastScene.visual_prompt);

          // Video node (centered between the two images, to the right)
          const firstDesc = getShortDescription(firstScene);
          const videoNode = createVideoNode(
            firstScene.id || pairIndex + 1,
            firstScene.video_prompt || lastScene.video_prompt || '',
            firstScene.duration || lastScene.duration || '8s',
            { x: startX + horizontalSpacing, y: startY + yOffset + imageVerticalGap / 2 },
            firstDesc,
            firstScene.characters || lastScene.characters,
            firstScene.location || lastScene.location,
            firstScene.camera_movement || lastScene.camera_movement
          );
          newNodes.push(videoNode);

          // Connect both images to the video
          newEdges.push({
            id: `${firstImageNode.id}-${videoNode.id}`,
            from: firstImageNode.id,
            to: videoNode.id,
          });
          newEdges.push({
            id: `${lastImageNode.id}-${videoNode.id}`,
            from: lastImageNode.id,
            to: videoNode.id,
          });
        } else {
          // Odd number of scenes: last one is just first frame with video
          if (firstScene.frame_role !== 'storyboard_only') {
            const firstDesc = getShortDescription(firstScene);
            const videoNode = createVideoNode(
              firstScene.id || pairIndex + 1,
              firstScene.video_prompt || '',
              firstScene.duration || '8s',
              { x: startX + horizontalSpacing, y: startY + yOffset },
              firstDesc,
              firstScene.characters,
              firstScene.location,
              firstScene.camera_movement
            );
            newNodes.push(videoNode);

            newEdges.push({
              id: `${firstImageNode.id}-${videoNode.id}`,
              from: firstImageNode.id,
              to: videoNode.id,
            });
          }
        }
      }
    } else {
      // first_frame or keyframes mode: each scene gets one image + one video
      selectedScenes.forEach((scene, index) => {
        const yOffset = index * verticalSpacing;

        const frameLabel = scene.frame_role === 'storyboard_only' ? '分镜板' :
                           scene.frame_role === 'first_frame' ? '首帧' :
                           scene.frame_role === 'last_frame' ? '尾帧' : '关键帧';

        // Create image node
        const imageNode = createImageNode(
          scene,
          index,
          { x: startX, y: startY + yOffset },
          frameLabel
        );
        newNodes.push(imageNode);
        console.log('[explodeStoryboard] Scene', scene.id, '- visual_prompt:', scene.visual_prompt);

        // Video Node - only if not storyboard_only
        if (scene.frame_role !== 'storyboard_only') {
          const sceneDesc = getShortDescription(scene);
          const videoNode = createVideoNode(
            scene.id || index + 1,
            scene.video_prompt || '',
            scene.duration || '8s',
            { x: startX + horizontalSpacing, y: startY + yOffset },
            sceneDesc,
            scene.characters,
            scene.location,
            scene.camera_movement
          );
          newNodes.push(videoNode);

          // Link Image -> Video
          newEdges.push({
            id: `${imageNode.id}-${videoNode.id}`,
            from: imageNode.id,
            to: videoNode.id,
          });
        }
      });
    }

    // Update chat node to mark storyboard as confirmed and add new nodes
    setNodesDirty((prev) => [
      ...prev.map((node) =>
        node.id === chatNodeId
          ? { ...node, data: { ...node.data, storyboardStep: 'confirmed' as const } }
          : node
      ),
      ...newNodes
    ]);
    setEdgesDirty((prev) => [...prev, ...newEdges]);

    const toastModeLabel = frameMode === 'first_frame' ? '首帧' :
                      frameMode === 'first_last' ? '首尾帧' : '关键帧';
    toast({ title: `已生成 ${selectedScenes.length} 组分镜节点 (${toastModeLabel}模式)` });

    // Return created image node IDs for batch execution
    return newNodes.filter(n => n.type === 'image').map(n => n.id);
  };

  /**
   * Create node groups for storyboard slices
   * Each slice creates: Image (with uploaded image) -> Chat (看图生成提示词) -> Video
   */
  const createStoryboardSliceGroups = (params: {
    slices: Array<{ imageUrl: string; index: number }>;
    storyContext: string;
    sourceNodeId: string;
    sourcePosition: { x: number; y: number };
  }) => {
    const { slices, storyContext, sourcePosition } = params;

    const newNodes: WorkspaceNode[] = [];
    const newEdges: WorkspaceEdge[] = [];
    const imageNodeIds: string[] = [];
    const chatNodeIds: string[] = [];
    const videoNodeIds: string[] = [];

    // Layout configuration
    const horizontalGap = 320;
    const verticalGap = 200;
    const nodesPerRow = 4;

    // Get default models
    const defaultImageModel = imageModels[0];
    const defaultVideoModel = videoModels[0];
    const defaultChatModel = chatModels[0];

    slices.forEach(({ imageUrl, index }, i) => {
      const imageId = crypto.randomUUID();
      const chatId = crypto.randomUUID();
      const videoId = crypto.randomUUID();

      // Calculate position (grid layout)
      const row = Math.floor(i / nodesPerRow);
      const col = i % nodesPerRow;
      const baseX = sourcePosition.x + 400 + col * horizontalGap;
      const baseY = sourcePosition.y + row * (verticalGap * 3 + 100);

      // 1. Image Node - with pre-filled uploaded image (already completed)
      const imageNode: WorkspaceNode = {
        id: imageId,
        type: 'image',
        name: `切片 ${index + 1} - 图片`,
        position: { x: baseX, y: baseY },
        data: {
          prompt: '',
          modelId: defaultImageModel?.id || '',
          aspectRatio: '16:9',
          uploadedImages: [imageUrl],
          status: 'completed',
          outputUrl: imageUrl,
        },
      };
      newNodes.push(imageNode);
      imageNodeIds.push(imageId);

      // 2. Chat Node - configured to analyze image and generate video prompt
      const chatNode: WorkspaceNode = {
        id: chatId,
        type: 'chat',
        name: `切片 ${index + 1} - 提示词生成`,
        position: { x: baseX, y: baseY + verticalGap },
        data: {
          prompt: `请根据这张分镜图片，生成一段用于视频生成的提示词。

故事背景：
${storyContext}

要求：
1. 描述画面主体和动作
2. 描述镜头运动建议（如推进、平移、跟踪等）
3. 描述氛围和光影
4. 输出纯英文，不要 JSON 格式`,
          chatModelId: defaultChatModel?.id || '',
          inputImages: [imageUrl],
          pureMode: true,
          status: 'idle',
        },
      };
      newNodes.push(chatNode);
      chatNodeIds.push(chatId);

      // 3. Video Node
      const videoNode: WorkspaceNode = {
        id: videoId,
        type: 'video',
        name: `切片 ${index + 1} - 视频`,
        position: { x: baseX, y: baseY + verticalGap * 2 },
        data: {
          prompt: '',
          modelId: defaultVideoModel?.id || '',
          aspectRatio: '16:9',
          duration: '5s',
          status: 'idle',
        },
      };
      newNodes.push(videoNode);
      videoNodeIds.push(videoId);

      // Create edges: Image -> Chat, Chat -> Video, Image -> Video
      newEdges.push(
        { id: `${imageId}-${chatId}`, from: imageId, to: chatId },
        { id: `${chatId}-${videoId}`, from: chatId, to: videoId },
        { id: `${imageId}-${videoId}`, from: imageId, to: videoId }
      );
    });

    // Update state
    setNodesDirty((prev) => [...prev, ...newNodes]);
    setEdgesDirty((prev) => [...prev, ...newEdges]);

    toast({
      title: `已创建 ${slices.length} 组分镜节点`,
      description: 'Image → Chat → Video 节点组已自动连接',
    });

    return { imageNodeIds, chatNodeIds, videoNodeIds };
  };

  const removeEdge = (edgeId: string) => {
    setEdgesDirty((prev) => prev.filter((edge) => edge.id !== edgeId));
  };

  const insertCharacterMention = useCallback(
    (nodeId: string, mention: string) => {
      setNodesDirty((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          const currentPrompt = node.data.prompt || '';
          if (currentPrompt.includes(mention)) return node;
          const nextPrompt = currentPrompt.trim()
            ? `${currentPrompt.trim()} ${mention}`
            : mention;
          return {
            ...node,
            data: {
              ...node.data,
              prompt: nextPrompt,
            },
          };
        })
      );
    },
    [setNodesDirty]
  );

  const pollTaskStatus = useCallback(
    async (nodeId: string, taskId: string) => {
      if (abortControllersRef.current.has(nodeId)) return;
      const controller = new AbortController();
      abortControllersRef.current.set(nodeId, controller);
      let attempts = 0;
      let consecutiveErrors = 0;
      const maxAttempts = 240;
      const maxConsecutiveErrors = 5;

      const poll = async () => {
        if (controller.signal.aborted) return;
        if (attempts >= maxAttempts) {
          updateNodeData(nodeId, { status: 'failed', errorMessage: '任务超时' });
          abortControllersRef.current.delete(nodeId);
          return;
        }
        attempts += 1;
        try {
          const res = await fetch(`/api/generate/status/${taskId}`, {
            signal: controller.signal,
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || '查询任务状态失败');
          }
          // Reset error counter on success
          consecutiveErrors = 0;
          const status = data.data.status as string;
          const resultUrl = typeof data.data.url === 'string' ? data.data.url : '';
          const isCompletedStatus = status === 'completed' || status === 'succeeded';
          if (isCompletedStatus && resultUrl) {
            await update().catch(() => {});
            updateNodeData(nodeId, {
              status: 'completed',
              outputUrl: resultUrl,
              outputType: resolveExpectedMediaType(data.data.type || '') === 'video' ? 'video' : 'image',
              generationId: data.data.id,
              revisedPrompt: data.data.params?.revised_prompt,
              errorMessage: undefined,
            });
            abortControllersRef.current.delete(nodeId);
            toast({ title: '生成完成' });
          } else if (status === 'failed' || status === 'cancelled') {
            await update().catch(() => {});
            updateNodeData(nodeId, {
              status: 'failed',
              errorMessage: formatGenerationError(data.data.errorMessage || '生成失败'),
            });
            abortControllersRef.current.delete(nodeId);
          } else if (isCompletedStatus && !resultUrl) {
            updateNodeData(nodeId, {
              status: 'processing',
              errorMessage: undefined,
            });
            setTimeout(poll, 10000);
          } else {
            updateNodeData(nodeId, { status: status as WorkspaceNode['data']['status'] });
            setTimeout(poll, 10000);
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          consecutiveErrors += 1;
          const errMsg = error instanceof Error ? error.message : '网络错误';
          // Retry on transient network errors (socket closed, timeout, etc.)
          const isTransientError =
            errMsg.includes('socket') ||
            errMsg.includes('Socket') ||
            errMsg.includes('ECONNRESET') ||
            errMsg.includes('ETIMEDOUT') ||
            errMsg.includes('network') ||
            errMsg.includes('fetch');
          if (isTransientError && consecutiveErrors < maxConsecutiveErrors) {
            console.warn(`[Poll] Transient error (${consecutiveErrors}/${maxConsecutiveErrors}), retrying...`, errMsg);
            // Exponential backoff: 5s, 10s, 20s, 40s...
            const delay = Math.min(5000 * Math.pow(2, consecutiveErrors - 1), 60000);
            setTimeout(poll, delay);
            return;
          }
          updateNodeData(nodeId, {
            status: 'failed',
            errorMessage: formatGenerationError(errMsg),
          });
          abortControllersRef.current.delete(nodeId);
        }
      };

      await poll();
    },
    [update, updateNodeData]
  );

  // Recover polling for pending/processing nodes on workspace load
  useEffect(() => {
    if (loading || pollingRecoveredRef.current) return;
    
    const pendingNodes = nodes.filter(
      (node) =>
        (node.type === 'image' || node.type === 'video') &&
        (node.data.status === 'pending' || node.data.status === 'processing') &&
        node.data.generationId
    );

    if (pendingNodes.length > 0) {
      pollingRecoveredRef.current = true;
      pendingNodes.forEach((node) => {
        pollTaskStatus(node.id, node.data.generationId!);
      });
    }
  }, [loading, nodes, pollTaskStatus]);

  const handleGenerateNode = useCallback(async (node: WorkspaceNode) => {
    // Get prompt from node itself or from connected chat/template node
    let basePrompt = node.data.prompt.trim();
    
    // Check for connected chat or prompt-template node to get prompt
    const inputEdge = edgesRef.current.find((edge) => edge.to === node.id);
    if (inputEdge) {
      const inputNode = nodesRef.current.find((n) => n.id === inputEdge.from);
      if (inputNode?.type === 'chat' && inputNode.data.chatOutput) {
        // Use chat output as prompt if no prompt is set
        if (!basePrompt) {
          basePrompt = inputNode.data.chatOutput.trim();
        }
      } else if (inputNode?.type === 'prompt-template' && inputNode.data.templateOutput) {
        // Use template output as prompt if no prompt is set
        if (!basePrompt) {
          basePrompt = inputNode.data.templateOutput.trim();
        }
      }
    }

    try {
      if (node.type === 'image') {
        const model = imageModels.find(m => m.id === node.data.modelId) || imageModels[0];
        if (!model) {
          updateNodeData(node.id, { errorMessage: '无可用模型', status: 'failed' });
          return;
        }
        
        const imageInputEdge = edgesRef.current.find((edge) => edge.to === node.id);
        const imageInputNode = imageInputEdge
          ? nodesRef.current.find((n) => n.id === imageInputEdge.from && n.type === 'image')
          : undefined;
        
        // Use connected image output, or uploaded images if no connection
        let referenceImageUrl: string | undefined;
        let referenceImages: string[] | undefined;
        
        if (model.features.imageToImage) {
          if (imageInputNode?.data.outputUrl) {
            referenceImageUrl = imageInputNode.data.outputUrl;
          } else if (node.data.uploadedImages && node.data.uploadedImages.length > 0) {
            if (model.features.multipleImages) {
              referenceImages = node.data.uploadedImages;
            } else {
              referenceImageUrl = node.data.uploadedImages[0];
            }
          }
        }

        if (imageInputEdge && model.features.imageToImage && !referenceImageUrl && !referenceImages) {
          // 仅当模型明确要求必须有参考图时才报错，否则降级为文生图
          if (model.requiresReferenceImage) {
             updateNodeData(node.id, { errorMessage: '该模型需要参考图', status: 'failed' });
             return;
          }
        }
        if (model.requiresReferenceImage && !referenceImageUrl && !referenceImages) {
          updateNodeData(node.id, { errorMessage: '该模型需要参考图', status: 'failed' });
          return;
        }
        if (!basePrompt && !model.allowEmptyPrompt) {
          updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
          return;
        }

        updateNodeData(node.id, { status: 'pending', errorMessage: undefined });
        
        // 使用统一的图像生成 API
        const res = await fetch('/api/generate/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: model.id,
            prompt: basePrompt,
            aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
            imageSize: model.features.imageSize ? node.data.imageSize : undefined,
            referenceImageUrl,
            referenceImages,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '生成失败');
        }
        updateNodeData(node.id, { generationId: data.data.id, status: 'pending' });
        pollTaskStatus(node.id, data.data.id);
      } else {
        // Video generation
        if (!basePrompt) {
          updateNodeData(node.id, { errorMessage: '请输入提示词', status: 'failed' });
          return;
        }

        const model = videoModels.find(m => m.id === node.data.modelId) || videoModels[0];
        if (!model) {
          updateNodeData(node.id, { errorMessage: '无可用视频模型', status: 'failed' });
          return;
        }

        // Find image input node for reference image
        const videoInputEdge = edgesRef.current.find((edge) => edge.to === node.id);
        const videoInputNode = videoInputEdge
          ? nodesRef.current.find((n) => n.id === videoInputEdge.from && n.type === 'image')
          : undefined;

        // Collect reference images: from connected node or uploaded images
        const referenceImages: string[] = [];
        if (videoInputNode?.data.outputUrl) {
          referenceImages.push(videoInputNode.data.outputUrl);
        } else if (node.data.uploadedImages && node.data.uploadedImages.length > 0) {
          // Support multiple uploaded images for Veo models
          referenceImages.push(...node.data.uploadedImages);
        }

        // Veo 图生视频/融合模型必须有参考图
        const modelName = model.name?.toLowerCase() || '';
        const isVeoImageRequired = modelName.includes('图生视频') || modelName.includes('多图') || modelName.includes('融合');
        if (isVeoImageRequired && referenceImages.length === 0) {
          updateNodeData(node.id, { errorMessage: '该模型需要上传至少 1 张参考图片', status: 'failed' });
          return;
        }

        updateNodeData(node.id, { status: 'pending', errorMessage: undefined });

        // Auto-detect mode: Image-to-Video vs Text-to-Video
        const isImg2Vid = referenceImages.length > 0;

        // Build request body - use files array for multiple images, referenceImageUrl for single
        const requestBody: Record<string, unknown> = {
          modelId: model.id,
          prompt: basePrompt,
          aspectRatio: node.data.aspectRatio || model.defaultAspectRatio,
          duration: node.data.duration || model.defaultDuration,
        };

        if (isImg2Vid) {
          if (referenceImages.length === 1) {
            // Single image: use referenceImageUrl for backward compatibility
            requestBody.referenceImageUrl = referenceImages[0];
          } else {
            // Multiple images: convert to files array format
            requestBody.files = referenceImages.map((img) => {
              if (img.startsWith('data:')) {
                const match = img.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  return { mimeType: match[1], data: match[2] };
                }
              }
              // For URLs, they'll be fetched server-side
              return { mimeType: 'image/jpeg', data: img };
            });
          }
        }

        const res = await fetch('/api/generate/sora', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || '生成失败');
        }
        updateNodeData(node.id, { generationId: data.data.id, status: 'pending' });
        pollTaskStatus(node.id, data.data.id);
      }
    } catch (error) {
      updateNodeData(node.id, {
        status: 'failed',
        errorMessage: formatGenerationError(error instanceof Error ? error : '生成失败'),
      });
    }
  }, [imageModels, pollTaskStatus, updateNodeData, videoModels]);

    const handleChatGenerate = async (node: WorkspaceNode) => {
    let prompt = node.data.prompt.trim();
    if (!node.data.chatModelId) {
      updateNodeData(node.id, { errorMessage: '请选择聊天模型', status: 'failed' });
      return;
    }

    // Collect inputs from connected nodes
    const inputEdges = edgesRef.current.filter((edge) => edge.to === node.id);
    const inputImages: string[] = [];
    let templateContent = '';

    for (const edge of inputEdges) {
      const inputNode = nodesRef.current.find((n) => n.id === edge.from);
      if (inputNode?.type === 'image' && inputNode.data.outputUrl) {
        inputImages.push(inputNode.data.outputUrl);
      } else if (inputNode?.type === 'prompt-template' && inputNode.data.templateOutput) {
        templateContent = inputNode.data.templateOutput.trim();
      }
    }

    // Combine template content with user prompt
    if (templateContent && prompt) {
      prompt = `${templateContent}\n\n${prompt}`;
    } else if (templateContent && !prompt) {
      prompt = templateContent;
    }

    if (!prompt) {
      updateNodeData(node.id, { errorMessage: '请输入提示词或连接模板节点', status: 'failed' });
      return;
    }

    // Check if model supports vision when images are provided
    const selectedModel = chatModels.find((m) => m.id === node.data.chatModelId);
    if (inputImages.length > 0 && selectedModel && !selectedModel.supportsVision) {
      updateNodeData(node.id, { errorMessage: '该模型不支持图片输入', status: 'failed' });
      return;
    }

    updateNodeData(node.id, { status: 'pending', errorMessage: undefined, inputImages });

    try {
      const requestBody = buildWorkspaceChatRequestBody(node, prompt, inputImages, node.data.chatModelId);

      const res = await fetch('/api/chat/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '聊天失败');
      }

      // Check if response contains storyboard data
      const storyboardData = data.data.storyboardData || tryParseStoryboard(data.data.content);

      updateNodeData(node.id, {
        status: 'completed',
        chatOutput: data.data.content,
        chatMessages: [
          ...(node.data.chatMessages || []),
          { role: 'user', content: prompt },
          { role: 'assistant', content: data.data.content },
        ],
        errorMessage: undefined,
        // Update storyboard data if in storyboard mode and valid data received
        ...(node.data.storyboardMode && storyboardData ? {
          storyboardData,
          storyboardStep: 'preview' as const,
        } : {}),
      });
      toast({ title: node.data.storyboardMode && storyboardData ? '分镜规划完成' : '聊天完成' });
    } catch (error) {
      updateNodeData(node.id, {
        status: 'failed',
        errorMessage: formatGenerationError(error instanceof Error ? error : '聊天失败', 'chat'),
      });
    }
  };

  // Handle storyboard split confirmation
  const handleSplitConfirm = useCallback(async (slices: SliceData[]) => {
    if (!splitterSourceNode) return;

    try {
      // Stage 1: Upload slices
      setSplitterProgress({ stage: '上传切片', percent: 0 });
      const uploadResults = await uploadSlicesWithProgress(
        slices.map(s => ({ blob: s.blob, index: s.index })),
        (percent) => setSplitterProgress({ stage: '上传切片', percent })
      );

      // Stage 2: Upscale images (skip for now if API not configured)
      setSplitterProgress({ stage: '放大图片', percent: 0 });
      const upscaleResults = await batchUpscaleWithFallback(
        uploadResults.map(r => ({ url: r.url, index: r.index })),
        {
          quality: '1080p',
          onProgress: (percent) => setSplitterProgress({ stage: '放大图片', percent }),
          skipUpscale: uploadResults.some(r => r.isBase64), // Skip upscale if using base64
        }
      );

      // Stage 3: Get story context from connected chat node
      let storyContext = '';
      const connectedEdge = edges.find(e => e.to === splitterSourceNode.id);
      if (connectedEdge) {
        const chatNode = nodes.find(n => n.id === connectedEdge.from && n.type === 'chat');
        if (chatNode?.data.chatOutput) {
          storyContext = chatNode.data.chatOutput;
        }
      }

      // Stage 4: Create node groups
      setSplitterProgress({ stage: '创建节点', percent: 50 });
      const { chatNodeIds } = createStoryboardSliceGroups({
        slices: upscaleResults.map(r => ({ imageUrl: r.url, index: r.index })),
        storyContext: storyContext || '(无故事上下文)',
        sourceNodeId: splitterSourceNode.id,
        sourcePosition: splitterSourceNode.position,
      });

      // Stage 5: Auto-execute chat nodes
      setSplitterProgress({ stage: '生成提示词', percent: 0 });

      // Execute chat nodes one by one
      for (let i = 0; i < chatNodeIds.length; i++) {
        const nodeId = chatNodeIds[i];
        const node = nodesRef.current.find(n => n.id === nodeId);
        if (node) {
          await handleChatGenerate(node);
        }
        setSplitterProgress({
          stage: '生成提示词',
          percent: Math.round(((i + 1) / chatNodeIds.length) * 100)
        });
      }

      // Done
      setSplitterProgress(null);
      setSplitterOpen(false);
      setSplitterImageUrl(null);
      setSplitterSourceNode(null);

      toast({
        title: '分镜拆分完成',
        description: `已创建 ${slices.length} 组节点，提示词已自动生成`,
      });
    } catch (error) {
      console.error('[handleSplitConfirm] Error:', error);
      setSplitterProgress(null);
      toast({
        title: '拆分失败',
        description: error instanceof Error ? error.message : '未知错误',
      });
    }
  }, [splitterSourceNode, edges, nodes, createStoryboardSliceGroups, handleChatGenerate]);

  // Handle perspective explosion - generate 9 multi-angle shots from a single image
  const handlePerspectiveExplosion = useCallback(async (sourceNode: WorkspaceNode) => {
    if (!sourceNode.data.outputUrl) {
      toast({ title: '请先生成图片', description: '需要已完成的图片才能进行视角裂变' });
      return;
    }

    // Find the first available chat model that supports vision
    const visionChatModel = chatModels.find(m => m.supportsVision);
    if (!visionChatModel) {
      toast({ title: '无可用模型', description: '需要支持视觉的 Chat 模型来分析图片' });
      return;
    }

    // Find NanoBananaPro or first available image model
    const targetImageModel = imageModels.find(m =>
      m.id.toLowerCase().includes('nanobananapro') ||
      m.id.toLowerCase().includes('nano-banana')
    ) || imageModels[0];

    if (!targetImageModel) {
      toast({ title: '无可用模型', description: '需要图片生成模型' });
      return;
    }

    setPerspectiveSourceNode(sourceNode);
    setPerspectiveProgress({ stage: '分析图片', percent: 10 });

    try {
      // Step 1: Get prompt from source node or generate description
      let imageDescription = sourceNode.data.prompt || '';

      // If no prompt, ask Chat to describe the image
      if (!imageDescription) {
        setPerspectiveProgress({ stage: '识别图片内容', percent: 20 });

        const descResponse = await fetch('/api/chat/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: visionChatModel.id,
            prompt: '请用英文详细描述这张图片的内容，包括人物外观、衣着、表情、姿态、环境、光线等所有视觉细节。只输出描述，不要其他内容。',
            images: [sourceNode.data.outputUrl],
          }),
        });

        if (!descResponse.ok) {
          throw new Error('图片描述生成失败');
        }

        const descData = await descResponse.json();
        imageDescription = descData.data?.content || '';
      }

      if (!imageDescription) {
        throw new Error('无法获取图片描述');
      }

      // Step 2: Generate 9 perspective prompts using the template
      setPerspectiveProgress({ stage: '生成视角提示词', percent: 40 });

      const perspectiveTemplate = promptTemplates.find(t => t.id === 'perspective-explosion-3x3');
      const systemPrompt = perspectiveTemplate?.content || '';

      const perspectiveResponse = await fetch('/api/chat/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: visionChatModel.id,
          prompt: `${systemPrompt}\n\n用户参考图描述：\n${imageDescription}`,
          images: [sourceNode.data.outputUrl],
        }),
      });

      if (!perspectiveResponse.ok) {
        throw new Error('视角提示词生成失败');
      }

      const perspectiveData = await perspectiveResponse.json();
      const jsonContent = perspectiveData.data?.content || '';

      // Step 3: Parse JSON from response
      setPerspectiveProgress({ stage: '解析提示词', percent: 60 });

      // Extract JSON from markdown code block if present
      const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, jsonContent];
      const jsonStr = jsonMatch[1]?.trim() || jsonContent;

      let parsedData: { shots?: Array<{ shot_number: string; prompt_text: string }> };
      try {
        parsedData = JSON.parse(jsonStr);
      } catch {
        throw new Error('JSON 解析失败，请重试');
      }

      const shots = parsedData.shots;
      if (!shots || !Array.isArray(shots) || shots.length === 0) {
        throw new Error('未找到有效的分镜数据');
      }

      // Step 4: Create 9 Image nodes in 3x3 grid
      setPerspectiveProgress({ stage: '创建节点', percent: 70 });

      const baseX = sourceNode.position.x + 400;
      const baseY = sourceNode.position.y - 200;
      const nodeWidth = 320;
      const nodeHeight = 280;
      const gap = 20;

      const newImageNodes: WorkspaceNode[] = [];
      const newEdges: WorkspaceEdge[] = [];

      for (let i = 0; i < Math.min(shots.length, 9); i++) {
        const shot = shots[i];
        const row = Math.floor(i / 3);
        const col = i % 3;

        const nodeId = `perspective-${sourceNode.id}-${i}-${Date.now()}`;
        const newNode: WorkspaceNode = {
          id: nodeId,
          type: 'image',
          name: shot.shot_number || `视角 ${i + 1}`,
          position: {
            x: baseX + col * (nodeWidth + gap),
            y: baseY + row * (nodeHeight + gap),
          },
          data: {
            prompt: shot.prompt_text || '',
            modelId: targetImageModel.id,
            aspectRatio: '16:9',
            status: 'idle',
            // 传递源图片作为参考图，用于图生图模式
            uploadedImages: sourceNode.data.outputUrl ? [sourceNode.data.outputUrl] : [],
          },
        };

        newImageNodes.push(newNode);

        // Connect source node to each new node
        if (i === 0) {
          newEdges.push({
            id: `edge-${sourceNode.id}-${nodeId}`,
            from: sourceNode.id,
            to: nodeId,
          });
        }
      }

      // Add nodes and edges
      setNodesDirty(prev => [...prev, ...newImageNodes]);
      setEdgesDirty(prev => [...prev, ...newEdges]);

      // Step 5: Execute all image nodes
      setPerspectiveProgress({ stage: '生成图片', percent: 80 });

      // Wait for state to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Execute image generation for all nodes
      const nodeIds = newImageNodes.map(n => n.id);
      if (nodeIds.length > 0) {
        runBatchNodes(nodeIds, false); // No cascade since these are leaf nodes
      }

      setPerspectiveProgress(null);
      setPerspectiveSourceNode(null);

      toast({
        title: '视角裂变完成',
        description: `已创建 ${newImageNodes.length} 个视角分镜，正在生成图片...`,
      });

    } catch (error) {
      console.error('[handlePerspectiveExplosion] Error:', error);
      setPerspectiveProgress(null);
      setPerspectiveSourceNode(null);
      toast({
        title: '视角裂变失败',
        description: error instanceof Error ? error.message : '未知错误',
      });
    }
  }, [chatModels, imageModels, promptTemplates, setNodesDirty, setEdgesDirty, runBatchNodes]);

  const waitForNodeStatus = useCallback(
    (nodeId: string, timeoutMs = 8 * 60 * 1000) =>
      new Promise<WorkspaceNode>((resolve, reject) => {
        const startedAt = Date.now();

        const check = () => {
          const node = nodesRef.current.find((item) => item.id === nodeId);
          if (!node) {
            reject(new Error('节点不存在'));
            return;
          }
          if (node.data.status === 'completed' && node.data.outputUrl) {
            resolve(node);
            return;
          }
          if (node.data.status === 'failed') {
            reject(new Error(node.data.errorMessage || '生成失败'));
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error('任务超时'));
            return;
          }
          if (
            (node.data.status === 'pending' || node.data.status === 'processing') &&
            node.data.generationId
          ) {
            pollTaskStatus(nodeId, node.data.generationId);
          }
          setTimeout(check, 1000);
        };

        check();
      }),
    [pollTaskStatus]
  );

  const ensureNodeReady = useCallback(
    async (nodeId: string, visited = new Set<string>()): Promise<void> => {
      if (visited.has(nodeId)) {
        throw new Error('检测到循环依赖');
      }
      visited.add(nodeId);

      const node = nodesRef.current.find((item) => item.id === nodeId);
      if (!node) {
        throw new Error('节点不存在');
      }

      const incoming = edgesRef.current.find((edge) => edge.to === nodeId);
      if (incoming) {
        await ensureNodeReady(incoming.from, visited);
      }

      const latest = nodesRef.current.find((item) => item.id === nodeId);
      if (!latest) {
        throw new Error('节点不存在');
      }

      if (latest.data.status === 'completed' && latest.data.outputUrl) {
        return;
      }
      if (latest.data.status === 'pending' || latest.data.status === 'processing') {
        await waitForNodeStatus(nodeId);
        return;
      }
      if (latest.type === 'image') {
        await handleGenerateNode(latest);
        await waitForNodeStatus(nodeId);
      }
    },
    [handleGenerateNode, waitForNodeStatus]
  );

  const handleGenerateVideo = async (node: WorkspaceNode) => {
    const inputEdge = edgesRef.current.find((edge) => edge.to === node.id);
    if (inputEdge) {
      try {
        await ensureNodeReady(inputEdge.from, new Set([node.id]));
      } catch (error) {
        updateNodeData(node.id, {
          status: 'failed',
          errorMessage: formatGenerationError(error instanceof Error ? error : '上游节点生成失败'),
        });
        return;
      }
    }
    await handleGenerateNode(node);
  };

  const edgePaths = useMemo(() => {
    return edges
      .map((edge) => {
        const fromNode = nodes.find((node) => node.id === edge.from);
        const toNode = nodes.find((node) => node.id === edge.to);
        if (!fromNode || !toNode) return null;
        const x1 = fromNode.position.x + NODE_WIDTH;
        const y1 = fromNode.position.y + HANDLE_OFFSET_Y;
        const x2 = toNode.position.x;
        const y2 = toNode.position.y + HANDLE_OFFSET_Y;
        const dx = Math.max(80, Math.abs(x2 - x1) * 0.5);
        return {
          id: edge.id,
          d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        };
      })
      .filter(Boolean) as Array<{ id: string; d: string }>;
  }, [edges, nodes]);

  const previewPath = useMemo(() => {
    if (!connectingFrom || !cursorPos) return null;
    const fromNode = nodes.find((node) => node.id === connectingFrom);
    if (!fromNode) return null;
    const x1 = fromNode.position.x + NODE_WIDTH;
    const y1 = fromNode.position.y + HANDLE_OFFSET_Y;
    const x2 = cursorPos.x;
    const y2 = cursorPos.y;
    const dx = Math.max(80, Math.abs(x2 - x1) * 0.5);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }, [connectingFrom, cursorPos, nodes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-foreground/50">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  return (
    <div className="h-full w-full min-w-0 flex flex-col gap-4 p-4 pb-24 sm:p-6 sm:pb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between min-w-0">
        <div className="flex flex-col gap-2">
          <input
            value={workspaceName}
            onChange={(e) => {
              setWorkspaceName(e.target.value);
              setDirty(true);
            }}
            className="text-xl sm:text-2xl font-light text-foreground bg-transparent border border-border/70 rounded-lg px-3 py-2 w-full max-w-md focus:outline-none focus:border-border"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* 节点状态统计 */}
          {nodes.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-foreground/50 mr-2 border-r border-border/50 pr-3">
              {nodeStatusCounts.completed > 0 && (
                <span className="text-green-400">✓ {nodeStatusCounts.completed}</span>
              )}
              {nodeStatusCounts.running > 0 && (
                <span className="text-blue-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {nodeStatusCounts.running}
                </span>
              )}
              {nodeStatusCounts.pending > 0 && (
                <span className="text-foreground/40">待执行 {nodeStatusCounts.pending}</span>
              )}
              {nodeStatusCounts.failed > 0 && (
                <span className="text-red-400">✗ {nodeStatusCounts.failed}</span>
              )}
            </div>
          )}
          {/* 执行预估显示 */}
          {!estimateEmpty && !isExecuting && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-foreground/50 mr-2">
              <span>{timeDisplay}</span>
              <span className="text-foreground/30">·</span>
              <span>{costDisplay}</span>
            </div>
          )}
          {!isExecuting ? (
            <button
              onClick={runWorkflow}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-500 font-medium hover:bg-green-500/20 transition shrink-0"
            >
              <Play className="w-4 h-4" />
              运行工作流
            </button>
          ) : (
            <button
              onClick={stopWorkflow}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 font-medium hover:bg-red-500/20 transition shrink-0"
            >
              <Square className="w-4 h-4 fill-current" />
              停止
            </button>
          )}
          {/* Retry failed nodes button */}
          {hasFailedNodes && !isExecuting && (
            <button
              onClick={retryAllFailed}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-orange-500/10 text-orange-500 font-medium hover:bg-orange-500/20 transition shrink-0"
              title={`重试 ${failedNodeIds.length} 个失败节点`}
            >
              <RotateCcw className="w-4 h-4" />
              重试失败 ({failedNodeIds.length})
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition shrink-0',
              dirty
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'bg-card/70 text-foreground/40 cursor-not-allowed'
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            保存
          </button>

          <div className="flex items-center gap-1 border-l border-border/50 pl-3 ml-1">
            <button
              onClick={() => setTemplateModalOpen(true)}
              className="p-2 rounded-lg hover:bg-card/70 text-foreground/60 hover:text-foreground transition"
              title="模板库"
            >
              <LayoutTemplate className="w-4 h-4" />
            </button>
            <button
              onClick={handleExport}
              className="p-2 rounded-lg hover:bg-card/70 text-foreground/60 hover:text-foreground transition"
              title="导出工作流"
            >
              <Download className="w-4 h-4" />
            </button>
            <label className="p-2 rounded-lg hover:bg-card/70 text-foreground/60 hover:text-foreground transition cursor-pointer" title="导入工作流">
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              <Upload className="w-4 h-4" />
            </label>
            <button
              onClick={handleShare}
              className="p-2 rounded-lg hover:bg-card/70 text-foreground/60 hover:text-foreground transition"
              title="分享工作流"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card/60 border border-border/70 rounded-2xl overflow-hidden flex-1 min-h-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 px-4 py-3 border-b border-border/70 text-foreground/60 text-sm">
          <div className="hidden sm:flex items-center gap-3">
            <MousePointer2 className="w-4 h-4" />
            右键添加节点，拖拽布局，点击节点右侧圆点开始连线（Alt/Option + 滚轮缩放，双击删除连接线）
          </div>
          <div className="sm:hidden text-xs text-foreground/50">
            Tap + to add nodes. Drag to move. Use the bottom bar to zoom.
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <div className="w-14 text-center text-xs text-foreground/50">{Math.round(zoom * 100)}%</div>
            <button
              onClick={handleZoomIn}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomFit}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
              title="适配视图"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomReset}
              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
              title="还原缩放"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="relative h-full overflow-auto"
          onWheel={handleCanvasWheel}
          onContextMenu={handleCanvasContextMenu}
          onClick={(event) => {
            setContextMenu(null);
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-workspace-node]')) return;

            // Handle Quick Add if connecting
            if (connectingFrom) {
              const point = getCanvasPoint(event);
              setContextMenu({ x: point.x, y: point.y, sourceNodeId: connectingFrom });
              // Don't clear connectingFrom yet, let the menu handle it
              return;
            }

            setConnectingFrom(null);
            setCursorPos(null);
          }}
        >
          <div
            className="relative"
            style={{ width: canvasSize.width * zoom, height: canvasSize.height * zoom }}
          >
            <div
              className="absolute inset-0"
              style={{
                width: canvasSize.width,
                height: canvasSize.height,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
              }}
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {/* 渲染连接线 */}
                {edgePaths.map((edge) => (
                  <g key={edge.id} className="pointer-events-auto group cursor-pointer">
                    {/* 透明粗线：用于增加点击区域 */}
                    <path
                      d={edge.d}
                      stroke="transparent"
                      strokeWidth="20"
                      fill="none"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        removeEdge(edge.id);
                        toast({ title: '连接已断开' });
                      }}
                    />
                    {/* 可视细线：实际显示的线条 */}
                    <path
                      d={edge.d}
                      stroke="rgba(255,255,255,0.4)"
                      strokeWidth="2"
                      fill="none"
                      className="transition-colors duration-200 group-hover:stroke-red-500/80 group-hover:stroke-[3px]"
                    />
                  </g>
                ))}
                {previewPath && (
                  <path
                    d={previewPath}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="6 6"
                  />
                )}
              </svg>

              {nodes.map((node) => {
                // Determine model only for image/video nodes
                const model =
                  node.type === 'image'
                    ? imageModels.find(m => m.id === node.data.modelId) || imageModels[0]
                    : node.type === 'video'
                    ? videoModels.find(m => m.id === node.data.modelId) || videoModels[0]
                    : null;
              const incoming = incomingEdges.get(node.id) || [];
              
              // Determine input/output handles based on node type
              const supportsReferenceInput =
                node.type === 'image' &&
                model &&
                (model as SafeImageModel).features.imageToImage;
              const showInputHandle = 
                node.type === 'video' || 
                node.type === 'chat' || 
                supportsReferenceInput;
              const showOutputHandle = 
                node.type === 'image' || 
                node.type === 'chat' || 
                node.type === 'prompt-template';
              
              // Get node icon based on type
              const NodeIcon = node.type === 'chat' 
                ? MessageSquare 
                : node.type === 'prompt-template' 
                ? FileText 
                : null;
              
              return (
                  <div
                    key={node.id}
                    data-workspace-node
                    className="absolute w-64 sm:w-72 bg-background/70 border border-border/70 rounded-xl shadow-lg"
                    style={{ left: node.position.x, top: node.position.y }}
                  >
                  <div
                    onPointerDown={(event) => startDrag(event, node)}
                    className="flex items-center justify-between px-3 py-2 border-b border-border/70 bg-card/60 rounded-t-xl cursor-grab"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {NodeIcon && <NodeIcon className="w-4 h-4 text-foreground/50" />}
                      <input
                        value={node.name}
                        onChange={(e) => updateNode(node.id, { name: e.target.value })}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="text-sm text-foreground/90 bg-transparent focus:outline-none flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {node.type === 'chat' && (
                        <button
                          onClick={() => duplicateNode(node.id)}
                          onPointerDown={(event) => event.stopPropagation()}
                          className="text-foreground/40 hover:text-foreground transition"
                          title="克隆节点"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {(node.type === 'image' || node.type === 'video' || node.type === 'chat') && (
                        <button
                          onClick={() => {
                            if (node.type === 'video') handleGenerateVideo(node);
                            else if (node.type === 'chat') handleChatGenerate(node);
                            else handleGenerateNode(node);
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          disabled={node.data.status === 'pending' || node.data.status === 'processing'}
                          className={cn(
                            'text-foreground/40 hover:text-foreground transition',
                            (node.data.status === 'pending' || node.data.status === 'processing') &&
                              'opacity-40 cursor-not-allowed'
                          )}
                          title="重新生成"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => removeNode(node.id)}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="text-foreground/40 hover:text-red-400 transition"
                        title="删除节点"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {showInputHandle && (
                    <button
                      onClick={() => handleFinishConnect(node.id)}
                      className="absolute -left-2 top-[18px] w-4 h-4 rounded-full border border-border bg-card/80 hover:bg-card/70"
                      title="输入"
                    />
                  )}
                  {showOutputHandle && (
                    <button
                      onClick={() => handleStartConnect(node.id)}
                      className={cn(
                        'absolute -right-2 top-[18px] w-4 h-4 rounded-full border border-border',
                        connectingFrom === node.id ? 'bg-foreground' : 'bg-card/80 hover:bg-card/70'
                      )}
                      title="输出"
                    />
                  )}

                  <div className="p-3 space-y-3 text-xs text-foreground/70">
                    {/* Prompt Template Node */}
                    {node.type === 'prompt-template' && (() => {
                      const isCustomMode = node.data.templateId === '__custom__';
                      return (
                      <>
                        <div className="absolute top-2 right-12">
                          <button
                            onClick={() => duplicateNode(node.id)}
                            onPointerDown={(event) => event.stopPropagation()}
                            className="text-foreground/40 hover:text-foreground transition p-1"
                            title="克隆节点"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Mode Toggle */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => updateNodeData(node.id, {
                              templateId: '',
                              templateOutput: '',
                              status: 'idle',
                            })}
                            onPointerDown={(e) => e.stopPropagation()}
                            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] transition ${
                              !isCustomMode
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-card/40 text-foreground/50 border border-border/50 hover:text-foreground/70'
                            }`}
                          >
                            预设模板
                          </button>
                          <button
                            onClick={() => updateNodeData(node.id, {
                              templateId: '__custom__',
                              templateOutput: node.data.templateOutput || '',
                              status: node.data.templateOutput ? 'completed' : 'idle',
                            })}
                            onPointerDown={(e) => e.stopPropagation()}
                            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] transition ${
                              isCustomMode
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-card/40 text-foreground/50 border border-border/50 hover:text-foreground/70'
                            }`}
                          >
                            自定义
                          </button>
                        </div>

                        {/* Template Mode: Selector */}
                        {!isCustomMode && (
                          <>
                            <div className="space-y-1">
                              <label className="text-[10px] uppercase tracking-wider text-foreground/40">模板</label>
                              <div className="relative">
                                <select
                                  value={node.data.templateId || ''}
                                  onChange={(e) => {
                                    const template = promptTemplates.find((t) => t.id === e.target.value);
                                    updateNodeData(node.id, {
                                      templateId: e.target.value,
                                      templateOutput: template?.content || '',
                                      status: template ? 'completed' : 'idle',
                                    });
                                  }}
                                  className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                                >
                                  <option value="" className="bg-card/95">选择模板...</option>
                                  {promptTemplates.map((template) => (
                                    <option key={template.id} value={template.id} className="bg-card/95">
                                      {template.name}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                            </div>
                            {promptTemplates.length === 0 && (
                              <div className="text-[10px] text-foreground/40">
                                暂无模板，请在 data/prompts 目录添加 .txt 文件
                              </div>
                            )}
                            {node.data.templateOutput && (
                              <div className="space-y-1">
                                <label className="text-[10px] uppercase tracking-wider text-foreground/40">模板内容</label>
                                <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 max-h-32 overflow-auto whitespace-pre-wrap border border-border/50">
                                  {node.data.templateOutput.slice(0, 500)}
                                  {node.data.templateOutput.length > 500 && '...'}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Custom Mode: Editable Textarea */}
                        {isCustomMode && (
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-foreground/40">自定义提示词</label>
                            <textarea
                              value={node.data.templateOutput || ''}
                              onChange={(e) => updateNodeData(node.id, {
                                templateOutput: e.target.value,
                                status: e.target.value.trim() ? 'completed' : 'idle',
                              })}
                              placeholder="输入提示词，连接到视频/图片节点后自动使用..."
                              className="w-full h-28 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
                            />
                          </div>
                        )}

                        {/* Status Indicator */}
                        {node.data.templateOutput && node.data.status === 'completed' && (
                          <div className="flex items-center gap-1 text-[10px] text-green-400">
                            <Check className="w-3 h-3" />
                            {isCustomMode ? '提示词已就绪' : '模板已加载'}
                          </div>
                        )}
                      </>
                      );
                    })()}

                    {/* Chat Node */}
                    {node.type === 'chat' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-foreground/40">聊天模型</label>
                          <div className="relative">
                            <select
                              value={node.data.chatModelId || ''}
                              onChange={(e) => updateNodeData(node.id, { chatModelId: e.target.value })}
                              className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                            >
                              {chatModels.length === 0 ? (
                                <option value="" className="bg-card/95">无可用模型</option>
                              ) : (
                                chatModels.map((m) => (
                                  <option key={m.id} value={m.id} className="bg-card/95">
                                    {m.name} {m.supportsVision ? '(支持图片)' : ''}
                                  </option>
                                ))
                              )}
                            </select>
                            <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        {incoming.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-wider text-foreground/40">
                              <ImageIcon className="w-3 h-3 inline mr-1" />
                              输入图片 ({incoming.length})
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {incoming.map((edge) => {
                                const fromNode = nodes.find((n) => n.id === edge.from);
                                return (
                                  <span
                                    key={edge.id}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 text-foreground/60"
                                  >
                                    <Link2 className="w-3 h-3" />
                                    {fromNode?.name || '节点'}
                                    <button
                                      onClick={() => removeEdge(edge.id)}
                                      className="text-foreground/40 hover:text-foreground"
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] uppercase tracking-wider text-foreground/40">提示词</label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateNodeData(node.id, { storyboardMode: !node.data.storyboardMode, pureMode: false })}
                                className={cn(
                                  "flex items-center gap-1 text-[10px] transition-colors",
                                  node.data.storyboardMode ? "text-blue-400" : "text-foreground/30 hover:text-foreground/50"
                                )}
                                title="分镜模式：开启后使用分镜导演系统提示词，生成结构化分镜数据"
                              >
                                {node.data.storyboardMode ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                                <Film className="w-3 h-3" />
                                分镜
                              </button>
                              <button
                                onClick={() => updateNodeData(node.id, { pureMode: !node.data.pureMode, storyboardMode: false })}
                                className={cn(
                                  "flex items-center gap-1 text-[10px] transition-colors",
                                  node.data.pureMode ? "text-green-400" : "text-foreground/30 hover:text-foreground/50"
                                )}
                                title="纯净模式：开启后仅输出提示词内容，不包含对话废话"
                              >
                                {node.data.pureMode ? <ToggleRight className="w-3 h-3" /> : <ToggleLeft className="w-3 h-3" />}
                                纯净
                              </button>
                              <span className="text-[10px] text-foreground/30">{node.data.prompt.length}/{CHAT_MAX_LENGTH}</span>
                            </div>
                          </div>
                          <textarea
                            value={node.data.prompt}
                            onChange={(e) => {
                              if (e.target.value.length <= CHAT_MAX_LENGTH) {
                                updateNodeData(node.id, { prompt: e.target.value });
                              }
                            }}
                            maxLength={CHAT_MAX_LENGTH}
                            className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
                            placeholder="输入聊天内容..."
                          />
                        </div>

                        {node.data.errorMessage && (
                          <div className="text-red-400 text-xs">{node.data.errorMessage}</div>
                        )}

                        <button
                          onClick={() => handleChatGenerate(node)}
                          disabled={node.data.status === 'pending' || node.data.status === 'processing'}
                          className={cn(
                            'w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition',
                            node.data.status === 'pending' || node.data.status === 'processing'
                              ? 'bg-card/70 text-foreground/50 cursor-not-allowed'
                              : 'bg-foreground text-background hover:bg-foreground/90'
                          )}
                        >
                          {node.data.status === 'pending' || node.data.status === 'processing' ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              处理中...
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              发送
                            </>
                          )}
                        </button>

                        {node.data.chatOutput && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] uppercase tracking-wider text-foreground/40">输出</label>
                            </div>
                            {/* Storyboard Preview Mode */}
                            {(() => {
                              const storyboardData = node.data.storyboardData || tryParseStoryboard(node.data.chatOutput);
                              if (storyboardData && node.data.storyboardStep !== 'confirmed') {
                                return (
                                  <StoryboardPreview
                                    data={storyboardData}
                                    onUpdateData={(updatedData) => updateNodeData(node.id, {
                                      storyboardData: updatedData,
                                      storyboardStep: 'preview' as const
                                    })}
                                    onConfirm={(finalData) => {
                                      explodeStoryboard(node.id, finalData);
                                    }}
                                    onConfirmAndExecute={(finalData) => {
                                      const imageNodeIds = explodeStoryboard(node.id, finalData);
                                      if (imageNodeIds && imageNodeIds.length > 0) {
                                        // Schedule execution after state updates
                                        setTimeout(() => {
                                          runBatchNodes(imageNodeIds, true);
                                        }, 100);
                                      }
                                    }}
                                    onCancel={() => updateNodeData(node.id, {
                                      storyboardData: undefined,
                                      storyboardStep: undefined
                                    })}
                                  />
                                );
                              }
                              // Confirmed storyboard - show formatted summary with progress
                              if (node.data.storyboardStep === 'confirmed' && node.data.storyboardData) {
                                const sb = node.data.storyboardData;
                                const mapping = node.data.sceneNodeMapping || [];

                                // Calculate progress from generated nodes
                                const getNodeStatus = (nodeId?: string) => {
                                  if (!nodeId) return 'idle';
                                  const n = nodes.find(nd => nd.id === nodeId);
                                  return n?.data?.status || 'idle';
                                };

                                const progressItems = mapping.map(m => ({
                                  sceneId: m.sceneId,
                                  imageStatus: getNodeStatus(m.imageNodeId),
                                  videoStatus: getNodeStatus(m.videoNodeId),
                                }));

                                const completedCount = progressItems.filter(
                                  p => p.imageStatus === 'completed' && (p.videoStatus === 'completed' || p.videoStatus === 'idle')
                                ).length;
                                const failedCount = progressItems.filter(
                                  p => p.imageStatus === 'failed' || p.videoStatus === 'failed'
                                ).length;
                                const processingCount = progressItems.filter(
                                  p => p.imageStatus === 'pending' || p.imageStatus === 'processing' ||
                                       p.videoStatus === 'pending' || p.videoStatus === 'processing'
                                ).length;
                                const totalCount = progressItems.length;

                                return (
                                  <div className="space-y-2">
                                    {/* Summary header */}
                                    <div className="text-[10px] text-foreground/60 bg-green-500/10 border border-green-500/30 rounded-lg px-2 py-1.5">
                                      <div className="font-medium text-green-400">✅ 分镜已生成</div>
                                      <div className="text-foreground/50">
                                        🎬 {sb.title || '未命名故事'} • 📊 {sb.scenes?.length || 0} 个分镜
                                      </div>
                                    </div>

                                    {/* Progress panel */}
                                    {mapping.length > 0 && (
                                      <div className="border border-cyan-500/30 rounded-lg p-2 bg-cyan-500/5 space-y-2">
                                        <div className="flex items-center justify-between text-[10px]">
                                          <span className="text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                                            <Film className="w-3 h-3" />
                                            生成进度
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-green-400">{completedCount}/{totalCount}</span>
                                            {failedCount > 0 && <span className="text-red-400">{failedCount} 失败</span>}
                                            {processingCount > 0 && (
                                              <span className="text-cyan-400 flex items-center gap-1">
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="h-1.5 bg-card/60 rounded-full overflow-hidden flex">
                                          <div className="bg-green-500 transition-all" style={{ width: `${(completedCount / totalCount) * 100}%` }} />
                                          <div className="bg-cyan-500 animate-pulse transition-all" style={{ width: `${(processingCount / totalCount) * 100}%` }} />
                                          <div className="bg-red-500 transition-all" style={{ width: `${(failedCount / totalCount) * 100}%` }} />
                                        </div>

                                        {/* Per-scene mini status */}
                                        <div className="flex flex-wrap gap-1">
                                          {progressItems.map((p) => {
                                            const hasFail = p.imageStatus === 'failed' || p.videoStatus === 'failed';
                                            const isComplete = p.imageStatus === 'completed' && (p.videoStatus === 'completed' || p.videoStatus === 'idle');
                                            const isProcessing = p.imageStatus === 'processing' || p.videoStatus === 'processing';
                                            return (
                                              <div
                                                key={p.sceneId}
                                                className={cn(
                                                  'px-1.5 py-0.5 rounded text-[8px] flex items-center gap-0.5',
                                                  hasFail ? 'bg-red-500/20 text-red-400' :
                                                  isComplete ? 'bg-green-500/20 text-green-400' :
                                                  isProcessing ? 'bg-cyan-500/20 text-cyan-400' :
                                                  'bg-card/60 text-foreground/40'
                                                )}
                                                title={`分镜 ${p.sceneId}: 图像=${p.imageStatus}, 视频=${p.videoStatus}`}
                                              >
                                                #{p.sceneId}
                                                {hasFail && <XCircle className="w-2.5 h-2.5" />}
                                                {isComplete && <CheckCircle2 className="w-2.5 h-2.5" />}
                                                {isProcessing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                              </div>
                                            );
                                          })}
                                        </div>

                                        {/* Retry all failed button */}
                                        {failedCount > 0 && (
                                          <button
                                            onClick={() => {
                                              const failedNodeIds = mapping
                                                .filter(m => {
                                                  const imgStatus = getNodeStatus(m.imageNodeId);
                                                  const vidStatus = getNodeStatus(m.videoNodeId);
                                                  return imgStatus === 'failed' || vidStatus === 'failed';
                                                })
                                                .flatMap(m => [m.imageNodeId, m.videoNodeId].filter(Boolean) as string[]);
                                              if (failedNodeIds.length > 0) {
                                                runBatchNodes(failedNodeIds, true);
                                              }
                                            }}
                                            className="w-full py-1 text-[9px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 flex items-center justify-center gap-1"
                                          >
                                            <RefreshCw className="w-3 h-3" />
                                            重试失败项
                                          </button>
                                        )}

                                        {/* Completion message */}
                                        {processingCount === 0 && completedCount === totalCount && (
                                          <div className="text-[9px] text-center py-1 bg-green-500/20 text-green-400 rounded flex items-center justify-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" />
                                            所有分镜生成完成！
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              // Regular output view
                              return (
                                <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 max-h-40 overflow-auto whitespace-pre-wrap">
                                  {node.data.chatOutput}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}

                    {/* Image/Video Node - Model Selection */}
                    {(node.type === 'image' || node.type === 'video') && model && (
                    <>
                    <div className="absolute top-2 right-12 flex gap-1">
                      <button
                        onClick={() => duplicateNode(node.id)}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="text-foreground/40 hover:text-foreground transition p-1"
                        title="克隆节点"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-foreground/40">模型</label>
                      <div className="relative">
                        <select
                          value={node.data.modelId}
                          onChange={(e) => {
                            const nextId = e.target.value;
                            if (node.type === 'image') {
                              const nextModel = imageModels.find(m => m.id === nextId) || imageModels[0];
                              // 智能选择默认分辨率：优先用默认值，否则用列表第一个，最后兜底 '1K'
                              const defaultSize = nextModel?.defaultImageSize || (nextModel?.imageSizes && nextModel.imageSizes.length > 0 ? nextModel.imageSizes[0] : '1K');

                              updateNodeData(node.id, {
                                modelId: nextId,
                                aspectRatio: nextModel?.defaultAspectRatio || '1:1',
                                imageSize: defaultSize,
                              });
                              if (nextModel && !nextModel.features.imageToImage) {
                                const hasIncoming = edges.some((edge) => edge.to === node.id);
                                if (hasIncoming) {
                                  setEdgesDirty((prev) => prev.filter((edge) => edge.to !== node.id));
                                  toast({ title: '该模型不支持参考图，已移除引用' });
                                }
                              }
                            } else {
                              const nextModel = videoModels.find(m => m.id === nextId) || videoModels[0];
                              updateNodeData(node.id, {
                                modelId: nextId,
                                aspectRatio: nextModel?.defaultAspectRatio || 'landscape',
                                duration: nextModel?.defaultDuration || '10s',
                              });
                            }
                          }}
                          className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                        >
                          {(node.type === 'image' ? imageModels : videoModels).map((item) => (
                            <option key={item.id} value={item.id} className="bg-card/95">
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 text-foreground/30 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-foreground/40">比例</label>
                        <select
                          value={node.data.aspectRatio || '1:1'}
                          onChange={(e) => updateNodeData(node.id, { aspectRatio: e.target.value })}
                          className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                        >
                          {node.type === 'image'
                            ? (model as SafeImageModel)?.aspectRatios?.map((ratio: string) => (
                                <option key={ratio} value={ratio} className="bg-card/95">
                                  {ratio}
                                </option>
                              ))
                            : (model as SafeVideoModel)?.aspectRatios?.map((ratio: { value: string; label: string }) => (
                                <option key={ratio.value} value={ratio.value} className="bg-card/95">
                                  {ratio.label}
                                </option>
                              ))}
                        </select>
                      </div>

                      {node.type === 'image' ? (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-foreground/40">分辨率</label>
                          <select
                            value={node.data.imageSize || '1K'}
                            onChange={(e) => updateNodeData(node.id, { imageSize: e.target.value })}
                            disabled={!(model as SafeImageModel)?.features?.imageSize}
                            className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border disabled:opacity-40"
                          >
                            {(model as SafeImageModel)?.imageSizes?.map((size: string) => (
                              <option key={size} value={size} className="bg-card/95">
                                {size}
                              </option>
                            )) || (
                              <option value="1K" className="bg-card/95">
                                1K
                              </option>
                            )}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-wider text-foreground/40">时长</label>
                          <select
                            value={node.data.duration || (model as SafeVideoModel)?.defaultDuration || '10s'}
                            onChange={(e) => updateNodeData(node.id, { duration: e.target.value })}
                            className="w-full px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground focus:outline-none focus:border-border"
                          >
                            {(model as SafeVideoModel)?.durations?.map((duration: { value: string; label: string }) => (
                              <option key={duration.value} value={duration.value} className="bg-card/95">
                                {duration.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {node.type === 'video' && (
                      <div className="space-y-2">
                        {/* 自动检测模式显示 */}
                        <div className="flex items-center gap-2 text-[10px] bg-card/40 px-2 py-1.5 rounded-lg border border-border/50">
                           {incoming.some(e => nodes.find(n => n.id === e.from)?.type === 'image') || (node.data.uploadedImages && node.data.uploadedImages.length > 0) ? (
                             <span className="text-blue-400 flex items-center gap-1">
                               <ImageIcon className="w-3 h-3" /> 图生视频模式 (Image-to-Video)
                             </span>
                           ) : (
                             <span className="text-foreground/60 flex items-center gap-1">
                               <FileText className="w-3 h-3" /> 文生视频模式 (Text-to-Video)
                             </span>
                           )}
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-wider text-foreground/40">角色卡</label>
                          <span className="text-[10px] text-foreground/30">
                            {characterCards.length} 个
                          </span>
                        </div>
                        {characterCards.length === 0 ? (
                          <div className="text-[10px] text-foreground/30">暂无角色卡</div>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-auto pr-1">
                              {characterCards.map((card) => {
                                const mention = `@${card.characterName}`;
                                return (
                                  <button
                                    key={card.id}
                                    type="button"
                                    onClick={() => insertCharacterMention(node.id, mention)}
                                    onMouseEnter={(event) => {
                                      const target = event.currentTarget as HTMLElement;
                                      const nodeEl = target.closest('[data-workspace-node]') as HTMLElement | null;
                                      if (!nodeEl) return;
                                      const nodeRect = nodeEl.getBoundingClientRect();
                                      const targetRect = target.getBoundingClientRect();
                                      setHoveredCard({
                                        nodeId: node.id,
                                        card,
                                        x: targetRect.left - nodeRect.left,
                                        y: targetRect.top - nodeRect.top,
                                      });
                                    }}
                                    onMouseLeave={() => {
                                      setHoveredCard((prev) =>
                                        prev?.card.id === card.id ? null : prev
                                      );
                                    }}
                                    className="px-2 py-1 rounded-full border border-border/70 text-[10px] text-foreground/70 hover:text-foreground hover:border-border transition"
                                    title="点击插入到提示词"
                                  >
                                    {mention}
                                  </button>
                                );
                              })}
                            </div>
                            {hoveredCard && hoveredCard.nodeId === node.id && (
                              <div
                                className="pointer-events-none absolute z-30 rounded-lg border border-border/70 bg-background/80 p-1 shadow-xl"
                                style={{
                                  left: hoveredCard.x,
                                  top: hoveredCard.y,
                                  transform: 'translate(-8px, calc(-100% - 8px))',
                                }}
                              >
                                {hoveredCard.card.avatarUrl ? (
                                  <img
                                    src={hoveredCard.card.avatarUrl}
                                    alt={hoveredCard.card.characterName}
                                    className="h-20 w-20 rounded-md object-cover"
                                  />
                                ) : (
                                  <div className="h-20 w-20 rounded-md bg-card/70" />
                                )}
                                <div className="mt-1 text-[10px] text-foreground/50 truncate w-20">
                                  @{hoveredCard.card.characterName}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                        <div className="text-[10px] text-foreground/30">点击名称插入到提示词</div>
                      </div>
                    )}

                    {/* Upload reference image for video - only when no connected image node */}
                    {node.type === 'video' && !incoming.some(e => nodes.find(n => n.id === e.from)?.type === 'image') && (() => {
                      const videoModel = model as SafeVideoModel;
                      // Veo 模型: i2v=2张, r2v/多图=3张; Sora 模型: 1张
                      // 通过模型名称识别: "多图" 或 "融合" 关键词表示 r2v 模式
                      const modelName = videoModel?.name?.toLowerCase() || '';
                      const isVeoModel = videoModel?.channelType === 'gemini' || modelName.includes('veo');
                      const isMultiImageMode = modelName.includes('多图') || modelName.includes('融合');
                      const maxImages = videoModel?.features?.maxReferenceImages ??
                        (isVeoModel ? (isMultiImageMode ? 3 : 2) : 1);
                      const currentImages = node.data.uploadedImages || [];
                      return (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-foreground/40">
                          参考图 ({maxImages === 1 ? '1张' : `最多${maxImages}张`})
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {currentImages.slice(0, maxImages).map((img, idx) => (
                            <div key={idx} className="relative group">
                              <img src={img} alt="" className="w-12 h-12 rounded object-cover border border-border/70" />
                              <button
                                onClick={() => updateNodeData(node.id, {
                                  uploadedImages: currentImages.filter((_, i) => i !== idx)
                                })}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {currentImages.length < maxImages && (
                            <label className="w-12 h-12 rounded border border-dashed border-border/70 flex items-center justify-center cursor-pointer hover:border-border transition">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const base64 = await new Promise<string>((resolve) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(reader.result as string);
                                    reader.readAsDataURL(file);
                                  });
                                  updateNodeData(node.id, {
                                    uploadedImages: [...currentImages, base64].slice(0, maxImages)
                                  });
                                  e.target.value = '';
                                }}
                              />
                              <ImageIcon className="w-4 h-4 text-foreground/30" />
                            </label>
                          )}
                        </div>
                      </div>
                      );
                    })()}

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-foreground/40">提示词</label>
                      <textarea
                        value={node.data.prompt}
                        onChange={(e) => updateNodeData(node.id, { prompt: e.target.value })}
                        className="w-full h-20 px-2 py-2 bg-card/60 border border-border/70 rounded-lg text-foreground text-xs resize-none focus:outline-none focus:border-border"
                        placeholder="描述生成内容"
                      />
                    </div>

                    {incoming.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-foreground/40">输入</label>
                        <div className="flex flex-wrap gap-1">
                          {incoming.map((edge) => {
                            const fromNode = nodes.find((n) => n.id === edge.from);
                            return (
                              <span
                                key={edge.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-card/70 text-foreground/60"
                              >
                                <Link2 className="w-3 h-3" />
                                {fromNode?.name || '图片节点'}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeEdge(edge.id);
                                  }}
                                  className="text-foreground/40 hover:text-foreground"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Upload reference images - only for image nodes without connected image node */}
                    {node.type === 'image' && model && (model as SafeImageModel).features.imageToImage && !incoming.some(e => nodes.find(n => n.id === e.from)?.type === 'image') && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-foreground/40">
                          参考图 {(model as SafeImageModel).features.multipleImages ? '(可多张)' : '(1张)'}
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {(node.data.uploadedImages || []).map((img, idx) => (
                            <div key={idx} className="relative group">
                              <img src={img} alt="" className="w-12 h-12 rounded object-cover border border-border/70" />
                              <button
                                onClick={() => {
                                  const newImages = [...(node.data.uploadedImages || [])];
                                  newImages.splice(idx, 1);
                                  updateNodeData(node.id, { uploadedImages: newImages });
                                }}
                                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-foreground text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <label className="w-12 h-12 rounded border border-dashed border-border/70 flex items-center justify-center cursor-pointer hover:border-border transition">
                            <input
                              type="file"
                              accept="image/*"
                              multiple={!!(model.features as { supportMultipleImages?: boolean }).supportMultipleImages}
                              className="hidden"
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length === 0) return;
                                const supportsMultiple = !!(model.features as { supportMultipleImages?: boolean }).supportMultipleImages;
                                const maxImages = supportsMultiple ? 10 : 1;
                                const currentImages = node.data.uploadedImages || [];
                                const newImages: string[] = [];
                                for (const file of files.slice(0, maxImages - currentImages.length)) {
                                  const base64 = await new Promise<string>((resolve) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(reader.result as string);
                                    reader.readAsDataURL(file);
                                  });
                                  newImages.push(base64);
                                }
                                updateNodeData(node.id, { uploadedImages: [...currentImages, ...newImages].slice(0, maxImages) });
                                e.target.value = '';
                              }}
                            />
                            <ImageIcon className="w-4 h-4 text-foreground/30" />
                          </label>
                        </div>
                      </div>
                    )}

                    {node.data.errorMessage && (
                      <div className="text-red-400 text-xs">{node.data.errorMessage}</div>
                    )}

                    <button
                      onClick={() => (node.type === 'video' ? handleGenerateVideo(node) : handleGenerateNode(node))}
                      disabled={node.data.status === 'pending' || node.data.status === 'processing'}
                      className={cn(
                        'w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium transition',
                        node.data.status === 'pending' || node.data.status === 'processing'
                          ? 'bg-card/70 text-foreground/50 cursor-not-allowed'
                          : 'bg-foreground text-background hover:bg-foreground/90'
                      )}
                    >
                      {node.data.status === 'pending' || node.data.status === 'processing' ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3 h-3" />
                          生成
                        </>
                      )}
                    </button>

                    {node.data.outputUrl && (
                      <div className="mt-2 space-y-2">
                        {node.data.outputType === 'video' ? (
                          <video
                            key={`${node.data.generationId}-${node.data.outputUrl}`}
                            src={node.data.outputUrl}
                            controls
                            className="w-full rounded-lg border border-border/70"
                          />
                        ) : (
                          <img
                            key={`${node.data.generationId}-${node.data.outputUrl}`}
                            src={`${node.data.outputUrl}${node.data.outputUrl.includes('?') ? '&' : '?'}_t=${node.data.generationId || Date.now()}`}
                            alt=""
                            className="w-full rounded-lg border border-border/70"
                          />
                        )}
                        <a
                          href={node.data.outputUrl}
                          download={`${node.name || 'output'}-${node.data.generationId || Date.now()}.${node.data.outputType === 'video' ? 'mp4' : 'png'}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] text-foreground/60 hover:text-foreground bg-card/60 hover:bg-card/70 rounded-lg transition"
                        >
                          <Download className="w-3 h-3" />
                          下载
                        </a>
                        {/* Split storyboard button - only for image nodes */}
                        {node.type === 'image' && node.data.outputUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openSplitter(node);
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-lg transition"
                            title="拆分分镜"
                          >
                            <Scissors className="w-3 h-3" />
                            拆分
                          </button>
                        )}
                        {/* Perspective explosion button - only for completed image nodes */}
                        {node.type === 'image' && node.data.outputUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePerspectiveExplosion(node);
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg transition"
                            title="视角裂变 - 生成9个多视角分镜"
                          >
                            <Sparkles className="w-3 h-3" />
                            裂变
                          </button>
                        )}
                      </div>
                    )}

                    {node.data.revisedPrompt && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-foreground/40">改写提示词</label>
                        <div className="text-[10px] text-foreground/60 bg-card/60 rounded-lg px-2 py-1.5 break-words max-h-24 overflow-auto">
                          {node.data.revisedPrompt}
                        </div>
                      </div>
                    )}
                    </>
                    )}
                  </div>
                  </div>
                );
              })}

              {contextMenu && (
                <div
                  className="absolute z-50 bg-card/95 border border-border/70 rounded-lg shadow-xl p-2 text-sm text-foreground/80 min-w-[160px]"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  {contextMenu.sourceNodeId && (
                    <div className="px-3 py-1.5 text-xs text-foreground/40 border-b border-border/50 mb-1">
                      连接到新节点...
                    </div>
                  )}
                  <button
                    onClick={() => {
                      const newNode = createNode('image', { x: contextMenu.x, y: contextMenu.y });
                      setNodesDirty((prev) => [...prev, newNode]);
                      if (contextMenu.sourceNodeId) {
                        setConnectingFrom(contextMenu.sourceNodeId);
                        // Use setTimeout to allow state to update before calling handleFinishConnect
                        setTimeout(() => {
                          handleFinishConnect(newNode.id);
                        }, 0);
                      }
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    <ImageIcon className="w-4 h-4" />
                    添加图片节点
                  </button>
                  <button
                    onClick={() => {
                      const newNode = createNode('video', { x: contextMenu.x, y: contextMenu.y });
                      setNodesDirty((prev) => [...prev, newNode]);
                      if (contextMenu.sourceNodeId) {
                        setConnectingFrom(contextMenu.sourceNodeId);
                        setTimeout(() => {
                          handleFinishConnect(newNode.id);
                        }, 0);
                      }
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    <Video className="w-4 h-4" />
                    添加视频节点
                  </button>
                  <button
                    onClick={() => {
                      const newNode = createNode('chat', { x: contextMenu.x, y: contextMenu.y });
                      setNodesDirty((prev) => [...prev, newNode]);
                      if (contextMenu.sourceNodeId) {
                        setConnectingFrom(contextMenu.sourceNodeId);
                        setTimeout(() => {
                          handleFinishConnect(newNode.id);
                        }, 0);
                      }
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    <MessageSquare className="w-4 h-4" />
                    添加聊天节点
                  </button>
                  <button
                    onClick={() => {
                      const newNode = createNode('prompt-template', { x: contextMenu.x, y: contextMenu.y });
                      setNodesDirty((prev) => [...prev, newNode]);
                      if (contextMenu.sourceNodeId) {
                        setConnectingFrom(contextMenu.sourceNodeId);
                        setTimeout(() => {
                          handleFinishConnect(newNode.id);
                        }, 0);
                      }
                      setContextMenu(null);
                    }}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded hover:bg-card/70"
                  >
                    <FileText className="w-4 h-4" />
                    添加提示词模板
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 p-3 safe-bottom">
        <div className="flex items-center justify-between gap-2 bg-card/80 border border-border/70 rounded-2xl px-3 py-2 backdrop-blur">
          <button
            onClick={handleZoomOut}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomIn}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomFit}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border/70 text-foreground/60 hover:text-foreground hover:border-border transition"
            title="Fit"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileAddOpen(true)}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-foreground text-background hover:opacity-90 transition"
            title="Add node"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className={cn(
              'h-9 w-9 inline-flex items-center justify-center rounded-lg border transition',
              dirty
                ? 'border-border/70 text-foreground/70 hover:text-foreground hover:border-border'
                : 'border-border/40 text-foreground/30 cursor-not-allowed'
            )}
            title="Save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {mobileAddOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileAddOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 p-4 safe-bottom">
            <div className="bg-card/95 border border-border/70 rounded-2xl p-4 space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-foreground/40">Add node</div>
              <div className="grid grid-cols-2 gap-2">
                {MOBILE_NODE_OPTIONS.map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => handleAddNodeAtCenter(type)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/70 border border-border/70 text-foreground/70 hover:text-foreground hover:border-border transition"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {templateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl bg-card border border-border/70 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border/70">
              <div>
                <h2 className="text-xl font-medium text-foreground">工作流模板库</h2>
                <p className="text-sm text-foreground/50 mt-1">选择一个预设模板快速开始，或使用 AI 辅助生成</p>
              </div>
              <button
                onClick={() => setTemplateModalOpen(false)}
                className="p-2 rounded-lg hover:bg-muted text-foreground/60 hover:text-foreground transition"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {WORKFLOW_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyTemplate(preset.template)}
                    className="flex flex-col items-start text-left p-4 rounded-xl border border-border/70 bg-card/40 hover:bg-card/80 hover:border-foreground/20 transition group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center mb-3 group-hover:bg-foreground/10 transition">
                      <LayoutTemplate className="w-5 h-5 text-foreground/70" />
                    </div>
                    <h3 className="font-medium text-foreground">{preset.name}</h3>
                    <p className="text-xs text-foreground/50 mt-1 line-clamp-2">{preset.description}</p>
                    <div className="mt-4 flex items-center gap-2 text-[10px] text-foreground/40">
                      <span className="bg-foreground/5 px-2 py-0.5 rounded-full">{preset.template.metadata.nodeCount} 节点</span>
                      <span className="bg-foreground/5 px-2 py-0.5 rounded-full">{preset.template.metadata.edgeCount} 连线</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {connectingFrom && (
        <div className="text-xs text-foreground/40 flex items-center gap-2">
          <Check className="w-3 h-3" />
          点击目标节点左侧圆点完成连线
        </div>
      )}

      {/* Storyboard Splitter Modal */}
      {splitterOpen && splitterImageUrl && (
        <StoryboardSplitter
          imageUrl={splitterImageUrl}
          onConfirm={handleSplitConfirm}
          onCancel={() => {
            setSplitterOpen(false);
            setSplitterImageUrl(null);
            setSplitterSourceNode(null);
          }}
        />
      )}

      {/* Splitter Progress Overlay */}
      {splitterProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-zinc-900 rounded-xl p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-400" />
            <div className="text-white font-medium">{splitterProgress.stage}</div>
            <div className="text-zinc-400 text-sm mt-1">{splitterProgress.percent}%</div>
          </div>
        </div>
      )}

      {/* Perspective Explosion Progress Overlay */}
      {perspectiveProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-zinc-900 rounded-xl p-6 text-center">
            <Sparkles className="w-8 h-8 animate-pulse mx-auto mb-4 text-amber-400" />
            <div className="text-white font-medium">{perspectiveProgress.stage}</div>
            <div className="text-zinc-400 text-sm mt-1">{perspectiveProgress.percent}%</div>
            <div className="text-zinc-500 text-xs mt-2">视角裂变中...</div>
          </div>
        </div>
      )}
    </div>
  );
}
