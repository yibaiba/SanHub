/**
 * Slice Upload Service (Client-side)
 *
 * Handles uploading image slices from the storyboard splitter.
 * Uses /api/upload-image API for persistent storage.
 */

export interface SliceUploadResult {
  index: number;
  url: string;
  isBase64: boolean;
}

/**
 * Convert Blob to base64 data URL
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload a single slice via API
 * @param blob - Image blob
 * @param index - Slice index (for filename)
 * @returns Upload result with URL
 */
export async function uploadSlice(blob: Blob, index: number): Promise<SliceUploadResult> {
  const base64 = await blobToBase64(blob);
  const filename = `storyboard_slice_${index}_${Date.now()}.png`;

  const response = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, filename }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Upload failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    index,
    url: data.url,
    isBase64: data.isBase64,
  };
}

/**
 * Upload multiple slices in parallel
 * @param blobs - Array of image blobs with indices
 * @returns Array of upload results
 */
export async function uploadSlices(
  blobs: Array<{ blob: Blob; index: number }>
): Promise<SliceUploadResult[]> {
  const results = await Promise.all(
    blobs.map(({ blob, index }) => uploadSlice(blob, index))
  );

  return results.sort((a, b) => a.index - b.index);
}

/**
 * Upload slices with progress callback
 * @param blobs - Array of image blobs with indices
 * @param onProgress - Progress callback (0-100)
 * @returns Array of upload results
 */
export async function uploadSlicesWithProgress(
  blobs: Array<{ blob: Blob; index: number }>,
  onProgress?: (progress: number, completed: number, total: number) => void
): Promise<SliceUploadResult[]> {
  const total = blobs.length;
  let completed = 0;
  const results: SliceUploadResult[] = [];

  // Upload in batches of 3 for better performance
  const batchSize = 3;

  for (let i = 0; i < blobs.length; i += batchSize) {
    const batch = blobs.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async ({ blob, index }) => {
        const result = await uploadSlice(blob, index);
        completed++;
        onProgress?.(Math.round((completed / total) * 100), completed, total);
        return result;
      })
    );
    results.push(...batchResults);
  }

  return results.sort((a, b) => a.index - b.index);
}
