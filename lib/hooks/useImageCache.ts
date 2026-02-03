import { useRef, useCallback } from 'react';

interface CachedImage {
  mediaId: string;
  data: string; // base64 data for comparison
  mimeType: string;
  timestamp: number;
}

interface UseImageCacheReturn {
  getCachedMediaId: (data: string, mimeType: string) => string | null;
  setCachedMediaId: (data: string, mimeType: string, mediaId: string) => void;
  clearCache: () => void;
  getCacheSize: () => number;
}

const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_SIZE = 50; // Max 50 cached images

export function useImageCache(): UseImageCacheReturn {
  const cacheRef = useRef<Map<string, CachedImage>>(new Map());

  // Generate cache key from image data
  const getCacheKey = useCallback((data: string, mimeType: string): string => {
    // Use first 100 chars + length as key (fast comparison)
    const prefix = data.substring(0, 100);
    return `${mimeType}:${prefix}:${data.length}`;
  }, []);

  // Get cached media_id if exists and not expired
  const getCachedMediaId = useCallback((data: string, mimeType: string): string | null => {
    const key = getCacheKey(data, mimeType);
    const cached = cacheRef.current.get(key);
    
    if (!cached) return null;
    
    // Check if expired
    const age = Date.now() - cached.timestamp;
    if (age > CACHE_MAX_AGE) {
      cacheRef.current.delete(key);
      return null;
    }
    
    // Verify full data matches (in case of hash collision)
    if (cached.data !== data) {
      return null;
    }
    
    return cached.mediaId;
  }, [getCacheKey]);

  // Cache a media_id
  const setCachedMediaId = useCallback((data: string, mimeType: string, mediaId: string): void => {
    const key = getCacheKey(data, mimeType);
    
    // Implement LRU: remove oldest if cache is full
    if (cacheRef.current.size >= CACHE_MAX_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Date.now();
      
      for (const [k, v] of Array.from(cacheRef.current.entries())) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        cacheRef.current.delete(oldestKey);
      }
    }
    
    cacheRef.current.set(key, {
      mediaId,
      data,
      mimeType,
      timestamp: Date.now(),
    });
  }, [getCacheKey]);

  // Clear all cache
  const clearCache = useCallback((): void => {
    cacheRef.current.clear();
  }, []);

  // Get cache size
  const getCacheSize = useCallback((): number => {
    return cacheRef.current.size;
  }, []);

  return {
    getCachedMediaId,
    setCachedMediaId,
    clearCache,
    getCacheSize,
  };
}
