import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInviteCode } from '@/lib/sora-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // 验证登录
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const result = await getInviteCode();

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Invite code error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取邀请码失败' },
      { status: 500 }
    );
  }
}
