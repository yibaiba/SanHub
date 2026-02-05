/**
 * 智能参数继承模块
 * 当节点间建立连接时，自动将上游节点的关键参数同步到下游节点
 */

import { WorkspaceNode, WorkspaceNodeType, StoryboardData } from '@/types';

interface SyncRule {
  fromType: WorkspaceNodeType;
  toType: WorkspaceNodeType;
  params: string[];
}

/**
 * 参数同步规则表
 * 定义哪些参数应该从上游节点同步到下游节点
 */
const SYNC_RULES: SyncRule[] = [
  { fromType: 'image', toType: 'video', params: ['aspectRatio'] },
  { fromType: 'image', toType: 'image', params: ['aspectRatio'] },
  { fromType: 'chat', toType: 'image', params: ['aspectRatio'] },
  { fromType: 'chat', toType: 'video', params: ['aspectRatio', 'duration'] },
  { fromType: 'prompt-template', toType: 'image', params: ['aspectRatio'] },
  { fromType: 'prompt-template', toType: 'video', params: ['aspectRatio', 'duration'] },
];

/**
 * 从分镜数据中提取参数
 */
function extractFromStoryboard(storyboardData: StoryboardData): Partial<WorkspaceNode['data']> {
  const result: Partial<WorkspaceNode['data']> = {};

  // 从第一个场景提取默认参数
  const firstScene = storyboardData.scenes?.[0];
  if (firstScene) {
    if (firstScene.aspect_ratio) {
      result.aspectRatio = firstScene.aspect_ratio;
    }
    if (firstScene.duration) {
      result.duration = firstScene.duration;
    }
  }

  // 从元数据提取
  if (storyboardData.metadata) {
    if (storyboardData.metadata.total_duration && !result.duration) {
      // 如果有总时长但没有单场景时长，使用默认5s
      result.duration = '5s';
    }
  }

  return result;
}

export interface InheritableParamsResult {
  params: Partial<WorkspaceNode['data']>;
  syncedParamNames: string[];
}

/**
 * 获取应该从上游节点继承的参数
 * @param fromNode 上游节点
 * @param toNode 下游节点
 * @returns 应该同步的参数及参数名列表，如果不需要同步则返回 null
 */
export function getInheritableParams(
  fromNode: WorkspaceNode,
  toNode: WorkspaceNode
): InheritableParamsResult | null {
  // 查找匹配的同步规则
  const rule = SYNC_RULES.find(
    r => r.fromType === fromNode.type && r.toType === toNode.type
  );

  if (!rule) return null;

  const result: Partial<WorkspaceNode['data']> = {};
  let hasChanges = false;

  const syncedParamNames: string[] = [];

  // 特殊处理：Chat 节点的分镜数据
  if (fromNode.type === 'chat' && fromNode.data.storyboardData) {
    const storyboardParams = extractFromStoryboard(fromNode.data.storyboardData);

    for (const param of rule.params) {
      const value = storyboardParams[param as keyof typeof storyboardParams];
      const currentValue = toNode.data[param as keyof typeof toNode.data];

      // 仅当目标参数为空或为默认值时才同步
      if (value && (!currentValue || isDefaultValue(param, currentValue))) {
        (result as any)[param] = value;
        syncedParamNames.push(param);
        hasChanges = true;
      }
    }

    return hasChanges ? { params: result, syncedParamNames } : null;
  }

  // 通用处理：直接从上游节点 data 中提取
  for (const param of rule.params) {
    const value = fromNode.data[param as keyof typeof fromNode.data];
    const currentValue = toNode.data[param as keyof typeof toNode.data];

    // 仅当目标参数为空或为默认值时才同步
    if (value && (!currentValue || isDefaultValue(param, currentValue))) {
      (result as any)[param] = value;
      syncedParamNames.push(param);
      hasChanges = true;
    }
  }

  return hasChanges ? { params: result, syncedParamNames } : null;
}

/**
 * 判断参数值是否为默认值
 */
function isDefaultValue(param: string, value: any): boolean {
  const defaults: Record<string, string[]> = {
    aspectRatio: ['16:9', '1:1'], // 常见默认比例
    duration: ['5s', '10s'],      // 常见默认时长
  };

  return defaults[param]?.includes(value) ?? false;
}

/**
 * 格式化同步结果为用户友好的消息
 */
export function formatSyncMessage(params: Partial<WorkspaceNode['data']>): string {
  const parts: string[] = [];

  if (params.aspectRatio) {
    parts.push(`比例 ${params.aspectRatio}`);
  }
  if (params.duration) {
    parts.push(`时长 ${params.duration}`);
  }

  if (parts.length === 0) return '';
  return `已同步: ${parts.join('、')}`;
}
