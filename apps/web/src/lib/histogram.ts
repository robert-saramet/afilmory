import type {
  CompressedHistogramData,
  HistogramData,
} from '@afilmory/builder/types/photo.js'

/**
 * Decompress the compressed histogram and interpolate to 256 points
 * @param compressed Compressed histogram data
 * @returns Decompressed histogram data
 */
export function decompressHistogram(
  compressed: CompressedHistogramData,
): HistogramData {
  const decompressChannel = (data: number[]): number[] => {
    const decompressed: number[] = Array.from({ length: 256 }).fill(
      0,
    ) as number[]

    for (let i = 0; i < 256; i++) {
      const compressedIndex = Math.floor(i / 4) // Corresponding compression index
      const nextCompressedIndex = Math.min(compressedIndex + 1, 63)

      // Linear interpolation
      const t = (i % 4) / 4 // Interpolation factor 0-0.75
      const value1 = (data[compressedIndex] || 0) / 10000 // Restore floating point number
      const value2 = (data[nextCompressedIndex] || 0) / 10000

      decompressed[i] = value1 * (1 - t) + value2 * t
    }

    return decompressed
  }

  return {
    red: decompressChannel(compressed.red),
    green: decompressChannel(compressed.green),
    blue: decompressChannel(compressed.blue),
    luminance: decompressChannel(compressed.luminance),
  }
}
