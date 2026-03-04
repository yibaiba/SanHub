import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getChatModel, getUserById, updateUserBalance } from '@/lib/db';
import { validateGeneratedTextContent } from '@/lib/media-url-validator';
import { checkRateLimit, RateLimitConfig } from '@/lib/rate-limit';
import type { StoryboardData } from '@/types';

// Validation constants
const CHAT_MAX_LENGTH = 2000;
const MAX_IMAGES = 10;
const MAX_IMAGE_URL_LENGTH = 100000; // ~100KB for base64 data URLs
const MAX_HISTORY_MESSAGES = 20; // Max conversation history

/**
 * Convert image URL to valid base64 data URL for Chat API
 * Handles: http/https URLs, existing data URLs, and filters invalid formats
 */
async function prepareImageForChat(imageUrl: string): Promise<string | null> {
  // Skip invalid URLs (blob URLs, empty, etc.)
  if (!imageUrl || imageUrl.startsWith('blob:')) {
    console.warn('[Chat] Skipping invalid image URL:', imageUrl.substring(0, 50));
    return null;
  }

  // Already a valid data URL - validate format
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) {
      console.warn('[Chat] Invalid data URL format');
      return null;
    }
    return imageUrl;
  }

  // HTTP/HTTPS URL - fetch and convert to base64
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn('[Chat] Failed to fetch image:', response.status);
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        console.warn('[Chat] URL is not an image:', contentType);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      console.error('[Chat] Error fetching image:', error);
      return null;
    }
  }

  // Unknown format
  console.warn('[Chat] Unknown image URL format:', imageUrl.substring(0, 50));
  return null;
}

// Try to parse storyboard JSON from AI response
function tryParseStoryboard(text: string): StoryboardData | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const json = JSON.parse(jsonMatch[0]);
    if (json.scenes && Array.isArray(json.scenes)) {
      // Ensure all scenes have selected: true by default
      json.scenes = json.scenes.map((scene: Record<string, unknown>, idx: number) => ({
        ...scene,
        id: scene.id ?? idx + 1,
        selected: true,
      }));
      // Set default frame_mode if not provided
      if (!json.frame_mode) {
        json.frame_mode = 'first_frame';
      }
      return json as StoryboardData;
    }
    return null;
  } catch {
    return null;
  }
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = checkRateLimit(request, RateLimitConfig.CHAT, 'chat');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers: rateLimit.headers }
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const {
      modelId,
      prompt,
      images,
      // New fields for multi-turn conversation
      history,
      systemPrompt,
    } = body as {
      modelId: string;
      prompt: string;
      images?: string[];
      history?: ChatMessage[];
      systemPrompt?: string;
    };

    // Validate required fields
    if (!modelId || typeof modelId !== 'string') {
      return NextResponse.json(
        { success: false, error: '模型 ID 不能为空' },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, error: '提示词不能为空' },
        { status: 400 }
      );
    }

    // Validate prompt length
    if (prompt.length > CHAT_MAX_LENGTH) {
      return NextResponse.json(
        { success: false, error: `提示词不能超过 ${CHAT_MAX_LENGTH} 个字符` },
        { status: 400 }
      );
    }

    // Validate images array
    if (images !== undefined) {
      if (!Array.isArray(images)) {
        return NextResponse.json(
          { success: false, error: '图片参数格式错误' },
          { status: 400 }
        );
      }
      if (images.length > MAX_IMAGES) {
        return NextResponse.json(
          { success: false, error: `图片数量不能超过 ${MAX_IMAGES} 张` },
          { status: 400 }
        );
      }
      for (const img of images) {
        if (typeof img !== 'string' || img.length > MAX_IMAGE_URL_LENGTH) {
          return NextResponse.json(
            { success: false, error: '图片数据格式错误或过大' },
            { status: 400 }
          );
        }
      }
    }

    // Validate history array
    if (history !== undefined) {
      if (!Array.isArray(history)) {
        return NextResponse.json(
          { success: false, error: '对话历史格式错误' },
          { status: 400 }
        );
      }
      if (history.length > MAX_HISTORY_MESSAGES) {
        return NextResponse.json(
          { success: false, error: `对话历史不能超过 ${MAX_HISTORY_MESSAGES} 条` },
          { status: 400 }
        );
      }
    }

    const model = await getChatModel(modelId);
    if (!model || !model.enabled) {
      return NextResponse.json(
        { success: false, error: '模型不存在或已禁用' },
        { status: 400 }
      );
    }

    // Check if model supports vision when images are provided
    if (images && images.length > 0 && !model.supportsVision) {
      return NextResponse.json(
        { success: false, error: '该模型不支持图片输入' },
        { status: 400 }
      );
    }

    // Check user balance
    const user = await getUserById(session.user.id);
    if (!user || user.balance < model.costPerMessage) {
      return NextResponse.json(
        { success: false, error: '积分不足' },
        { status: 400 }
      );
    }

    // Build messages for the API call
    const messages: Array<{ role: string; content: unknown }> = [];

    // Add system prompt if provided
    if (systemPrompt && typeof systemPrompt === 'string') {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add conversation history
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        if (msg.role && msg.content) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add current user message
    if (images && images.length > 0 && model.supportsVision) {
      // Vision model with images - prepare and validate each image
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
        { type: 'text', text: prompt },
      ];

      for (const imageUrl of images) {
        const preparedUrl = await prepareImageForChat(imageUrl);
        if (preparedUrl) {
          content.push({
            type: 'image_url',
            image_url: { url: preparedUrl },
          });
        }
      }

      // Only use vision format if we have valid images
      if (content.length > 1) {
        messages.push({ role: 'user', content });
      } else {
        // No valid images, fall back to text-only
        messages.push({ role: 'user', content: prompt });
      }
    } else {
      // Text-only message
      messages.push({ role: 'user', content: prompt });
    }

    // Call the chat API
    const response = await fetch(model.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.modelId,
        messages,
        max_tokens: Math.min(4096, model.maxTokens),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Workspace Chat] API error:', {
        status: response.status,
        statusText: response.statusText,
        modelId: model.modelId,
        apiUrl: model.apiUrl,
        errorData,
      });
      throw new Error(errorData.error?.message || `API 调用失败: ${response.status}`);
    }

    const data = await response.json();
    const contentValidation = validateGeneratedTextContent(data.choices?.[0]?.message?.content);
    if (!contentValidation.valid) {
      throw new Error(`聊天失败：未返回有效文本内容（${contentValidation.reason}）`);
    }
    const assistantContent = contentValidation.normalizedText;

    // Deduct balance
    await updateUserBalance(session.user.id, -model.costPerMessage, 'strict');

    // Try to parse storyboard data from response
    const storyboardData = tryParseStoryboard(assistantContent);

    return NextResponse.json({
      success: true,
      data: {
        content: assistantContent,
        cost: model.costPerMessage,
        storyboardData, // Will be null if not a valid storyboard JSON
      },
    });
  } catch (error) {
    console.error('Workspace chat error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '聊天失败' },
      { status: 500 }
    );
  }
}
