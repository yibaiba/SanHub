import { WorkflowTemplate } from './workflow-engine';

export const WORKFLOW_PRESETS: { id: string; name: string; description: string; template: WorkflowTemplate }[] = [
  {
    id: 'basic-text-to-image',
    name: '基础文生图',
    description: '通过对话生成提示词，然后生成图片',
    template: {
      version: '1.0.0',
      metadata: {
        name: '基础文生图',
        createdAt: new Date().toISOString(),
        nodeCount: 2,
        edgeCount: 1,
      },
      nodes: [
        {
          id: 'chat-1',
          type: 'chat',
          name: '创意构思',
          position: { x: 100, y: 100 },
          config: {
            prompt: '描述一个赛博朋克风格的未来城市，包含霓虹灯和飞行汽车',
            pureMode: true
          }
        },
        {
          id: 'image-1',
          type: 'image',
          name: '图片生成',
          position: { x: 500, y: 100 },
          config: {
            aspectRatio: '16:9',
            imageSize: '1K'
          }
        }
      ],
      edges: [
        { from: 'chat-1', to: 'image-1' }
      ]
    }
  },
  {
    id: 'story-to-video',
    name: '小说推文视频',
    description: '构思分镜 -> 生成画面 -> 转换为视频 (Sora/Veo)',
    template: {
      version: '1.0.0',
      metadata: {
        name: '小说推文视频',
        createdAt: new Date().toISOString(),
        nodeCount: 3,
        edgeCount: 2,
      },
      nodes: [
        {
          id: 'chat-1',
          type: 'chat',
          name: '分镜脚本',
          position: { x: 100, y: 100 },
          config: {
            prompt: '为一段悬疑小说写一个分镜描述，突出氛围感',
            pureMode: true
          }
        },
        {
          id: 'image-1',
          type: 'image',
          name: '分镜绘图',
          position: { x: 500, y: 100 },
          config: {
            aspectRatio: '16:9'
          }
        },
        {
          id: 'video-1',
          type: 'video',
          name: '视频生成',
          position: { x: 900, y: 100 },
          config: {
            duration: '5s',
            aspectRatio: '16:9'
          }
        }
      ],
      edges: [
        { from: 'chat-1', to: 'image-1' },
        { from: 'image-1', to: 'video-1' }
      ]
    }
  },
  {
    id: 'image-variation',
    name: '图片变体/重绘',
    description: '上传参考图，生成不同风格的变体',
    template: {
      version: '1.0.0',
      metadata: {
        name: '图片变体',
        createdAt: new Date().toISOString(),
        nodeCount: 2,
        edgeCount: 1,
      },
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          name: '参考图输入',
          position: { x: 100, y: 100 },
          config: {
            prompt: '保持构图，改为水彩画风格',
            aspectRatio: '1:1'
          }
        },
        {
          id: 'image-2',
          type: 'image',
          name: '重绘结果',
          position: { x: 500, y: 100 },
          config: {
            aspectRatio: '1:1'
          }
        }
      ],
      edges: [
        { from: 'image-1', to: 'image-2' }
      ]
    }
  },
  {
    id: 'character-design',
    name: '角色一致性设计',
    description: '使用模板固定角色特征，生成不同动作',
    template: {
      version: '1.0.0',
      metadata: {
        name: '角色设计',
        createdAt: new Date().toISOString(),
        nodeCount: 3,
        edgeCount: 2,
      },
      nodes: [
        {
          id: 'template-1',
          type: 'prompt-template',
          name: '角色设定',
          position: { x: 100, y: 100 },
          config: {
            templateId: 'character-sheet-3view' // Assuming this ID exists in PROMPT_TEMPLATES
          }
        },
        {
          id: 'image-1',
          type: 'image',
          name: '三视图',
          position: { x: 500, y: 50 },
          config: {
            aspectRatio: '3:2',
            prompt: 'Silver haired elf archer, detailed armor'
          }
        },
        {
          id: 'image-2',
          type: 'image',
          name: '动作展示',
          position: { x: 500, y: 500 },
          config: {
            aspectRatio: '1:1',
            prompt: 'Running pose, dynamic action'
          }
        }
      ],
      edges: [
        { from: 'template-1', to: 'image-1' },
        { from: 'template-1', to: 'image-2' }
      ]
    }
  }
];
