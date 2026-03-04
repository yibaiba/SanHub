import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// 注意: middleware 在 edge runtime 运行，无法直接访问 MySQL
// 数据库初始化将在首次 API 调用时执行
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
