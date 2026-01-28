'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Download, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/toaster';
import { WorkflowTemplate, WorkflowImporter } from '@/lib/workflow-engine';

export default function SharedWorkflowClient({ shareId }: { shareId: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const fetchShared = async () => {
      try {
        const res = await fetch(`/api/share/workflow/${shareId}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load workflow');
        }

        setTemplate(data.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchShared();
  }, [shareId]);

  const handleImport = async () => {
    if (!template) return;
    setImporting(true);

    try {
      // Create a new workspace
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: template.metadata.name || 'Imported Workflow' }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newWorkspaceId = data.data.id;

      // Transform nodes using importer helper to get fresh IDs
      const importer = new WorkflowImporter();
      const { nodes, edges } = importer.parseTemplate(template);

      // Save data to the new workspace
      await fetch(`/api/workspaces/${newWorkspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { nodes, edges }
        }),
      });

      toast({ title: '工作流已导入', description: '正在跳转...' });
      router.push(`/workspace/${newWorkspaceId}`);
    } catch (err: any) {
      toast({ title: '导入失败', description: err.message });
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-4 text-foreground">
        <div className="rounded-full bg-red-500/10 p-4">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="text-xl font-semibold">无法加载工作流</h1>
        <p className="text-muted-foreground">{error}</p>
        <button
          onClick={() => router.push('/')}
          className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium transition hover:bg-secondary/80"
        >
          返回首页
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Download className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {template?.metadata.name || 'Shared Workflow'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {template?.metadata.nodeCount} 个节点 · {template?.metadata.edgeCount} 条连线
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            创建于 {new Date(template?.metadata.createdAt || '').toLocaleDateString()}
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {importing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在导入...
              </span>
            ) : (
              '导入到我的工作台'
            )}
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full rounded-xl border border-border bg-transparent px-4 py-3 font-semibold text-foreground transition hover:bg-muted"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
