import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserById } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/debug/balance - Debug balance check
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user from database
    const dbUser = await getUserById(session.user.id);
    
    return NextResponse.json({
      sessionBalance: session.user.balance,
      databaseBalance: dbUser?.balance,
      userId: session.user.id,
      userName: session.user.name,
      match: session.user.balance === dbUser?.balance,
    });
  } catch (error) {
    console.error('Balance debug error:', error);
    return NextResponse.json(
      { error: 'Failed to check balance', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
