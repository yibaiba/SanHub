import { useCallback } from 'react';
import { toast } from '@/components/ui/toaster';
import { IMAGE_MODELS, VIDEO_MODELS, getImageModelById } from '@/lib/model-config';
import type { WorkspaceNode, WorkspaceEdge, WorkspaceNodeType, ChatModel, StoryboardData, StoryboardScene } from '@/types';

interface UseNodeOperationsOptions {
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  chatModels: ChatModel[];
  setNodesDirty: (updater: (prev: WorkspaceNode[]) => WorkspaceNode[]) => void;
  setEdgesDirty: (updater: (prev: WorkspaceEdge[]) => WorkspaceEdge[]) => void;
}

interface UseNodeOperationsReturn {
  createNode: (type: WorkspaceNodeType, position: { x: number; y: number }) => WorkspaceNode;
  addNodeAt: (type: WorkspaceNodeType, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, partial: Partial<WorkspaceNode['data']>) => void;
  updateNode: (id: string, partial: Partial<WorkspaceNode>) => void;
  removeNode: (id: string) => void;
  removeEdge: (edgeId: string) => void;
  insertCharacterMention: (nodeId: string, mention: string) => void;
  handleStartConnect: (nodeId: string, connectingFrom: string | null, setConnectingFrom: (id: string | null) => void, setCursorPos: (pos: null) => void) => void;
  handleFinishConnect: (nodeId: string, connectingFrom: string | null, setConnectingFrom: (id: string | null) => void) => void;
  duplicateNode: (nodeId: string) => void;
  explodeStoryboard: (chatNodeId: string, storyboardData: StoryboardData) => string[] | undefined;
}

