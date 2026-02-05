/**
 * 工作流执行预估器
 * 基于模型类型和历史平均值估算执行时间和积分消耗
 */

import { WorkspaceNode, WorkspaceEdge } from '@/types';

export interface ModelEstimate {
  avgTimeSeconds: number;
  costCredits: number;
}

export interface WorkflowEstimate {
  totalTimeSeconds: number;
  totalCredits: number;
  nodeCount: number;
  nodeEstimates: Map<string, ModelEstimate>;
}

/**
 * 模型估算表
 * 基于历史平均值，可根据实际情况调整
 */
const ESTIMATION_TABLE: Record<string, Record<string, ModelEstimate>> = {
  image: {
    'flux-schnell': { avgTimeSeconds: 8, costCredits: 5 },
    'flux-pro': { avgTimeSeconds: 25, costCredits: 15 },
    'flux-pro-ultra': { avgTimeSeconds: 35, costCredits: 25 },
    'flux-1.1-pro': { avgTimeSeconds: 20, costCredits: 12 },
    'ideogram-v2': { avgTimeSeconds: 20, costCredits: 10 },
    'ideogram-v3': { avgTimeSeconds: 25, costCredits: 15 },
    'recraft-v3': { avgTimeSeconds: 15, costCredits: 8 },
    'midjourney': { avgTimeSeconds: 45, costCredits: 20 },
    'dall-e-3': { avgTimeSeconds: 30, costCredits: 15 },
    'stable-diffusion-3': { avgTimeSeconds: 12, costCredits: 6 },
    'default': { avgTimeSeconds: 20, costCredits: 10 },
  },
  video: {
    'sora': { avgTimeSeconds: 180, costCredits: 100 },
    'sora-turbo': { avgTimeSeconds: 90, costCredits: 60 },
    'veo-2': { avgTimeSeconds: 120, costCredits: 80 },
    'veo-3': { avgTimeSeconds: 150, costCredits: 100 },
    'kling-1.5': { avgTimeSeconds: 100, costCredits: 50 },
    'kling-1.6': { avgTimeSeconds: 90, costCredits: 45 },
    'runway-gen3': { avgTimeSeconds: 80, costCredits: 40 },
    'minimax': { avgTimeSeconds: 70, costCredits: 35 },
    'pika': { avgTimeSeconds: 60, costCredits: 30 },
    'default': { avgTimeSeconds: 120, costCredits: 80 },
  },
  chat: {
    'gpt-4': { avgTimeSeconds: 5, costCredits: 2 },
    'gpt-4o': { avgTimeSeconds: 3, costCredits: 1 },
    'claude-3': { avgTimeSeconds: 4, costCredits: 2 },
    'gemini-pro': { avgTimeSeconds: 3, costCredits: 1 },
    'default': { avgTimeSeconds: 3, costCredits: 1 },
  },
  'prompt-template': {
    'default': { avgTimeSeconds: 0, costCredits: 0 },
  },
};

/**
 * 获取单个节点的估算值
 */
function getNodeEstimate(node: WorkspaceNode): ModelEstimate {
  const typeTable = ESTIMATION_TABLE[node.type] || ESTIMATION_TABLE['prompt-template'];

  // 尝试匹配具体模型
  const modelId = node.data.modelId || node.data.chatModelId || '';

  // 精确匹配
  if (typeTable[modelId]) {
    return typeTable[modelId];
  }

  // 模糊匹配（前缀匹配）
  for (const key of Object.keys(typeTable)) {
    if (key !== 'default' && modelId.toLowerCase().includes(key.toLowerCase())) {
      return typeTable[key];
    }
  }

  return typeTable['default'] || { avgTimeSeconds: 10, costCredits: 5 };
}

/**
 * 计算工作流的拓扑层级
 * 用于估算并行执行时的总时间
 */
function computeLayers(
  nodes: WorkspaceNode[],
  edges: WorkspaceEdge[]
): WorkspaceNode[][] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  // 初始化
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    children.set(n.id, []);
  });

  // 计算入度和子节点
  edges.forEach(e => {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
    children.get(e.from)?.push(e.to);
  });

  const layers: WorkspaceNode[][] = [];
  let currentLayer = nodes.filter(n => inDegree.get(n.id) === 0);

  while (currentLayer.length > 0) {
    layers.push(currentLayer);

    const nextLayer: WorkspaceNode[] = [];
    const processed = new Set<string>();

    currentLayer.forEach(node => {
      children.get(node.id)?.forEach(childId => {
        const newDegree = (inDegree.get(childId) || 1) - 1;
        inDegree.set(childId, newDegree);

        if (newDegree === 0 && !processed.has(childId)) {
          const childNode = nodeMap.get(childId);
          if (childNode) {
            nextLayer.push(childNode);
            processed.add(childId);
          }
        }
      });
    });

    currentLayer = nextLayer;
  }

  return layers;
}

/**
 * 估算整个工作流的执行时间和费用
 * @param nodes 工作流节点
 * @param edges 工作流边
 * @returns 工作流估算结果
 */
export function estimateWorkflow(
  nodes: WorkspaceNode[],
  edges: WorkspaceEdge[]
): WorkflowEstimate {
  if (nodes.length === 0) {
    return {
      totalTimeSeconds: 0,
      totalCredits: 0,
      nodeCount: 0,
      nodeEstimates: new Map(),
    };
  }

  const nodeEstimates = new Map<string, ModelEstimate>();
  let totalCredits = 0;

  // 计算每个节点的估算值和总费用
  nodes.forEach(node => {
    const estimate = getNodeEstimate(node);
    nodeEstimates.set(node.id, estimate);
    totalCredits += estimate.costCredits;
  });

  // 计算层级，用于估算并行执行时间
  const layers = computeLayers(nodes, edges);

  // 每层取最大时间（并行执行），然后累加
  let totalTimeSeconds = 0;
  layers.forEach(layer => {
    const maxTime = Math.max(
      ...layer.map(node => nodeEstimates.get(node.id)?.avgTimeSeconds || 0)
    );
    totalTimeSeconds += maxTime;
  });

  return {
    totalTimeSeconds,
    totalCredits,
    nodeCount: nodes.length,
    nodeEstimates,
  };
}

/**
 * 格式化估算结果为用户友好的显示
 */
export function formatEstimate(estimate: WorkflowEstimate): {
  timeDisplay: string;
  costDisplay: string;
  isEmpty: boolean;
} {
  if (estimate.nodeCount === 0) {
    return {
      timeDisplay: '',
      costDisplay: '',
      isEmpty: true,
    };
  }

  // 格式化时间
  let timeDisplay: string;
  const seconds = estimate.totalTimeSeconds;

  if (seconds < 60) {
    timeDisplay = `约 ${seconds} 秒`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timeDisplay = secs > 0 ? `约 ${mins} 分 ${secs} 秒` : `约 ${mins} 分钟`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    timeDisplay = `约 ${hours} 小时 ${mins} 分`;
  }

  // 格式化费用
  const costDisplay = `约 ${estimate.totalCredits} 积分`;

  return {
    timeDisplay,
    costDisplay,
    isEmpty: false,
  };
}
