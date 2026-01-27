import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateMagicPrompt, MagicPromptRequest } from '@/lib/sora-api';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, style } = body;

    if (!prompt) {
      return NextResponse.json({ error: '请输入提示词' }, { status: 400 });
    }

    // 创建 SSE 响应
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    // 异步执行生成逻辑
    (async () => {
      try {
        const result = await generateMagicPrompt({
          prompt,
          style: style || 'default',
          stream: true,
        });

        // 假设 sora-api 返回的是 ReadableStream (API层处理 fetch response.body)
        if (result instanceof ReadableStream) {
          const reader = result.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value); // 直接转发 chunk
          }
        } else {
          // 如果非流式返回（例如字符串），一次性写入
          await writer.write(encoder.encode(result as string));
        }
      } catch (error) {
        console.error('[API] Magic Prompt error:', error);
        await writer.write(encoder.encode(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      } finally {
        await writer.close();
      }
    })();

    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[API] Magic Prompt route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
