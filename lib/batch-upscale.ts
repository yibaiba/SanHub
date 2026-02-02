/**
 * Batch Upscale Service (Client-side)
 *
 * Handles batch upscaling of image slices using the /api/upscale-image endpoint.
 */

export interface UpscaleResult {
  index: number;
  originalUrl: string;
  upscaledUrl: string | null;
  mediaId: string | null;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

export interface BatchUpscaleOptions {
  quality: '1080p' | '4k';
  onProgress?: (progress: number, completed: number, total: number) => void;
  skipUpscale?: boolean;
}

/**
 * Upscale a single image via API
 */
async function upscaleImage(
  imageUrl: string,
  quality: '1080p' | '4k' = '1080p'
): Promise<{ upscaledUrl: string; mediaId: string }> {
  const response = await fetch('/api/upscale-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, quality }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Upscale failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    upscaledUrl: data.url,
    mediaId: data.mediaId,
  };
}

/**
 * Batch upscale multiple images
 * Processes in parallel with concurrency limit
 */
export async function batchUpscale(
  images: Array<{ url: string; index: number }>,
  options: BatchUpscaleOptions = { quality: '1080p' }
): Promise<UpscaleResult[]> {
  const { quality, onProgress, skipUpscale } = options;
  const total = images.length;
  let completed = 0;
  const results: UpscaleResult[] = [];

  // Process in batches of 2 to avoid overwhelming the API
  const batchSize = 2;

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async ({ url, index }): Promise<UpscaleResult> => {
        try {
          if (skipUpscale) {
            completed++;
            onProgress?.(Math.round((completed / total) * 100), completed, total);
            return {
              index,
              originalUrl: url,
              upscaledUrl: url,
              mediaId: null,
              status: 'skipped',
            };
          }

          const { upscaledUrl, mediaId } = await upscaleImage(url, quality);
          completed++;
          onProgress?.(Math.round((completed / total) * 100), completed, total);

          return {
            index,
            originalUrl: url,
            upscaledUrl,
            mediaId,
            status: 'success',
          };
        } catch (error) {
          completed++;
          onProgress?.(Math.round((completed / total) * 100), completed, total);

          console.error(`[BatchUpscale] Failed for index ${index}:`, error);
          return {
            index,
            originalUrl: url,
            upscaledUrl: null,
            mediaId: null,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    results.push(...batchResults);
  }

  return results.sort((a, b) => a.index - b.index);
}

/**
 * Batch upscale with fallback to original on failure
 * Returns URLs (upscaled if success, original if failed)
 */
export async function batchUpscaleWithFallback(
  images: Array<{ url: string; index: number }>,
  options: BatchUpscaleOptions = { quality: '1080p' }
): Promise<Array<{ index: number; url: string; wasUpscaled: boolean }>> {
  const results = await batchUpscale(images, options);

  return results.map((r) => ({
    index: r.index,
    url: r.upscaledUrl || r.originalUrl,
    wasUpscaled: r.status === 'success',
  }));
}
