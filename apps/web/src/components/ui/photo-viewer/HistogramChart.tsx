import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cx } from '~/lib/cn'

interface CompressedHistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

interface HistogramData {
  red: number[]
  green: number[]
  blue: number[]
  luminance: number[]
}

const calculateHistogram = (imageData: ImageData): CompressedHistogramData => {
  const histogram: HistogramData = {
    red: Array.from({ length: 256 }).fill(0) as number[],
    green: Array.from({ length: 256 }).fill(0) as number[],
    blue: Array.from({ length: 256 }).fill(0) as number[],
    luminance: Array.from({ length: 256 }).fill(0) as number[],
  }

  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    histogram.red[r]++
    histogram.green[g]++
    histogram.blue[b]++
    const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
    histogram.luminance[luminance]++
  }

  const compress = (channelData: number[]): number[] => {
    const compressed = Array.from({ length: 128 }).fill(0) as number[]
    for (let i = 0; i < 256; i++) {
      compressed[Math.floor(i / 2)] += channelData[i]
    }
    return compressed
  }

  return {
    red: compress(histogram.red),
    green: compress(histogram.green),
    blue: compress(histogram.blue),
    luminance: compress(histogram.luminance),
  }
}

const drawHistogram = (
  canvas: HTMLCanvasElement,
  histogram: CompressedHistogramData,
) => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Get the actual display size of the Canvas
  const rect = canvas.getBoundingClientRect()
  const { width } = rect
  const { height } = rect
  const dpr = window.devicePixelRatio || 1

  // Set high resolution
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  // Clear the canvas
  ctx.clearRect(0, 0, width, height)

  // Find the maximum value for normalization
  const maxVal = Math.max(
    ...histogram.luminance,
    ...histogram.red,
    ...histogram.green,
    ...histogram.blue,
  )

  if (maxVal === 0) return

  const padding = 0
  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2

  // Apple-style color definitions
  const colors = {
    red: 'rgb(255, 105, 97)',
    green: 'rgb(52, 199, 89)',
    blue: 'rgb(64, 156, 255)',
    luminance: 'rgba(255, 255, 255, 0.6)',
    background: 'rgba(28, 28, 30, 0.95)',
    grid: 'rgba(255, 255, 255, 0.04)',
    border: 'rgba(255, 255, 255, 0.08)',
  }

  // Draw background
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  // Draw minimalist grid
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 0.5

  // Only draw a few key grid lines
  for (let i = 1; i <= 3; i++) {
    const y = padding + (chartHeight / 4) * i
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(width - padding, y)
    ctx.stroke()
  }

  // Function to draw bars
  const drawBars = (data: number[], color: string, alpha = 1) => {
    const barWidth = chartWidth / data.length

    for (const [i, datum] of data.entries()) {
      const barHeight = (datum / maxVal) * chartHeight
      const x = padding + i * barWidth
      const y = height - padding - barHeight

      // Create gradient
      const gradient = ctx.createLinearGradient(0, y, 0, height - padding)

      // Correctly handle color string conversion
      let topColor: string
      let bottomColor: string

      if (color.startsWith('rgba')) {
        // If it's already in rgba format, replace the last alpha value
        topColor = color.replace(/[\d.]+\)$/, `${alpha})`)
        bottomColor = color.replace(/[\d.]+\)$/, `${alpha * 0.1})`)
      } else if (color.startsWith('rgb')) {
        // If it's in rgb format, convert to rgba
        topColor = color.replace('rgb', 'rgba').replace(')', `, ${alpha})`)
        bottomColor = color
          .replace('rgb', 'rgba')
          .replace(')', `, ${alpha * 0.1})`)
      } else {
        // Use other formats directly
        topColor = color
        bottomColor = color
      }

      gradient.addColorStop(0, topColor)
      gradient.addColorStop(1, bottomColor)

      ctx.fillStyle = gradient
      ctx.fillRect(x, y, barWidth * 0.8, barHeight)
    }
  }

  // First draw the luminance channel as a background
  drawBars(histogram.luminance, colors.luminance, 0.3)

  // Set composite operation
  ctx.globalCompositeOperation = 'screen'

  // Draw RGB channels
  drawBars(histogram.red, colors.red, 0.7)
  drawBars(histogram.green, colors.green, 0.7)
  drawBars(histogram.blue, colors.blue, 0.7)

  // Reset composite operation
  ctx.globalCompositeOperation = 'source-over'

  // Draw border
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1
  ctx.strokeRect(padding - 0.5, padding - 0.5, chartWidth + 1, chartHeight + 1)

  // Add top highlight
  const highlightGradient = ctx.createLinearGradient(0, 0, 0, height * 0.2)
  highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)')
  highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = highlightGradient
  ctx.fillRect(0, 0, width, height * 0.2)
}

export const HistogramChart: FC<{
  thumbnailUrl: string
  className?: string
}> = ({ thumbnailUrl, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [histogram, setHistogram] = useState<CompressedHistogramData | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    setLoading(true)
    setError(false)
    setHistogram(null)

    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.src = thumbnailUrl

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        setError(true)
        setLoading(false)
        return
      }

      // For better performance, scale the image to an appropriate size
      const maxSize = 300
      const scale = Math.min(
        maxSize / img.naturalWidth,
        maxSize / img.naturalHeight,
      )
      const scaledWidth = Math.floor(img.naturalWidth * scale)
      const scaledHeight = Math.floor(img.naturalHeight * scale)

      canvas.width = scaledWidth
      canvas.height = scaledHeight
      ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight)

      try {
        const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight)
        const calculatedHistogram = calculateHistogram(imageData)
        setHistogram(calculatedHistogram)
      } catch (e) {
        console.error('Error calculating histogram:', e)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    img.onerror = () => {
      setError(true)
      setLoading(false)
    }
  }, [thumbnailUrl])

  useEffect(() => {
    if (histogram && canvasRef.current) {
      drawHistogram(canvasRef.current, histogram)
    }
  }, [histogram])

  return (
    <div className={cx('relative grow w-full h-32 group', className)}>
      {loading && (
        <div className="bg-material-ultra-thin absolute inset-0 flex items-center justify-center rounded-sm backdrop-blur-xl">
          <div className="i-mingcute-loading-3-line animate-spin text-xl" />
        </div>
      )}
      {error && (
        <div className="bg-material-ultra-thin absolute inset-0 flex items-center justify-center rounded-sm backdrop-blur-xl">
          <div className="text-center">
            <div className="text-text-secondary text-xs">
              {t('photo.error.loading')}
            </div>
          </div>
        </div>
      )}
      {histogram && (
        <canvas
          ref={canvasRef}
          className="bg-material-ultra-thin ring-fill-tertiary/20 group-hover:ring-fill-tertiary/40 h-full w-full rounded-sm ring-1 backdrop-blur-xl transition-all duration-200"
        />
      )}
    </div>
  )
}
