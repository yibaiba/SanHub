import {
  IWorkflowExporter,
  IWorkflowImporter,
  WorkflowTemplate,
  SerializedNode,
  SerializedEdge,
  ImportResult,
  ValidationResult,
  ImportWarning
} from './types';
import { WorkspaceNode, WorkspaceEdge, WorkspaceNodeType } from '@/types';

const TEMPLATE_VERSION = '1.0.0';

export class WorkflowExporter implements IWorkflowExporter {
  async exportWorkflow(
    workspaceId: string,
    nodes: WorkspaceNode[],
    edges: WorkspaceEdge[],
    name: string = 'Untitled Workflow'
  ): Promise<WorkflowTemplate> {
    const serializedNodes: SerializedNode[] = nodes.map(node => ({
      id: node.id,
      type: node.type,
      name: node.name,
      position: node.position,
      config: this.extractConfig(node)
    }));

    const serializedEdges: SerializedEdge[] = edges.map(edge => ({
      from: edge.from,
      to: edge.to
    }));

    return {
      version: TEMPLATE_VERSION,
      metadata: {
        name,
        createdAt: new Date().toISOString(),
        nodeCount: nodes.length,
        edgeCount: edges.length
      },
      nodes: serializedNodes,
      edges: serializedEdges
    };
  }

  generateDownload(template: WorkflowTemplate): Blob {
    return new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  }

  private extractConfig(node: WorkspaceNode): Record<string, any> {
    // Only extract configuration, exclude runtime state
    const {
      status,
      errorMessage,
      outputUrl,
      outputType,
      generationId,
      chatOutput,
      chatMessages,
      inputImages,
      templateOutput,
      uploadedImages, // Maybe exclude uploaded images if they are large base64?
      ...config
    } = node.data;

    // For uploadedImages, we might want to strip them to keep JSON small,
    // or keep them if portability is key.
    // Decision: Exclude large base64 data to avoid massive JSON files.
    // Ideally we would upload them and store URLs, but for now we'll strip them
    // and rely on re-upload or public URLs.
    // IF the user uses external URLs, keep them.
    if (node.data.uploadedImages) {
        // Filter out base64
        // config.uploadedImages = node.data.uploadedImages.filter(url => url.startsWith('http'));
        // Actually, for a template, we probably shouldn't include specific user data/files.
        // So let's exclude uploadedImages.
    }

    return config;
  }
}

export class WorkflowImporter implements IWorkflowImporter {
  async importWorkflow(template: WorkflowTemplate, workspaceId: string): Promise<ImportResult> {
    const warnings: ImportWarning[] = [];
    const nodeIdMapping = new Map<string, string>();

    // 1. Create new IDs for nodes
    const newNodes: WorkspaceNode[] = template.nodes.map(sNode => {
      const newId = crypto.randomUUID();
      nodeIdMapping.set(sNode.id, newId);

      return {
        id: newId,
        type: sNode.type as WorkspaceNodeType,
        name: sNode.name,
        position: sNode.position,
        data: {
          ...sNode.config,
          status: 'idle',
          prompt: sNode.config.prompt || ''
        }
      };
    });

    // 2. Recreate edges with new IDs
    // Filter edges that connect to non-existent nodes (if any)
    const newEdges: WorkspaceEdge[] = template.edges
      .filter(edge => nodeIdMapping.has(edge.from) && nodeIdMapping.has(edge.to))
      .map(edge => ({
        id: `${nodeIdMapping.get(edge.from)!}-${nodeIdMapping.get(edge.to)!}`,
        from: nodeIdMapping.get(edge.from)!,
        to: nodeIdMapping.get(edge.to)!
      }));

    return {
      success: true,
      workspaceId,
      nodeIdMapping,
      warnings
    };
  }

  // Helper to get the actual objects
  // The interface defines `importWorkflow` returning metadata.
  // The UI needs the actual nodes/edges to update state.
  // We can add a method or return them in the result.
  // Let's stick to the interface but assume the caller will use `nodeIdMapping` + template to reconstruct?
  // No, that's hard. Let's make `importWorkflow` return the data structure or have a helper.

  // Let's add a helper `parseTemplate` that returns the data directly.
  parseTemplate(template: WorkflowTemplate): { nodes: WorkspaceNode[], edges: WorkspaceEdge[] } {
      const nodeIdMapping = new Map<string, string>();
      const newNodes: WorkspaceNode[] = template.nodes.map(sNode => {
          const newId = crypto.randomUUID();
          nodeIdMapping.set(sNode.id, newId);
          return {
              id: newId,
              type: sNode.type as WorkspaceNodeType,
              name: sNode.name,
              position: sNode.position,
              data: {
                  ...sNode.config,
                  status: 'idle',
                  prompt: sNode.config.prompt || ''
              }
          };
      });

      const newEdges: WorkspaceEdge[] = template.edges
          .filter(edge => nodeIdMapping.has(edge.from) && nodeIdMapping.has(edge.to))
          .map(edge => ({
              id: `${nodeIdMapping.get(edge.from)!}-${nodeIdMapping.get(edge.to)!}`,
              from: nodeIdMapping.get(edge.from)!,
              to: nodeIdMapping.get(edge.to)!
          }));

      return { nodes: newNodes, edges: newEdges };
  }

  validateTemplate(template: WorkflowTemplate): ValidationResult {
    const errors = [];
    if (!template.version) errors.push({ type: 'schema', message: 'Missing version' });
    if (!template.nodes || !Array.isArray(template.nodes)) errors.push({ type: 'schema', message: 'Missing nodes array' });
    if (!template.edges || !Array.isArray(template.edges)) errors.push({ type: 'schema', message: 'Missing edges array' });

    return {
      valid: errors.length === 0,
      errors: errors as any // Simplified for now
    };
  }
}
