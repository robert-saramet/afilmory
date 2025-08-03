import type { LoadingCallbacks } from '../image-loader-manager'

// Conversion result interface
export interface ConversionResult {
  url: string
  convertedSize: number
  format: string
  originalSize: number
}

// Image conversion strategy interface
export interface ImageConverterStrategy {
  /**
   * Check if this format needs to be converted
   */
  shouldConvert: (blob: Blob) => Promise<boolean>

  /**
   * Execute conversion
   */
  convert: (
    blob: Blob,
    originalUrl: string,
    callbacks?: LoadingCallbacks,
  ) => Promise<ConversionResult>

  /**
   * Strategy name for logging and debugging
   */
  getName: () => string

  /**
   * Get supported formats
   */
  getSupportedFormats: () => string[]
}
