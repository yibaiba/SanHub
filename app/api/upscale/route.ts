import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAdapter } from '@/lib/db';
import { createUpscaleTask } from '@/lib/sora-api';
import { generateId } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { mediaId, quality } = body;

    if (!mediaId || !['1080p', '4k'].includes(quality)) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    const db = getAdapter();

    // 1. 检查是否存在进行中的任务（单用户并发限制）
    const [existingTasks] = await db.execute(
      `SELECT id FROM task_queue
       WHERE user_id = ? AND status IN ('pending', 'processing')
       AND type LIKE 'upscale_%'
       LIMIT 1`,
      [session.user.id]
    );

    if ((existingTasks as any[]).length > 0) {
      return NextResponse.json({ error: '您有一个超分任务正在进行中，请等待完成后再试' }, { status: 429 });
    }

    // 2. 检查积分（仅 4K 需要扣费）
    let cost = 0;
    if (quality === '4k') {
      cost = 50;
      const [users] = await db.execute('SELECT balance FROM users WHERE id = ?', [session.user.id]);
      const user = (users as any[])[0];
      if (!user || user.balance < cost) {
        return NextResponse.json({ error: '积分不足，4K超分需要50积分' }, { status: 402 });
      }
    }

    // 3. 扣费（如果需要）并创建任务记录
    // 注意：这里简化处理，先扣费再提交 API。如果 API 失败应该回滚（事务）。
    // 更好的方式是：先入库 Pending -> Worker 处理 -> 提交 API -> 成功/失败更新状态

    // 为了简化架构（无独立 Worker 进程），我们采用：
    // 入库 Pending (扣费) -> 立即触发 API -> 更新状态

    if (cost > 0) {
      await db.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [cost, session.user.id]);
    }

    const taskId = generateId();
    await db.execute(
      `INSERT INTO task_queue (id, user_id, type, status, payload, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
      [
        taskId,
        session.user.id,
        `upscale_${quality}`,
        JSON.stringify({ mediaId }),
        Date.now(),
        Date.now()
      ]
    );

    // 4. 异步触发 API 提交 (不等待完成)
    // 在真实生产环境应该由 Cron/Worker 扫描 Pending 任务。
    // 这里为了响应速度，我们在入库后尝试触发一次处理（Fire-and-forget logic）
    // 或者我们直接在这里提交给 Sora API，然后更新 task_queue 状态

    // 异步处理：
    (async () => {
      try {
        await db.execute('UPDATE task_queue SET status = ? WHERE id = ?', ['processing', taskId]);

        // 调用 Sora API
        const apiTask = await createUpscaleTask({ mediaId, quality });

        // 更新结果
        // 注意：createUpscaleTask 返回的是 API 侧的任务ID，我们需要存下来用于轮询
        await db.execute(
          'UPDATE task_queue SET result = ?, updated_at = ? WHERE id = ?',
          [JSON.stringify(apiTask), Date.now(), taskId]
        );

        // 注意：这里状态仍保持 processing，后续通过 status 接口轮询 API 侧状态来更新
        // 或者如果 API 返回就是 completed (同步)，则直接更新 completed
        if (apiTask.status === 'completed') {
           await db.execute('UPDATE task_queue SET status = ?, updated_at = ? WHERE id = ?',
             ['completed', Date.now(), taskId]);
        }

      } catch (err: any) {
        console.error('[Upscale] Task processing failed:', err);
        // 失败返还积分？视业务规则而定。这里暂不自动退款，需人工介入或完善退款逻辑。
        await db.execute(
          'UPDATE task_queue SET status = ?, error_msg = ?, updated_at = ? WHERE id = ?',
          ['failed', err.message, Date.now(), taskId]
        );
      }
    })();

    return NextResponse.json({
      success: true,
      taskId,
      message: '任务已提交',
      status: 'pending'
    });

  } catch (error) {
    console.error('[API] Upscale submit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
