/**
 * Extract image format from URL or file path
 * @param url - The URL or file path of the image
 * @returns The uppercase string of the image format, e.g., 'JPG', 'HEIC', 'PNG', etc.
 */
export const getImageFormat = (url: string): string => {
  if (!url) return 'UNKNOWN'

  const extension = url.split('.').pop()?.toUpperCase()
  return extension || 'UNKNOWN'
}

/**
 * Format file size into a readable string
 * @param bytes - File size in bytes
 * @param decimals - Number of decimal places, default is 1
 * @returns Formatted file size string, e.g., '21.1MB'
 */
export const formatFileSize = (bytes: number, decimals = 1): string => {
  if (bytes === 0) return '0B'

  const k = 1024
  const dm = Math.max(decimals, 0)
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm))}${sizes[i]}`
}

/**
 * Check if it is a supported image format
 * @param format - Image format string
 * @returns Whether it is a supported image format
 */
export const isSupportedImageFormat = (format: string): boolean => {
  const supportedFormats = [
    'JPG',
    'JPEG',
    'PNG',
    'WEBP',
    'GIF',
    'BMP',
    'SVG',
    'HEIC',
    'HEIF',
    'HIF',
    'AVIF',
    'TIFF',
    'TIF',
  ]

  return supportedFormats.includes(format.toUpperCase())
}

/**
 * Get the display name of the image format
 * @param format - Image format string
 * @returns Formatted display name
 */
export const getImageFormatDisplayName = (format: string): string => {
  const formatMap: Record<string, string> = {
    JPG: 'JPEG',
    JPEG: 'JPEG',
    HEIC: 'HEIC',
    HIF: 'HEIF',
    HEIF: 'HEIF',
    PNG: 'PNG',
    WEBP: 'WebP',
    GIF: 'GIF',
    BMP: 'BMP',
    SVG: 'SVG',
    AVIF: 'AVIF',
    TIFF: 'TIFF',
    TIF: 'TIFF',
  }

  return formatMap[format.toUpperCase()] || format.toUpperCase()
}
