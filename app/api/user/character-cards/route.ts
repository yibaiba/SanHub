import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserCharacterCards, getPendingCharacterCards, deleteCharacterCard } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 支持分页
    const searchParams = request.nextUrl.searchParams;
    const rawPage = parseInt(searchParams.get('page') || '1');
    const page = Math.max(Number.isFinite(rawPage) ? rawPage : 1, 1);
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
    const offset = (page - 1) * limit;
    const pendingOnly = searchParams.get('pending') === 'true';

    let cards;
    if (pendingOnly) {
      cards = await getPendingCharacterCards(session.user.id, limit);
    } else {
      cards = await getUserCharacterCards(session.user.id, limit, offset);
    }
    
    return NextResponse.json({
      success: true,
      data: cards,
      page,
      limit,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取角色卡失败' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { cardId } = await request.json();
    
    if (!cardId) {
      return NextResponse.json({ error: '缺少卡片 ID' }, { status: 400 });
    }

    const deleted = await deleteCharacterCard(cardId, session.user.id);
    
    if (!deleted) {
      return NextResponse.json({ error: '删除失败或无权限' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}
