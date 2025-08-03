import { m } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { LazyImage } from '~/components/ui/lazy-image'
import { Spring } from '~/lib/spring'
import type { PhotoMarker } from '~/types/map'

interface ClusterPhotoGridProps {
  photos: PhotoMarker[]
  onPhotoClick?: (photo: PhotoMarker) => void
}

export const ClusterPhotoGrid = ({
  photos,
  onPhotoClick,
}: ClusterPhotoGridProps) => {
  // Show up to 6 photos
  const displayPhotos = photos.slice(0, 6)
  const remainingCount = Math.max(0, photos.length - 6)
  const { i18n, t } = useTranslation()

  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h3 className="text-text text-sm font-semibold">
          {t('gallery.photos_other', { count: photos.length })}
        </h3>
        <div className="text-text-secondary text-xs">
          {t('cluster.viewDetails')}
        </div>
      </div>

      {/* Photo grid */}
      <div className="grid grid-cols-3 gap-2">
        {displayPhotos.map((photoMarker, index) => (
          <m.div
            key={photoMarker.photo.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              ...Spring.presets.smooth,
              delay: index * 0.05,
            }}
            className="group relative aspect-square overflow-hidden rounded-lg"
          >
            <Link
              to={`/${photoMarker.photo.id}`}
              target="_blank"
              onClick={(e) => {
                e.stopPropagation()
                onPhotoClick?.(photoMarker)
              }}
              className="block h-full w-full"
            >
              <LazyImage
                src={
                  photoMarker.photo.thumbnailUrl ||
                  photoMarker.photo.originalUrl
                }
                alt={photoMarker.photo.title || photoMarker.photo.id}
                thumbHash={photoMarker.photo.thumbHash}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                rootMargin="200px"
                threshold={0.1}
              />

              {/* Hover mask */}
              <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />

              {/* Hover icon */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div className="rounded-full bg-black/50 p-2 backdrop-blur-sm">
                  <svg
                    className="h-4 w-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          </m.div>
        ))}

        {/* "More photos" indicator */}
        {remainingCount > 0 && (
          <m.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              ...Spring.presets.smooth,
              delay: displayPhotos.length * 0.05,
            }}
            className="bg-fill-secondary flex aspect-square items-center justify-center rounded-lg"
          >
            <div className="text-center">
              <div className="text-text text-lg font-bold">
                +{remainingCount}
              </div>
              <div className="text-text-secondary text-xs">
                {t('cluster.more')}
              </div>
            </div>
          </m.div>
        )}
      </div>

      {/* Location information */}
      {photos[0] && (
        <div className="border-border space-y-2 border-t pt-3">
          <div className="text-text-secondary flex items-center gap-2 text-xs">
            <i className="i-mingcute-location-line text-sm" />
            <span className="font-mono">
              {Math.abs(photos[0].latitude).toFixed(4)}°
              {photos[0].latitudeRef || 'N'},{' '}
              {Math.abs(photos[0].longitude).toFixed(4)}°
              {photos[0].longitudeRef || 'E'}
            </span>
          </div>

          {/* Shooting time range */}
          {(() => {
            const dates = photos
              .map((p) => p.photo.exif?.DateTimeOriginal)
              .filter(Boolean)
              .map((d) => new Date(d!))
              .sort((a, b) => a.getTime() - b.getTime())

            if (dates.length === 0) return null

            const earliest = dates[0]
            const latest = dates.at(-1)
            const isSameDay = earliest.toDateString() === latest?.toDateString()

            return (
              <div className="text-text-secondary flex items-center gap-2 text-xs">
                <i className="i-mingcute-calendar-line text-sm" />
                <span>
                  {isSameDay
                    ? earliest.toLocaleDateString(i18n.language, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : `${earliest.toLocaleDateString(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })} - ${latest?.toLocaleDateString(i18n.language, {
                        month: 'short',
                        day: 'numeric',
                      })}`}
                </span>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
