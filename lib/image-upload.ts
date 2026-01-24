export interface UploadImageRequest {
  image: string; // base64 data URL or raw base64
  aspectRatio?: string;
}

export interface UploadImageResponse {
  media_id: string;
  aspect_ratio?: string;
  message?: string;
}

export async function uploadImageToVeo(
  baseUrl: string,
  apiKey: string,
  imageData: string,
  mimeType: string,
  aspectRatio?: string
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/images/upload`;
  
  // Build data URL if not already
  const dataUrl = imageData.startsWith('data:') 
    ? imageData 
    : `data:${mimeType || 'image/jpeg'};base64,${imageData}`;
  
  const payload: UploadImageRequest = {
    image: dataUrl,
  };
  
  if (aspectRatio) {
    // Map aspect ratio to Flow API format
    const ratioMap: Record<string, string> = {
      'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
      '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
      'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
      '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
      'square': 'IMAGE_ASPECT_RATIO_SQUARE',
      '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
    };
    payload.aspectRatio = ratioMap[aspectRatio] || 'IMAGE_ASPECT_RATIO_LANDSCAPE';
  }

  // Add timeout control to prevent socket leaks
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Image upload failed (${response.status}): ${errorText}`);
    }

    const result: UploadImageResponse = await response.json();
    return result.media_id;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Image upload timeout after 60 seconds');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildDataUrl(mimeType: string, data: string): string {
  if (data.startsWith('data:')) return data;
  return `data:${mimeType || 'image/jpeg'};base64,${data}`;
}