export function useNodeOperations({
  nodes,
  edges,
  chatModels,
  setNodesDirty,
  setEdgesDirty,
}: UseNodeOperationsOptions): UseNodeOperationsReturn {

  const createNode = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }): WorkspaceNode => {
      const id = crypto.randomUUID();
      
      if (type === 'image') {
        const model = IMAGE_MODELS[0];
        return {
          id,
          type,
          name: '图片生成',
          position,
          data: {
            modelId: model.id,
            aspectRatio: model.defaultAspectRatio,
            imageSize: model.defaultImageSize,
            prompt: '',
            status: 'idle',
          },
        };
      }
      
      if (type === 'video') {
        const model = VIDEO_MODELS[0];
        return {
          id,
          type,
          name: '视频生成',
          position,
          data: {
            modelId: model.id,
            aspectRatio: model.defaultAspectRatio,
            duration: model.defaultDuration,
            prompt: '',
            status: 'idle',
          },
        };
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
        };
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
      };
    },
    [chatModels]
  );

  const addNodeAt = useCallback(
    (type: WorkspaceNodeType, position: { x: number; y: number }) => {
      setNodesDirty((prev) => [...prev, createNode(type, position)]);
    },
    [createNode, setNodesDirty]
  );

  const updateNodeData = useCallback(
    (id: string, partial: Partial<WorkspaceNode['data']>) => {
      setNodesDirty((prev) =>
        prev.map((node) =>
          node.id === id
            ? { ...node, data: { ...node.data, ...partial } }
            : node
        )
      );
    },
    [setNodesDirty]
  );

  const updateNode = useCallback(
    (id: string, partial: Partial<WorkspaceNode>) => {
      setNodesDirty((prev) =>
        prev.map((node) => (node.id === id ? { ...node, ...partial } : node))
      );
    },
    [setNodesDirty]
  );

  const removeNode = useCallback(
    (id: string) => {
      setNodesDirty((prev) => prev.filter((node) => node.id !== id));
      setEdgesDirty((prev) => prev.filter((edge) => edge.from !== id && edge.to !== id));
    },
    [setNodesDirty, setEdgesDirty]
  );

  const removeEdge = useCallback(
    (edgeId: string) => {
      setEdgesDirty((prev) => prev.filter((edge) => edge.id !== edgeId));
    },
    [setEdgesDirty]
  );

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
            data: { ...node.data, prompt: nextPrompt },
          };
        })
      );
    },
    [setNodesDirty]
  );

  const handleStartConnect = useCallback(
    (
      nodeId: string,
      connectingFrom: string | null,
      setConnectingFrom: (id: string | null) => void,
      setCursorPos: (pos: null) => void
    ) => {
      if (connectingFrom === nodeId) {
        setConnectingFrom(null);
        setCursorPos(null);
        return;
      }
      setConnectingFrom(nodeId);
      setCursorPos(null);
    },
    []
  );

  const handleFinishConnect = useCallback(
    (
      nodeId: string,
      connectingFrom: string | null,
      setConnectingFrom: (id: string | null) => void
    ) => {
      if (!connectingFrom || connectingFrom === nodeId) return;
      
      const fromNode = nodes.find((node) => node.id === connectingFrom);
      const toNode = nodes.find((node) => node.id === nodeId);
      if (!fromNode || !toNode) return;

      // Connection rules validation
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
          const targetModel = getImageModelById(toNode.data.modelId || '') || IMAGE_MODELS[0];
          if (!targetModel.features.supportReferenceImage) {
            toast({ title: '该模型不支持参考图' });
            setConnectingFrom(null);
            return;
          }
        }
      } else if (toNode.type === 'chat') {
        if (fromNode.type !== 'image' && fromNode.type !== 'prompt-template') {
          toast({ title: '聊天节点仅支持图片或模板节点连接' });
          setConnectingFrom(null);
          return;
        }
      } else if (toNode.type === 'prompt-template') {
        toast({ title: '提示词模板节点不支持输入连接' });
        setConnectingFrom(null);
        return;
      } else {
        setConnectingFrom(null);
        return;
      }

      // Create edge based on connection type
      if (toNode.type === 'chat' && fromNode.type === 'image') {
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
        setEdgesDirty((prev) => [
          ...prev.filter((edge) => {
            if (edge.to !== nodeId) return true;
            const sourceNode = nodes.find((n) => n.id === edge.from);
            return sourceNode?.type === 'image';
          }),
          { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
        ]);
      } else if ((toNode.type === 'image' || toNode.type === 'video') && fromNode.type === 'image') {
        setEdgesDirty((prev) => [
          ...prev.filter((edge) => {
            if (edge.to !== nodeId) return true;
            const sourceNode = nodes.find((n) => n.id === edge.from);
            return sourceNode?.type !== 'image';
          }),
          { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
        ]);
      } else {
        setEdgesDirty((prev) => [
          ...prev.filter((edge) => edge.to !== nodeId),
          { id: `${fromNode.id}-${toNode.id}`, from: fromNode.id, to: toNode.id },
        ]);
      }
      
      setConnectingFrom(null);
    },
    [nodes, edges, setEdgesDirty]
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const newNode = {
        ...node,
        id: crypto.randomUUID(),
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        name: `${node.name} (副本)`,
        data: {
          ...node.data,
          status: 'idle' as const, // Reset status
          generationId: undefined,
          outputUrl: undefined,
          chatOutput: undefined,
          templateOutput: undefined,
          errorMessage: undefined,
        },
      };

      setNodesDirty((prev) => [...prev, newNode]);
      toast({ title: '节点已克隆' });
    },
    [nodes, setNodesDirty]
  );

  const explodeStoryboard = useCallback(
    (chatNodeId: string, storyboardData: StoryboardData) => {
      console.log('[explodeStoryboard] Input data:', JSON.stringify(storyboardData, null, 2));

      if (!storyboardData?.scenes || !Array.isArray(storyboardData.scenes)) {
        toast({ title: '无效的分镜数据格式' });
        return;
      }

      // Filter only selected scenes
      const selectedScenes = storyboardData.scenes.filter(
        (scene: StoryboardScene) => scene.selected !== false
      );

      if (selectedScenes.length === 0) {
        toast({ title: '请至少选择一个分镜' });
        return;
      }

      const chatNode = nodes.find((n) => n.id === chatNodeId);
      if (!chatNode) return;

      const newNodes: WorkspaceNode[] = [];
      const newEdges: WorkspaceEdge[] = [];

      const startX = chatNode.position.x + 400;
      const startY = chatNode.position.y;
      const frameMode = storyboardData.frame_mode || 'first_frame';

      selectedScenes.forEach((scene: StoryboardScene, index: number) => {
        const imageId = crypto.randomUUID();
        const videoId = crypto.randomUUID();
        const yOffset = index * 520; // Enough space for vertical stack

        // Build node name with metadata
        const frameRoleLabel = scene.frame_role === 'storyboard_only' ? '分镜板' :
                               scene.frame_role === 'first_frame' ? '首帧' :
                               scene.frame_role === 'last_frame' ? '尾帧' : '关键帧';

        // Include characters and location in name if available
        let nodeName = `分镜 ${scene.id || index + 1} - ${frameRoleLabel}`;
        if (scene.characters && scene.characters.length > 0) {
          nodeName += ` [${scene.characters.slice(0, 2).join(', ')}]`;
        }
        if (scene.location) {
          nodeName += ` @ ${scene.location.slice(0, 15)}`;
        }

        // Image Node - create with all properties at once
        const baseImageNode = createNode('image', { x: startX, y: startY + yOffset });
        const imageNode: WorkspaceNode = {
          ...baseImageNode,
          id: imageId,
          name: nodeName,
          data: {
            ...baseImageNode.data,
            prompt: scene.visual_prompt || '',
            aspectRatio: scene.aspect_ratio || '16:9',
          },
        };

        console.log('[explodeStoryboard] Scene', scene.id, '- visual_prompt:', scene.visual_prompt);
        console.log('[explodeStoryboard] Scene', scene.id, '- video_prompt:', scene.video_prompt);
        console.log('[explodeStoryboard] Image node prompt set to:', imageNode.data.prompt);

        newNodes.push(imageNode);

        // Video Node - only if not storyboard_only
        if (scene.frame_role !== 'storyboard_only') {
          const baseVideoNode = createNode('video', { x: startX + 400, y: startY + yOffset });
          const videoNode: WorkspaceNode = {
            ...baseVideoNode,
            id: videoId,
            name: `分镜 ${scene.id || index + 1} - 视频`,
            data: {
              ...baseVideoNode.data,
              prompt: scene.video_prompt || '',
              duration: scene.duration || '5s',
              aspectRatio: scene.aspect_ratio || '16:9',
            },
          };

          newNodes.push(videoNode);

          // Link Image -> Video (Image-to-Video)
          newEdges.push({
            id: `${imageId}-${videoId}`,
            from: imageId,
            to: videoId
          });
        }
      });

      // Build scene-to-node mapping for progress tracking
      const sceneNodeMapping = selectedScenes.map((scene: StoryboardScene, index: number) => {
        const imageNode = newNodes.find(n => n.type === 'image' && n.name?.includes(`分镜 ${scene.id}`));
        const videoNode = newNodes.find(n => n.type === 'video' && n.name?.includes(`分镜 ${scene.id}`));
        return {
          sceneId: scene.id,
          imageNodeId: imageNode?.id,
          videoNodeId: videoNode?.id,
        };
      });

      // Update chat node to mark storyboard as confirmed and store generated node IDs
      setNodesDirty((prev) => [
        ...prev.map((node) =>
          node.id === chatNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  storyboardStep: 'confirmed' as const,
                  generatedNodeIds: newNodes.map(n => n.id),
                  sceneNodeMapping,
                }
              }
            : node
        ),
        ...newNodes
      ]);
      setEdgesDirty((prev) => [...prev, ...newEdges]);

      const modeLabel = frameMode === 'first_frame' ? '首帧' :
                        frameMode === 'first_last' ? '首尾帧' : '关键帧';
      toast({ title: `已生成 ${selectedScenes.length} 组分镜节点 (${modeLabel}模式)` });

      // Return image node IDs for batch execution
      return newNodes.filter(n => n.type === 'image').map(n => n.id);
    },
    [nodes, createNode, setNodesDirty, setEdgesDirty]
  );

  return {
    createNode,
    addNodeAt,
    updateNodeData,
    updateNode,
    removeNode,
    removeEdge,
    insertCharacterMention,
    handleStartConnect,
    handleFinishConnect,
    duplicateNode,
    explodeStoryboard,
  };
}
