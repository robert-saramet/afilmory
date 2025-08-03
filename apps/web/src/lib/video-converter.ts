import { getI18n } from '~/i18n'

import { isSafari } from './device-viewport'
import { LRUCache } from './lru-cache'
import { transmuxMovToMp4 } from './mp4-utils'

interface ConversionProgress {
  isConverting: boolean
  progress: number
  message: string
}

interface ConversionResult {
  success: boolean
  videoUrl?: string
  error?: string
  convertedSize?: number
}

// Global video cache instance using the generic LRU cache with custom cleanup
const videoCache: LRUCache<string, ConversionResult> = new LRUCache<
  string,
  ConversionResult
>(10, (value, key, reason) => {
  if (value.videoUrl) {
    try {
      URL.revokeObjectURL(value.videoUrl)
      console.info(`Video cache: Revoked blob URL - ${reason}`)
    } catch (error) {
      console.warn(`Failed to revoke video blob URL (${reason}):`, error)
    }
  }
})

function convertMOVtoMP4(
  videoUrl: string,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  return new Promise((resolve) => {
    // Start transmux conversion
    transmuxMovToMp4(videoUrl, {
      onProgress,
    })
      .then((result) => {
        resolve(result)
      })
      .catch((error) => {
        console.error('Transmux conversion failed:', error)
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Transmux failed',
        })
      })
  })
}

// Detect if the browser natively supports the MOV format
function isBrowserSupportMov(): boolean {
  // Create a temporary video element to test format support
  const video = document.createElement('video')

  // Check if the MOV container format is supported
  const canPlayMov = video.canPlayType('video/quicktime')

  // Safari usually supports MOV natively
  if (isSafari) {
    return true
  }

  // For other browsers, it is considered supported only when canPlayType explicitly returns support
  // 'probably' or 'maybe' indicates support, an empty string indicates no support
  return canPlayMov === 'probably' || canPlayMov === 'maybe'
}

// Detect if mov file needs to be converted
export function needsVideoConversion(url: string): boolean {
  const lowerUrl = url.toLowerCase()
  const isMovFile = lowerUrl.includes('.mov') || lowerUrl.endsWith('.mov')

  // If it is not a MOV file, no conversion is required
  if (!isMovFile) {
    return false
  }

  // If the browser natively supports MOV, no conversion is required
  if (isBrowserSupportMov()) {
    console.info('Browser natively supports MOV format, skipping conversion')
    return false
  }

  // The browser does not support MOV, conversion is required
  console.info('Browser does not support MOV format, conversion needed')
  return true
}

export async function convertMovToMp4(
  videoUrl: string,

  onProgress?: (progress: ConversionProgress) => void,
  forceReconvert = false, // Add force reconversion parameter
): Promise<ConversionResult> {
  const { t } = getI18n()
  // Check cache first, unless forced to reconvert
  if (!forceReconvert) {
    const cachedResult = videoCache.get(videoUrl)
    if (cachedResult) {
      console.info('Using cached video conversion result')
      onProgress?.({
        isConverting: false,
        progress: 100,
        message: t('video.conversion.cached.result'),
      })
      console.info(`Cached video conversion result:`, cachedResult)
      return cachedResult
    }
  } else {
    console.info('Force reconversion: clearing cached result for', videoUrl)
    videoCache.delete(videoUrl)
  }

  try {
    console.info(`🎯 Target format: MP4 (H.264)`)
    onProgress?.({
      isConverting: true,
      progress: 0,
      message: t('video.conversion.transmux.high.quality'),
    })

    const result = await convertMOVtoMP4(videoUrl, onProgress)

    // Cache the result
    videoCache.set(videoUrl, result)

    if (result.success) {
      console.info('conversion completed successfully and cached')
    } else {
      console.error('conversion failed:', result.error)
    }

    return result
  } catch (error) {
    console.error('conversion failed:', error)
    const fallbackResult = {
      success: false,
      error: `Conversion Failed: ${error instanceof Error ? error.message : error}`,
    }

    return fallbackResult
  }
}
