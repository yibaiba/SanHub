import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdapter } from '@/lib/db';
import { getVideoStatus } from '@/lib/sora-api'; // 复用 sora-api 的状态查询

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      // 如果没传 taskId，查询该用户最近的一个进行中任务
      const db = getAdapter();
      const [tasks] = await db.execute(
        `SELECT * FROM task_queue
         WHERE user_id = ? AND type LIKE 'upscale_%'
         ORDER BY created_at DESC LIMIT 1`,
        [session.user.id]
      );

      if ((tasks as any[]).length === 0) {
        return NextResponse.json({ task: null });
      }

      const task = (tasks as any[])[0];
      return NextResponse.json({ task });
    }

    // 如果传了 taskId
    const db = getAdapter();
    const [tasks] = await db.execute(
      'SELECT * FROM task_queue WHERE id = ? AND user_id = ?',
      [taskId, session.user.id]
    );

    if ((tasks as any[]).length === 0) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    const task = (tasks as any[])[0];

    // 如果任务还在 processing 状态，尝试去 API 侧同步最新状态
    if (task.status === 'processing' && task.result) {
      try {
        const apiResult = JSON.parse(task.result);
        const apiTaskId = apiResult.taskId || apiResult.id;

        if (apiTaskId) {
          // 调用 Sora API 查询真实状态
          // 注意：这里假设超分任务的状态查询 endpoint 与视频生成通用
          // 如果不同，需要在 sora-api 中新增 getUpscaleStatus
          // 暂时复用 getVideoStatus，通常 Google 系 API ID 格式通用
          const remoteStatus = await getVideoStatus(apiTaskId);

          if (remoteStatus.status === 'completed' || remoteStatus.status === 'succeeded') {
             // 更新为完成
             await db.execute(
               'UPDATE task_queue SET status = ?, result = ?, updated_at = ? WHERE id = ?',
               ['completed', JSON.stringify(remoteStatus), Date.now(), taskId]
             );
             task.status = 'completed';
             task.result = JSON.stringify(remoteStatus);
          } else if (remoteStatus.status === 'failed') {
             // 更新为失败
             await db.execute(
               'UPDATE task_queue SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?',
               ['failed', remoteStatus.error?.message || 'Remote task failed', Date.now(), taskId]
             );
             task.status = 'failed';
             task.error_msg = remoteStatus.error?.message;
          }
        }
      } catch (e) {
        console.error('[Upscale Status] Sync failed:', e);
        // 同步失败不影响返回当前库中状态
      }
    }

    return NextResponse.json({ task });

  } catch (error) {
    console.error('[API] Upscale status error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
