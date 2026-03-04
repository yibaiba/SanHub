import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteWorkspace, getWorkspaceById, updateWorkspace } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const workspace = await getWorkspaceById(session.user.id, id);

    if (!workspace) {
      return NextResponse.json({ error: '工作空间不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: workspace });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取工作空间失败' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const data = body.data;

    if (name === undefined && data === undefined) {
      return NextResponse.json({ error: '缺少更新字段' }, { status: 400 });
    }

    const workspace = await updateWorkspace(session.user.id, id, {
      ...(name !== undefined ? { name: name || '未命名工作空间' } : {}),
      ...(data !== undefined ? { data } : {}),
    });

    if (!workspace) {
      return NextResponse.json({ error: '工作空间不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: workspace });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '更新工作空间失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const deleted = await deleteWorkspace(session.user.id, id);

    if (!deleted) {
      return NextResponse.json({ error: '删除失败或无权限' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除工作空间失败' },
      { status: 500 }
    );
  }
}
