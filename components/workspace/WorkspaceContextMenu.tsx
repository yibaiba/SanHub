'use client';

import { ImageIcon, Video, MessageSquare, FileText } from 'lucide-react';
import type { WorkspaceNodeType } from '@/types';

interface WorkspaceContextMenuProps {
  position: { x: number; y: number };
  zoom: number;
  onAddNode: (type: WorkspaceNodeType, position: { x: number; y: number }) => void;
  onClose: () => void;
}

const NODE_TYPES: Array<{
  type: WorkspaceNodeType;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { type: 'image', label: '图片节点', icon: ImageIcon },
  { type: 'video', label: '视频节点', icon: Video },
  { type: 'chat', label: '聊天节点', icon: MessageSquare },
  { type: 'prompt-template', label: '提示词模板', icon: FileText },
];

export function WorkspaceContextMenu({
  position,
  zoom,
  onAddNode,
  onClose,
}: WorkspaceContextMenuProps) {
  return (
    <div
      className="absolute z-50 bg-card/95 border border-border/70 rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{
        left: position.x * zoom,
        top: position.y * zoom,
      }}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-foreground/40 border-b border-border/70">
        添加节点
      </div>
      {NODE_TYPES.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          onClick={() => {
            onAddNode(type, position);
            onClose();
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-card/70 transition"
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

