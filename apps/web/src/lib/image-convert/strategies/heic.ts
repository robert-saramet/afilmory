import { heicTo, isHeic } from 'heic-to'

import { i18nAtom } from '~/i18n'
import { isSafari } from '~/lib/device-viewport'
import type { LoadingCallbacks } from '~/lib/image-loader-manager'
import { jotaiStore } from '~/lib/jotai'
import { LRUCache } from '~/lib/lru-cache'

import type { ConversionResult, ImageConverterStrategy } from '../type'

// HEIC conversion strategy
export class HeicConverterStrategy implements ImageConverterStrategy {
  getName(): string {
    return 'HEIC'
  }

  getSupportedFormats(): string[] {
    return ['image/heic', 'image/heif']
  }

  async shouldConvert(_blob: Blob): Promise<boolean> {
    try {
      // Just check if the browser supports it, the format detection has been done by file-type
      return !isBrowserSupportHeic()
    } catch (error) {
      console.error('HEIC browser support detection failed:', error)
      return false
    }
  }

  async convert(
    blob: Blob,
    originalUrl: string,
    callbacks?: LoadingCallbacks,
  ): Promise<ConversionResult> {
    const { onLoadingStateUpdate } = callbacks || {}

    try {
      // Get i18n text
      const i18n = jotaiStore.get(i18nAtom)

      // Update conversion status
      onLoadingStateUpdate?.({
        isConverting: true,
        conversionMessage: i18n.t('loading.heic.converting'),
        isHeicFormat: true,
        loadingProgress: 100,
        loadedBytes: blob.size,
        totalBytes: blob.size,
      })

      const result = await convertHeicImage(blob, originalUrl)

      return {
        url: result.url,
        convertedSize: result.convertedSize,
        format: result.format,
        originalSize: result.originalSize,
      }
    } catch (error) {
      console.error('HEIC conversion failed:', error)
      throw new Error(`HEIC conversion failed: ${error}`)
    }
  }
}

export interface HeicConversionOptions {
  quality?: number
  format?: 'image/jpeg' | 'image/png'
}

// HEIC conversion cache using generic LRU cache
const heicCache: LRUCache<string, ConversionResult> = new LRUCache<
  string,
  ConversionResult
>(
  10, // Smaller cache size for images as they might be larger
  (value, key, reason) => {
    try {
      URL.revokeObjectURL(value.url)
      console.info(`HEIC cache: Revoked blob URL - ${reason}`)
    } catch (error) {
      console.warn(`Failed to revoke HEIC blob URL (${reason}):`, error)
    }
  },
)

/**
 * Generate cache key for the file (based on src)
 */
function generateCacheKey(src: string, options: HeicConversionOptions): string {
  const quality = options.quality || 1
  const format = options.format || 'image/jpeg'
  // Use file src and conversion options to generate a unique key
  return `${src}-${quality}-${format}`
}

/**
 * Detect if the file is in HEIC/HEIF format
 */
export async function detectHeicFormat(file: File | Blob): Promise<boolean> {
  try {
    return await isHeic(file as File)
  } catch (error) {
    console.warn('Failed to detect HEIC format:', error)
    return false
  }
}

export const isBrowserSupportHeic = () => {
  const safariVersionMatch = navigator.userAgent.match(/version\/(\d+)/i)
  const versionString = safariVersionMatch?.[1]
  const version = versionString ? Number.parseInt(versionString, 10) : 0

  return isSafari && version >= 17
}

/**
 * Convert HEIC/HEIF image to JPEG or PNG (with cache support)
 */
export async function convertHeicImage(
  file: File | Blob,
  src: string,
  options: HeicConversionOptions = {},
): Promise<ConversionResult> {
  const { quality = 1, format = 'image/jpeg' } = options

  // Generate cache key
  const cacheKey = generateCacheKey(src, options)

  // Check cache
  const cachedResult = heicCache.get(cacheKey)
  if (cachedResult) {
    console.info('Using cached HEIC conversion result', cachedResult)
    return cachedResult
  }

  try {
    // Check if it is HEIC format
    const isHeicFormat = await detectHeicFormat(file)
    if (!isHeicFormat) {
      throw new Error('File is not in HEIC/HEIF format')
    }

    // Convert image
    const convertedBlob = await heicTo({
      blob: file,
      type: format,
      quality,
    })

    // Create URL
    const url = URL.createObjectURL(convertedBlob)

    const result: ConversionResult = {
      url,
      originalSize: file.size,
      convertedSize: convertedBlob.size,
      format,
    }

    // Cache result
    heicCache.set(cacheKey, result)
    console.info(
      `HEIC conversion completed and cached: ${(file.size / 1024).toFixed(1)}KB → ${(convertedBlob.size / 1024).toFixed(1)}KB`,
    )

    return result
  } catch (error) {
    console.error('HEIC conversion failed:', error)
    throw new Error(
      `Failed to convert HEIC image: ${error instanceof Error ? error.message : 'Unknown error'}`,
    )
  }
}

/**
 * Clean up the converted URL
 */
export function revokeConvertedUrl(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('Failed to revoke URL:', error)
  }
}

// HEIC cache management functions
export function getHeicCacheSize(): number {
  return heicCache.size()
}

export function clearHeicCache(): void {
  heicCache.clear()
}

export function removeHeicCache(cacheKey: string): boolean {
  return heicCache.delete(cacheKey)
}

export function getHeicCacheStats(): {
  size: number
  maxSize: number
  keys: string[]
} {
  return heicCache.getStats()
}

/**
 * Remove specific HEIC cache items based on src and options
 */
export function removeHeicCacheBySrc(
  src: string,
  options: HeicConversionOptions = {},
): boolean {
  const cacheKey = generateCacheKey(src, options)
  return heicCache.delete(cacheKey)
}
