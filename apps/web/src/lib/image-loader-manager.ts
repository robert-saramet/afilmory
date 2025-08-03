import { fileTypeFromBlob } from 'file-type'

import { i18nAtom } from '~/i18n'
import { imageConverterManager } from '~/lib/image-convert'
import { jotaiStore } from '~/lib/jotai'
import { LRUCache } from '~/lib/lru-cache'
import { convertMovToMp4, needsVideoConversion } from '~/lib/video-converter'

export interface LoadingState {
  isVisible: boolean
  isHeicFormat?: boolean
  loadingProgress?: number
  loadedBytes?: number
  totalBytes?: number
  isConverting?: boolean
  conversionMessage?: string
  codecInfo?: string
}

export interface LoadingCallbacks {
  onProgress?: (progress: number) => void
  onError?: () => void
  onLoadingStateUpdate?: (state: Partial<LoadingState>) => void
}

export interface ImageLoadResult {
  blobSrc: string
  convertedUrl?: string
}

export interface VideoProcessResult {
  convertedVideoUrl?: string
  conversionMethod?: string
}

export interface ImageCacheResult {
  blobSrc: string
  originalSize: number
  format: string
}

// Regular image cache using LRU cache
const regularImageCache: LRUCache<string, ImageCacheResult> = new LRUCache<
  string,
  ImageCacheResult
>(
  10, // Cache size for regular images
  (value, key, reason) => {
    try {
      URL.revokeObjectURL(value.blobSrc)
      console.info(`Regular image cache: Revoked blob URL - ${reason}`)
    } catch (error) {
      console.warn(
        `Failed to revoke regular image blob URL (${reason}):`,
        error,
      )
    }
  },
)

/**
 * Generate cache key for regular images
 */
function generateRegularImageCacheKey(url: string): string {
  // Use the original URL as the unique key
  return url
}

export class ImageLoaderManager {
  private currentXHR: XMLHttpRequest | null = null
  private delayTimer: NodeJS.Timeout | null = null

  /**
   * Validate if the Blob is a valid image format
   * Use magic number to detect file type, instead of relying on MIME type
   */
  private async isValidImageBlob(blob: Blob): Promise<boolean> {
    // Check file size (should be at least a few bytes)
    if (blob.size === 0) {
      console.warn('Empty blob detected')
      return false
    }

    try {
      // Use magic number to detect file type
      const fileType = await fileTypeFromBlob(blob)

      if (!fileType) {
        console.warn('Could not detect file type from blob')
        return false
      }

      // Check if it is an image format
      const isValidImage = fileType.mime.startsWith('image/')

      if (!isValidImage) {
        console.warn(
          `Invalid file type detected: ${fileType.ext} (${fileType.mime})`,
        )
        return false
      }

      console.info(`Valid image detected: ${fileType.ext} (${fileType.mime})`)
      return true
    } catch (error) {
      console.error('Failed to detect file type:', error)
      return false
    }
  }

