import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createWorkspace, getWorkspaceSummaries } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || undefined;
    const sort = (searchParams.get('sort') || 'updated') as 'updated' | 'created';
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc';
    const rawLimit = parseInt(searchParams.get('limit') || '200', 10);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), 200);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    const workspaces = await getWorkspaceSummaries(session.user.id, {
      search,
      sort,
      order,
      limit,
      offset,
    });

    return NextResponse.json({ success: true, data: workspaces });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取工作空间失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    let name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : '';
    const data = body.data;

    // 如果没有提供名称或使用默认名称，自动生成带序号的名称
    if (!name || name === '未命名工作空间') {
      // 获取用户现有的工作空间，查找最大序号
      const existingWorkspaces = await getWorkspaceSummaries(session.user.id, {
        limit: 200,
        sort: 'created',
        order: 'desc',
      });

      // 查找所有 "未命名工作空间" 或 "未命名工作空间 (N)" 格式的名称
      const pattern = /^未命名工作空间(?: \((\d+)\))?$/;
      let maxNumber = 0;

      for (const ws of existingWorkspaces) {
        const match = ws.name.match(pattern);
        if (match) {
          const num = match[1] ? parseInt(match[1], 10) : 1;
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }

      // 生成新名称
      const nextNumber = maxNumber + 1;
      name = nextNumber === 1 ? '未命名工作空间' : `未命名工作空间 (${nextNumber})`;
    }

    const workspace = await createWorkspace(session.user.id, name, data);

    return NextResponse.json({ success: true, data: workspace });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建工作空间失败' },
      { status: 500 }
    );
  }
}
