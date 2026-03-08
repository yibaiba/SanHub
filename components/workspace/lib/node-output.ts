import type { WorkspaceNode } from '@/types';

function isMediaOutputString(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('file:')
  );
}

export function getNodeOutputUpdates(
  nodeType: WorkspaceNode['type'],
  output: unknown
): Partial<WorkspaceNode['data']> {
  if (typeof output !== 'string') {
    return {};
  }

  if ((nodeType === 'image' || nodeType === 'video') && isMediaOutputString(output)) {
    return {
      outputUrl: output,
      outputType: nodeType,
    };
  }

  return {
    chatOutput: output,
    templateOutput: output,
  };
}
