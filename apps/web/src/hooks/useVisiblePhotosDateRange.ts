import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { PhotoManifest } from '~/types/photo'

interface DateRange {
  startDate: Date | null
  endDate: Date | null
  formattedRange: string
  location?: string
}

interface VisibleRange {
  start: number
  end: number
}

/**
 * Hook to calculate the date range of currently visible photos in the viewport
 * Works with masonry onRender callback
 */
export const useVisiblePhotosDateRange = (_photos: PhotoManifest[]) => {
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: null,
    endDate: null,
    formattedRange: '',
    location: undefined,
  })

  const currentRange = useRef<VisibleRange>({ start: 0, end: 0 })

  const getPhotoDate = useCallback((photo: PhotoManifest): Date => {
    // Prioritize using the shooting time from EXIF
    if (photo.exif?.DateTimeOriginal) {
      const dateStr = photo.exif.DateTimeOriginal as unknown as string
      // EXIF date format is usually "YYYY:MM:DD HH:mm:ss"
      const formattedDateStr = dateStr.replace(
        /^(\d{4}):(\d{2}):(\d{2})/,
        '$1-$2-$3',
      )
      const date = new Date(formattedDateStr)
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }

    // Fallback to lastModified
    return new Date(photo.lastModified)
  }, [])
  const { i18n } = useTranslation()

  const formatDateRange = useCallback(
    (startDate: Date, endDate: Date): string => {
      const startYear = startDate.getFullYear()
      const endYear = endDate.getFullYear()
      const startMonth = startDate.getMonth()
      const endMonth = endDate.getMonth()

      // If it's the same day
      if (startDate.toDateString() === endDate.toDateString()) {
        return startDate.toLocaleDateString(i18n.language, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      }

      // Same year
      if (startYear === endYear) {
        // Same month
        if (startMonth === endMonth) {
          return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.getDate()}, ${startYear}`
        } else {
          return `${startDate.toLocaleDateString('en-US', { month: 'short' })} - ${endDate.toLocaleDateString('en-US', { month: 'short' })}, ${startYear}`
        }
      }

      // Different years
      return `${startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    },
    [i18n.language],
  )

  const extractLocation = useCallback(
    (photos: PhotoManifest[]): string | undefined => {
      // Try to extract location information from photo tags
      for (const photo of photos) {
        // If the photo has a location tag, prioritize it
        // TODO: This location detection logic is based on Chinese keywords.
        // It should be refactored to use a more robust, locale-aware solution.
        if (photo.tags) {
          const locationTag = photo.tags.find(
            (tag) =>
              tag.includes('省') ||
              tag.includes('市') ||
              tag.includes('区') ||
              tag.includes('县') ||
              tag.includes('镇') ||
              tag.includes('村') ||
              tag.includes('街道') ||
              tag.includes('路') ||
              tag.includes('北京') ||
              tag.includes('上海') ||
              tag.includes('广州') ||
              tag.includes('深圳') ||
              tag.includes('杭州') ||
              tag.includes('南京') ||
              tag.includes('成都'),
          )
          if (locationTag) {
            return locationTag
          }
        }
      }

      return undefined
    },
    [],
  )

  // Calculate the date range of photos currently visible in the viewport
  const calculateDateRange = useCallback(
    (startIndex: number, endIndex: number, items: any[]) => {
      if (!items || items.length === 0) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: '',
          location: undefined,
        })
        return
      }

      // Filter out items of type photo (excluding headers, etc.)
      const visiblePhotos = items
        .slice(startIndex, endIndex + 1)
        .filter(
          (item): item is PhotoManifest =>
            item && typeof item === 'object' && 'id' in item,
        )

      if (visiblePhotos.length === 0) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: '',
          location: undefined,
        })
        return
      }

      // Calculate date range
      const dates = visiblePhotos
        .map((photo) => getPhotoDate(photo))
        .sort((a, b) => a.getTime() - b.getTime())

      const startDate = dates[0]
      const endDate = dates.at(-1)

      if (!startDate || !endDate) {
        setDateRange({
          startDate: null,
          endDate: null,
          formattedRange: '',
          location: undefined,
        })
        return
      }

      const formattedRange = formatDateRange(startDate, endDate)
      const location = extractLocation(visiblePhotos)

      setDateRange({
        startDate,
        endDate,
        formattedRange,
        location,
      })

      // Update current range
      currentRange.current = { start: startIndex, end: endIndex }
    },
    [getPhotoDate, formatDateRange],
  )

  // Used for the onRender callback passed to masonry
  const handleRender = useCallback(
    (startIndex: number, stopIndex: number, items: any[]) => {
      calculateDateRange(startIndex, stopIndex, items)
    },
    [calculateDateRange],
  )

  return {
    dateRange,
    handleRender,
    currentRange: currentRange.current,
  }
}
