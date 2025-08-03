/**
 * Image conversion strategy pattern implementation
 * Supports conversion of multiple image formats not natively supported by browsers
 */
import type { LoadingCallbacks } from '../image-loader-manager'
import { HeicConverterStrategy } from './strategies/heic'
import { TiffConverterStrategy } from './strategies/tiff'
import type { ConversionResult, ImageConverterStrategy } from './type'

// Image converter strategy manager
export class ImageConverterManager {
  private strategies = new Map<string, ImageConverterStrategy>()

  constructor() {
    // Register default strategies
    this.registerStrategy(new HeicConverterStrategy())
    this.registerStrategy(new TiffConverterStrategy())
  }

  /**
   * Register conversion strategy
   */
  registerStrategy(strategy: ImageConverterStrategy): void {
    // Register strategy for each supported format
    strategy.getSupportedFormats().forEach((format) => {
      this.strategies.set(format, strategy)
    })
    console.info(`Registered image converter strategy: ${strategy.getName()}`)
  }

  /**
   * Remove conversion strategy
   */
  removeStrategy(strategyName: string): boolean {
    let removed = false
    const strategy = Array.from(this.strategies.values()).find(
      (s) => s.getName() === strategyName,
    )

    if (strategy) {
      strategy.getSupportedFormats().forEach((format) => {
        if (this.strategies.get(format) === strategy) {
          this.strategies.delete(format)
          removed = true
        }
      })
      if (removed) {
        console.info(`Removed image converter strategy: ${strategyName}`)
      }
    }
    return removed
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): ImageConverterStrategy[] {
    const uniqueStrategies = new Set(this.strategies.values())
    return Array.from(uniqueStrategies)
  }

  /**
   * Use file-type to directly find a suitable conversion strategy
   */
  async findSuitableStrategy(
    blob: Blob,
  ): Promise<ImageConverterStrategy | null> {
    try {
      // Use file-type to detect file format
      const { fileTypeFromBlob } = await import('file-type')
      const fileType = await fileTypeFromBlob(blob)

      if (!fileType) {
        console.info('Could not detect file type with file-type library')
        return null
      }

      console.info(`Detected file type: ${fileType.ext} (${fileType.mime})`)

      // Directly find a strategy based on MIME type
      const strategy = this.strategies.get(fileType.mime)

      if (strategy) {
        // Verify if the strategy really needs to convert this file
        const shouldConvert = await strategy.shouldConvert(blob)
        if (shouldConvert) {
          console.info(
            `Found suitable conversion strategy: ${strategy.getName()}`,
          )
          return strategy
        } else {
          console.info(
            `Strategy ${strategy.getName()} detected but conversion not needed`,
          )
          return null
        }
      }

      console.info(`No strategy found for MIME type: ${fileType.mime}`)
      return null
    } catch (error) {
      console.error('File type detection failed:', error)
      return null
    }
  }

  /**
   * Execute image conversion
   */
  async convertImage(
    blob: Blob,
    originalUrl: string,
    callbacks?: LoadingCallbacks,
  ): Promise<ConversionResult | null> {
    const strategy = await this.findSuitableStrategy(blob)

    if (!strategy) {
      console.info('No conversion strategy needed for this image')
      return null
    }

    console.info(`Converting image using ${strategy.getName()} strategy`)
    return await strategy.convert(blob, originalUrl, callbacks)
  }

  /**
   * Get a list of supported formats
   */
  getSupportedFormats(): string[] {
    return Array.from(this.strategies.keys())
  }
}

// Export singleton instance
export const imageConverterManager = new ImageConverterManager()
