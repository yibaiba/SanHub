import { NextRequest, NextResponse } from 'next/server';
import { getAdapter } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shareId = params.id;
    const db = getAdapter();

    // Fetch shared workflow
    const [rows] = await db.execute(
      'SELECT template_data, access_count FROM shared_workflows WHERE id = ?',
      [shareId]
    );

    const workflow = (rows as any[])[0];

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    // Increment access count (fire and forget)
    db.execute('UPDATE shared_workflows SET access_count = access_count + 1 WHERE id = ?', [shareId]);

    // Parse template data
    let template;
    try {
      template = JSON.parse(workflow.template_data);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid template data' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Get shared workflow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Delete shared workflow (unshare)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const shareId = params.id;
    const db = getAdapter();

    // Verify ownership via workspace_id -> user_id check
    // 1. Get workspace_id of share
    const [shareRows] = await db.execute('SELECT workspace_id FROM shared_workflows WHERE id = ?', [shareId]);
    const share = (shareRows as any[])[0];
    if (!share) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 2. Check workspace owner
    const [wsRows] = await db.execute('SELECT user_id FROM workspaces WHERE id = ?', [share.workspace_id]);
    const workspace = (wsRows as any[])[0];

    if (!workspace || workspace.user_id !== session.user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.execute('DELETE FROM shared_workflows WHERE id = ?', [shareId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete shared workflow error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
