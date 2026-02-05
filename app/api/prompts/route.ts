import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PROMPT_TEMPLATES } from '@/types';
import fs from 'fs/promises';
import path from 'path';

const PROMPTS_DIR = path.join(process.cwd(), 'data', 'prompts');

// Validation constants
const MAX_NAME_LENGTH = 50;
const MAX_CONTENT_SIZE = 50000; // 50KB
const VALID_NAME_PATTERN = /^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/;

async function ensureDir() {
  try {
    await fs.mkdir(PROMPTS_DIR, { recursive: true });
  } catch {}
}

// GET: List all prompt templates
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    await ensureDir();
    const files = await fs.readdir(PROMPTS_DIR);
    // Load file-based templates
    const fileTemplates = await Promise.all(
      files
        .filter((f) => f.endsWith('.txt'))
        .map(async (f) => {
          const content = await fs.readFile(path.join(PROMPTS_DIR, f), 'utf-8');
          return {
            id: f.replace('.txt', ''),
            name: f.replace('.txt', ''),
            content: content.trim(),
          };
        })
    );

    // Merge with default templates (file templates override defaults with same name)
    const fileNames = new Set(fileTemplates.map(t => t.name.toLowerCase()));
    const defaultTemplates = PROMPT_TEMPLATES.filter(t => !fileNames.has(t.name.toLowerCase()));
    const templates = [...defaultTemplates, ...fileTemplates];

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error('List prompts error:', error);
    return NextResponse.json({ success: false, error: '获取模板失败' }, { status: 500 });
  }
}

// POST: Create or update a prompt template
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { name, content } = body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, error: '名称不能为空' }, { status: 400 });
    }
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ success: false, error: '内容不能为空' }, { status: 400 });
    }

    // Validate name length
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { success: false, error: `名称不能超过 ${MAX_NAME_LENGTH} 个字符` },
        { status: 400 }
      );
    }

    // Validate content size
    if (content.length > MAX_CONTENT_SIZE) {
      return NextResponse.json(
        { success: false, error: `内容不能超过 ${MAX_CONTENT_SIZE} 个字符` },
        { status: 400 }
      );
    }

    // Sanitize and validate filename
    const safeName = name.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, MAX_NAME_LENGTH);
    if (!safeName || !VALID_NAME_PATTERN.test(safeName)) {
      return NextResponse.json({ success: false, error: '名称包含无效字符' }, { status: 400 });
    }

    await ensureDir();
    const filePath = path.join(PROMPTS_DIR, `${safeName}.txt`);
    await fs.writeFile(filePath, content.trim(), 'utf-8');

    return NextResponse.json({
      success: true,
      data: { id: safeName, name: safeName, content: content.trim() },
    });
  } catch (error) {
    console.error('Create prompt error:', error);
    return NextResponse.json({ success: false, error: '创建模板失败' }, { status: 500 });
  }
}

// DELETE: Delete a prompt template
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ success: false, error: '名称不能为空' }, { status: 400 });
    }

    // Validate name format to prevent path traversal
    const safeName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
    if (!safeName || !VALID_NAME_PATTERN.test(safeName)) {
      return NextResponse.json({ success: false, error: '名称格式无效' }, { status: 400 });
    }

    const filePath = path.join(PROMPTS_DIR, `${safeName}.txt`);

    try {
      await fs.unlink(filePath);
    } catch {
      return NextResponse.json({ success: false, error: '模板不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete prompt error:', error);
    return NextResponse.json({ success: false, error: '删除模板失败' }, { status: 500 });
  }
}
