import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdapter } from '@/lib/db';
import { generateId } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId, template } = await req.json();

    if (!workspaceId || !template) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getAdapter();
    const shareId = generateId();
    const now = Date.now();

    // Store the template
    await db.execute(
      `INSERT INTO shared_workflows (id, workspace_id, template_data, created_at, access_count)
       VALUES (?, ?, ?, ?, ?)`,
      [shareId, workspaceId, JSON.stringify(template), now, 0]
    );

    // Construct the share URL (assuming base URL is origin)
    const url = `${req.nextUrl.origin}/share/workflow/${shareId}`;

    return NextResponse.json({
      success: true,
      data: {
        shareId,
        url
      }
    });
  } catch (error) {
    console.error('Share workflow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
