import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserDailyUsage, getSystemConfig } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/user/daily-usage - 获取用户今日使用量和限制
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    const [usage, config] = await Promise.all([
      getUserDailyUsage(session.user.id),
      getSystemConfig(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        usage,
        limits: config.dailyLimit,
      },
    });
  } catch (error) {
    console.error('[DailyUsage] Error:', error);
    return NextResponse.json(
      { success: false, error: '获取使用量失败' },
      { status: 500 }
    );
  }
}
