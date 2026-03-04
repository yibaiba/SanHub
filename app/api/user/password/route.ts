import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserById, updateUser, verifyPassword } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();
    
    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: '新密码至少 6 个字符' }, { status: 400 });
    }

    // 如果提供了当前密码，验证它
    if (currentPassword) {
      const user = await getUserById(session.user.id);
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }
      
      const valid = await verifyPassword(user.email, currentPassword);
      if (!valid) {
        return NextResponse.json({ error: '当前密码错误' }, { status: 400 });
      }
    }

    await updateUser(session.user.id, { password: newPassword });
    
    return NextResponse.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '修改失败' },
      { status: 500 }
    );
  }
}
