import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVideoChannel } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface RemoteModel {
  id: string;
  object?: string;
  description?: string;
  owned_by?: string;
}

// GET - Fetch remote models from video channel's /v1/models endpoint
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    console.log('[API] Fetching models for channel:', channelId);

    const channel = await getVideoChannel(channelId);
    if (!channel) {
      console.error('[API] Channel not found:', channelId);
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    console.log('[API] Channel info:', { 
      name: channel.name, 
      type: channel.type, 
      baseUrl: channel.baseUrl 
    });

    if (!channel.baseUrl) {
      return NextResponse.json({ error: 'Channel has no baseUrl configured' }, { status: 400 });
    }

    // Only support flow type for now
    if (channel.type !== 'flow') {
      return NextResponse.json(
        { error: 'This channel type does not support fetching remote models' },
        { status: 400 }
      );
    }

    const baseUrl = channel.baseUrl.replace(/\/$/, '');
    const modelsUrl = `${baseUrl}/v1/models`;

    // Use first API key if multiple are configured
    const apiKey = channel.apiKey?.split(',')[0]?.trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log('[API] Fetching models from:', modelsUrl);
    console.log('[API] Using API key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'none');

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    console.log('[API] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] Failed to fetch models:', errorText);
      return NextResponse.json(
        { error: `Failed to fetch models (${response.status}): ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    console.log('[API] Received data:', JSON.stringify(data).substring(0, 200));
    
    // OpenAI format: { data: [{ id: "model-id", ... }] }
    const models: RemoteModel[] = data.data || data.models || [];
    console.log('[API] Total models from backend:', models.length);

    // Filter video models (exclude image models and tools)
    const videoModels = models.filter(m => {
      const id = m.id.toLowerCase();
      // Include veo models (t2v, i2v, r2v)
      if (id.startsWith('veo_')) return true;
      // Exclude image models
      if (id.includes('gemini') && id.includes('image')) return false;
      if (id.includes('imagen')) return false;
      // Exclude upscale tools
      if (id.includes('upscale')) return false;
      // Exclude magic prompt tools
      if (id.includes('magic-prompt')) return false;
      return false;
    });

    console.log('[API] Filtered video models:', videoModels.length);
    console.log('[API] Video model IDs:', videoModels.map(m => m.id).join(', '));

    // Parse model info from backend description
    const parsedModels = videoModels.map(m => {
      const id = m.id;
      const description = m.description || '';
      
      // Determine model type
      let type: 't2v' | 'i2v' | 'r2v' = 't2v';
      if (id.includes('_i2v_')) type = 'i2v';
      else if (id.includes('_r2v_')) type = 'r2v';
      
      // Determine aspect ratio
      let aspectRatio = 'landscape';
      if (id.includes('_portrait')) aspectRatio = 'portrait';
      
      // Determine features
      const features = {
        textToVideo: true,
        imageToVideo: type === 'i2v' || type === 'r2v',
        videoToVideo: false,
        supportStyles: false,
      };
      
      return {
        id,
        description,
        type,
        aspectRatio,
        features,
        owned_by: m.owned_by || 'flow',
      };
    });

    return NextResponse.json({ 
      success: true, 
      data: parsedModels,
      total: parsedModels.length,
    });
  } catch (error) {
    console.error('[API] Fetch remote video models error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
