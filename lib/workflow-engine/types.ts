import { WorkspaceNode, WorkspaceEdge } from '@/types';

// ========================================
// Core Engine Types
// ========================================

export interface ExecutionOptions {
  cascadeEnabled?: boolean;     // Whether to trigger downstream nodes
  forceRerun?: boolean;         // Rerun even if already completed
}

export interface ExecutionResult {
  nodeId: string;
  status: 'completed' | 'failed' | 'cancelled';
  output?: any;
  error?: string;
  duration: number;
}

export interface WorkflowExecutionResult {
  workspaceId: string;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  duration: number;
  errors: Array<{ nodeId: string; error: string }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  type: 'cycle' | 'missing_input' | 'incompatible_types' | 'empty_workflow';
  message: string;
  nodeIds?: string[];
}

export interface NodeExecutionState {
  status: 'idle' | 'waiting' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  output?: any;
  error?: string;
}

export interface WorkspaceExecutionState {
  workspaceId: string;
  isExecuting: boolean;
  nodeStates: Map<string, NodeExecutionState>;
  executionOrder?: string[];
}

// ========================================
// Serialization Types
// ========================================

export interface WorkflowMetadata {
  name: string;
  description?: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  tags?: string[];
}

export interface SerializedNode {
  id: string;
  type: string;
  name: string;
  position: { x: number; y: number };
  config: Record<string, any>;
}

export interface SerializedEdge {
  from: string;
  to: string;
}

export interface WorkflowTemplate {
  version: string;
  metadata: WorkflowMetadata;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

export interface ImportResult {
  success: boolean;
  workspaceId: string;
  nodeIdMapping: Map<string, string>;
  warnings: ImportWarning[];
}

export interface ImportWarning {
  type: 'model_substitution' | 'missing_template' | 'version_migration';
  message: string;
  nodeId?: string;
}

// ========================================
// Interfaces
// ========================================

export interface IWorkflowExporter {
  exportWorkflow(workspaceId: string, nodes: WorkspaceNode[], edges: WorkspaceEdge[]): Promise<WorkflowTemplate>;
  generateDownload(template: WorkflowTemplate): Blob;
}

export interface IWorkflowImporter {
  importWorkflow(template: WorkflowTemplate, workspaceId: string): Promise<ImportResult>;
  validateTemplate(template: WorkflowTemplate): ValidationResult;
}

export interface IDependencyResolver {
  computeTopologicalOrder(nodes: WorkspaceNode[], edges: WorkspaceEdge[]): string[];
  areDependenciesSatisfied(nodeId: string, nodes: WorkspaceNode[], edges: WorkspaceEdge[]): boolean;
  getUpstreamNodes(nodeId: string, edges: WorkspaceEdge[]): string[];
  getDownstreamNodes(nodeId: string, edges: WorkspaceEdge[]): string[];
  detectCycles(nodes: WorkspaceNode[], edges: WorkspaceEdge[]): string[][] | null;
  validateWorkflow(nodes: WorkspaceNode[], edges: WorkspaceEdge[]): ValidationResult;
}

export interface IExecutionManager {
  executeNode(nodeId: string, options?: ExecutionOptions): Promise<ExecutionResult>;
  executeWorkflow(workspaceId: string): Promise<WorkflowExecutionResult>;
  cancelExecution(workspaceId: string): Promise<void>;
  triggerCascade(nodeId: string): Promise<void>;
}

export interface IStateManager {
  updateNodeState(nodeId: string, state: NodeExecutionState): Promise<void>;
  getExecutionState(workspaceId: string): Promise<WorkspaceExecutionState>;
  persistState(workspaceId: string): Promise<void>;
  restoreState(workspaceId: string): Promise<void>;
  resetWorkflow(workspaceId: string): Promise<void>;
}