  async loadImage(
    src: string,
    callbacks: LoadingCallbacks = {},
  ): Promise<ImageLoadResult> {
    const { onProgress, onError, onLoadingStateUpdate } = callbacks

    // Show loading indicator
    onLoadingStateUpdate?.({
      isVisible: true,
    })

    return new Promise((resolve, reject) => {
      this.delayTimer = setTimeout(async () => {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', src)
        xhr.responseType = 'blob'

        xhr.onload = async () => {
          if (xhr.status === 200) {
            try {
              // Validate if the response is an image
              const blob = xhr.response as Blob
              if (!(await this.isValidImageBlob(blob))) {
                onLoadingStateUpdate?.({
                  isVisible: false,
                })
                onError?.()
                reject(new Error('Response is not a valid image'))
                return
              }

              const result = await this.processImageBlob(
                blob,
                src, // Pass the original URL
                callbacks,
              )
              resolve(result)
            } catch (error) {
              onLoadingStateUpdate?.({
                isVisible: false,
              })
              onError?.()
              reject(error)
            }
          } else {
            onLoadingStateUpdate?.({
              isVisible: false,
            })
            onError?.()
            reject(new Error(`HTTP ${xhr.status}`))
          }
        }

        xhr.onprogress = (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 100

            // Update loading progress
            onLoadingStateUpdate?.({
              loadingProgress: progress,
              loadedBytes: e.loaded,
              totalBytes: e.total,
            })

            onProgress?.(progress)
          }
        }

        xhr.onerror = () => {
          // Hide loading indicator on error
          onLoadingStateUpdate?.({
            isVisible: false,
          })

          onError?.()
          reject(new Error('Network error'))
        }

        xhr.send()
        this.currentXHR = xhr
      }, 300)
    })
  }

  async processLivePhotoVideo(
    livePhotoVideoUrl: string,
    videoElement: HTMLVideoElement,
    callbacks: LoadingCallbacks = {},
  ): Promise<VideoProcessResult> {
    const { onLoadingStateUpdate } = callbacks

    return new Promise((resolve, reject) => {
      const processVideo = async () => {
        try {
        // Check if conversion is needed
          if (needsVideoConversion(livePhotoVideoUrl)) {
            const result = await this.convertVideo(
              livePhotoVideoUrl,
              videoElement,
              callbacks,
            )
            resolve(result)
          } else {
            const result = await this.loadDirectVideo(
              livePhotoVideoUrl,
              videoElement,
            )
            resolve(result)
          }
        } catch (error) {
          console.error('Failed to process Live Photo video:', error)
          onLoadingStateUpdate?.({
            isVisible: false,
          })
          reject(error)
        }
      }

    // Asynchronously process video without blocking image display
      processVideo()
    })
  }

  private async processImageBlob(
    blob: Blob,
    originalUrl: string,
    callbacks: LoadingCallbacks,
  ): Promise<ImageLoadResult> {
    const { onError: _onError, onLoadingStateUpdate } = callbacks

    try {
      // Use strategy pattern to detect and convert images
      const conversionResult = await imageConverterManager.convertImage(
        blob,
        originalUrl,
        callbacks,
      )

      if (conversionResult) {
        // Formats that need conversion
        console.info(
          `Image converted: ${(blob.size / 1024).toFixed(1)}KB → ${(conversionResult.convertedSize / 1024).toFixed(1)}KB`,
        )

        // Hide loading indicator
        onLoadingStateUpdate?.({
          isVisible: false,
        })

        return {
          blobSrc: conversionResult.url,
          convertedUrl: conversionResult.url,
        }
      } else {
        // Regular images that do not need conversion
        return this.processRegularImage(blob, originalUrl, callbacks)
      }
    } catch (conversionError) {
      console.error('Image conversion failed:', conversionError)

      // If conversion fails, try to process as a regular image
      try {
        console.info('Falling back to regular image processing')
        return this.processRegularImage(blob, originalUrl, callbacks)
      } catch (fallbackError) {
        console.error(
          'Fallback to regular image processing also failed:',
          fallbackError,
        )

        // Hide loading indicator on error
        onLoadingStateUpdate?.({
          isVisible: false,
        })

        _onError?.()
        throw conversionError
      }
    }
  }

  private processRegularImage(
    blob: Blob,
    originalUrl: string, // Add original URL parameter
    callbacks: LoadingCallbacks,
  ): ImageLoadResult {
    const { onLoadingStateUpdate } = callbacks

    // Generate cache key
    const cacheKey = generateRegularImageCacheKey(originalUrl) // Use the original URL

    // Check cache
    const cachedResult = regularImageCache.get(cacheKey)
    if (cachedResult) {
      console.info('Using cached regular image result', cachedResult)

      // Hide loading indicator
      onLoadingStateUpdate?.({
        isVisible: false,
      })

      return {
        blobSrc: cachedResult.blobSrc,
      }
    }

    // Regular image format
    const url = URL.createObjectURL(blob)

    const result: ImageCacheResult = {
      blobSrc: url,
      originalSize: blob.size,
      format: blob.type,
    }

    // Cache result
    regularImageCache.set(cacheKey, result)
    console.info(
      `Regular image processed and cached: ${(blob.size / 1024).toFixed(1)}KB, URL: ${originalUrl}`,
    )

    // Hide loading indicator
    onLoadingStateUpdate?.({
      isVisible: false,
    })

    return {
      blobSrc: url,
    }
  }

  private async convertVideo(
    livePhotoVideoUrl: string,
    videoElement: HTMLVideoElement,
    callbacks: LoadingCallbacks,
  ): Promise<VideoProcessResult> {
    const { onLoadingStateUpdate } = callbacks

    // Update loading indicator to show conversion progress
    onLoadingStateUpdate?.({
      isVisible: true,
      isConverting: true,
      loadingProgress: 0,
    })

    console.info('Converting MOV video to MP4...')

    const i18n = jotaiStore.get(i18nAtom)

    const result = await convertMovToMp4(livePhotoVideoUrl, (progress) => {
      // Check if it contains encoder information (supports multiple languages)
      const codecKeywords: string[] = [
        i18n.t('video.codec.keyword'), // Translation key
        'encoder',
        'codec',
        '编码器', // Fallback keyword
      ]
      const isCodecInfo = codecKeywords.some((keyword: string) =>
        progress.message.toLowerCase().includes(keyword.toLowerCase()),
      )

      onLoadingStateUpdate?.({
        isVisible: true,
        isConverting: progress.isConverting,
        loadingProgress: progress.progress,
        conversionMessage: progress.message,
        codecInfo: isCodecInfo ? progress.message : undefined,
      })
    })

    if (result.success && result.videoUrl) {
      const convertedVideoUrl = result.videoUrl

      videoElement.src = result.videoUrl
      videoElement.load()

      console.info(
        `Video conversion completed. Size: ${result.convertedSize ? Math.round(result.convertedSize / 1024) : 'unknown'}KB`,
      )

      onLoadingStateUpdate?.({
        isVisible: false,
      })

      return new Promise((resolve) => {
        const handleVideoCanPlay = () => {
          videoElement.removeEventListener('canplaythrough', handleVideoCanPlay)
          resolve({
            convertedVideoUrl,
          })
        }

        videoElement.addEventListener('canplaythrough', handleVideoCanPlay)
      })
    } else {
      console.error('Video conversion failed:', result.error)
      onLoadingStateUpdate?.({
        isVisible: false,
      })
      throw new Error(result.error || 'Video conversion failed')
    }
  }

  private async loadDirectVideo(
    livePhotoVideoUrl: string,
    videoElement: HTMLVideoElement,
  ): Promise<VideoProcessResult> {
    // Use original video directly
    videoElement.src = livePhotoVideoUrl
    videoElement.load()

    return new Promise((resolve) => {
      const handleVideoCanPlay = () => {
        videoElement.removeEventListener('canplaythrough', handleVideoCanPlay)
        resolve({
          conversionMethod: '',
        })
      }

      videoElement.addEventListener('canplaythrough', handleVideoCanPlay)
    })
  }

  cleanup() {
    // Clear timer
    if (this.delayTimer) {
      clearTimeout(this.delayTimer)
      this.delayTimer = null
    }

    // Cancel ongoing request
    if (this.currentXHR) {
      this.currentXHR.abort()
      this.currentXHR = null
    }
  }
}

// Regular image cache management functions
export function getRegularImageCacheSize(): number {
  return regularImageCache.size()
}

export function clearRegularImageCache(): void {
  regularImageCache.clear()
}

export function removeRegularImageCache(cacheKey: string): boolean {
  return regularImageCache.delete(cacheKey)
}

export function getRegularImageCacheStats(): {
  size: number
  maxSize: number
  keys: string[]
} {
  return regularImageCache.getStats()
}

/**
 * Remove specific regular image cache items based on the original URL
 */
export function removeRegularImageCacheByUrl(originalUrl: string): boolean {
  const cacheKey = generateRegularImageCacheKey(originalUrl)
  return regularImageCache.delete(cacheKey)
}
