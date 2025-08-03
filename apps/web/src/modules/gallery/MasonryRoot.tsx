import { useAtomValue } from 'jotai'
import { AnimatePresence, m } from 'motion/react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { DateRangeIndicator } from '~/components/ui/date-range-indicator'
import { useScrollViewElement } from '~/components/ui/scroll-areas/hooks'
import { useMobile } from '~/hooks/useMobile'
import { usePhotos, usePhotoViewer } from '~/hooks/usePhotoViewer'
import { useTypeScriptHappyCallback } from '~/hooks/useTypeScriptCallback'
import { useVisiblePhotosDateRange } from '~/hooks/useVisiblePhotosDateRange'
import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'
import type { PhotoManifest } from '~/types/photo'

import type { ActionType } from './ActionGroup'
import { ActionGroup, ActionPanel } from './ActionGroup'
import { FloatingActionButton } from './FloatingActionButton'
import type { MasonryRef } from './Masonic'
import { Masonry } from './Masonic'
// import { MasonryHeaderMasonryItem } from './MasonryHeaderMasonryItem' // Removed header box
import { MasonryPhotoItem } from './MasonryPhotoItem'

// class MasonryHeaderItem {
//   static default = new MasonryHeaderItem()
// }

type MasonryItemType = PhotoManifest // | MasonryHeaderItem

const FIRST_SCREEN_ITEMS_COUNT = 30

const COLUMN_WIDTH_CONFIG = {
  auto: {
    mobile: 150,
    desktop: 250,
    maxColumns: 8,
  },
  min: {
    mobile: 120,
    desktop: 200,
  },
  max: {
    mobile: 250,
    desktop: 500,
  },
}

export const MasonryRoot = () => {
  const { columns } = useAtomValue(gallerySettingAtom)
  const hasAnimatedRef = useRef(false)
  const [showFloatingActions, setShowFloatingActions] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)

  const photos = usePhotos()
  const masonryRef = useRef<MasonryRef>(null)
  // useEffect(() => {
  //   nextFrame(() => masonryRef.current?.reposition())
  // }, [photos])
  const { dateRange, handleRender } = useVisiblePhotosDateRange(photos)
  const scrollElement = useScrollViewElement()

  const photoViewer = usePhotoViewer()
  const handleAnimationComplete = useCallback(() => {
    hasAnimatedRef.current = true
  }, [])
  const isMobile = useMobile()

  const [activePanel, setActivePanel] = useState<ActionType | null>(null)
  const handleActionClick = (action: ActionType) => {
    setActivePanel(action)
  }

  // Listen for container width changes
  useEffect(() => {
    const updateContainerWidth = () => {
      setContainerWidth(window.innerWidth)
    }

    updateContainerWidth()
    window.addEventListener('resize', updateContainerWidth)

    return () => {
      window.removeEventListener('resize', updateContainerWidth)
    }
  }, [])

  // Dynamically calculate column width
  const columnWidth = useMemo(() => {
    const { auto, min, max } = COLUMN_WIDTH_CONFIG
    const gutter = 4 // Column gutter
    const availableWidth = containerWidth - (isMobile ? 8 : 32) // Different padding for mobile and desktop

    if (columns === 'auto') {
      const autoWidth = isMobile ? auto.mobile : auto.desktop
      if (!isMobile) {
        const { maxColumns } = auto
        // When the screen width exceeds a certain threshold, limit the maximum number of columns by calculating the dynamic column width
        const colCount = Math.floor(
          (availableWidth + gutter) / (autoWidth + gutter),
        )

        if (colCount > maxColumns) {
          return (availableWidth - (maxColumns - 1) * gutter) / maxColumns
        }
      }

      return autoWidth
    }

    // Custom column count mode: calculate column width based on container width and column count
    const calculatedWidth = (availableWidth - (columns - 1) * gutter) / columns

    // Set min and max column width based on device type
    const minWidth = isMobile ? min.mobile : min.desktop
    const maxWidth = isMobile ? max.mobile : max.desktop

    return Math.max(Math.min(calculatedWidth, maxWidth), minWidth)
  }, [isMobile, columns, containerWidth])

  // Listen for scroll to control the visibility of floating components
  useEffect(() => {
    if (!scrollElement) return

    const handleScroll = () => {
      const { scrollTop } = scrollElement
      setShowFloatingActions(scrollTop > 500)
    }

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [scrollElement])

  return (
    <>
      {/* Desktop: distributed left and right */}
      {!isMobile && (
        <>
          <DateRangeIndicator
            dateRange={dateRange.formattedRange}
            location={dateRange.location}
            isVisible={showFloatingActions && !!dateRange.formattedRange}
          />
          <FloatingActionBar showFloatingActions={showFloatingActions} />
        </>
      )}

      {/* Mobile: stacked vertically */}
      {isMobile && !!dateRange.formattedRange && (
        <div className="fixed top-0 right-0 left-0 z-50">
          <DateRangeIndicator
            dateRange={dateRange.formattedRange}
            location={dateRange.location}
            isVisible={showFloatingActions && !!dateRange.formattedRange}
            className="relative top-0 left-0"
          />
        </div>
      )}

      {isMobile && (
        <FloatingActionButton
          isVisible={showFloatingActions}
          onActionClick={handleActionClick}
        />
      )}

      <div className="p-1 lg:px-0 lg:pb-0 [&_*]:!select-none">
        {/* Simple Header */}
        <header className="py-8 text-center lg:py-12">
          <h1 className="text-2xl font-normal text-gray-700 lg:text-3xl dark:text-gray-300">
            Photography by Robert Saramet
          </h1>
        </header>

        <Masonry<MasonryItemType>
          ref={masonryRef}
          items={useMemo(() => photos, [photos])}
          render={useCallback(
            (props) => (
              <MasonryItem
                {...props}
                onPhotoClick={photoViewer.openViewer}
                photos={photos}
                hasAnimated={hasAnimatedRef.current}
                onAnimationComplete={handleAnimationComplete}
              />
            ),
            [handleAnimationComplete, photoViewer.openViewer, photos],
          )}
          onRender={handleRender}
          columnWidth={columnWidth}
          columnGutter={4}
          rowGutter={4}
          itemHeightEstimate={400}
          itemKey={useTypeScriptHappyCallback((data, _index) => {
            return (data as PhotoManifest).id
          }, [])}
        />

        {/* Footer */}
        <footer className="mt-12 mb-8 text-center">
          <div className="mx-auto max-w-md space-y-2 px-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Photography by <strong>Robert Saramet</strong>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Powered by{' '}
              <a
                href="https://github.com/Afilmory/Afilmory"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Afilmory
              </a>{' '}
              - An incredible photo gallery by{' '}
              <a
                href="https://innei.in"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 transition-colors hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Innei
              </a>
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-600">
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'} • Built{' '}
              {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </div>

      <ActionPanel
        open={!!activePanel}
        onOpenChange={(open) => {
          if (!open) {
            setActivePanel(null)
          }
        }}
        type={activePanel}
      />
    </>
  )
}

export const MasonryItem = memo(
  ({
    data,
    width,
    index,
    onPhotoClick,
    photos,
    hasAnimated,
    onAnimationComplete,
  }: {
    data: MasonryItemType
    width: number
    index: number
    onPhotoClick: (index: number, element?: HTMLElement) => void
    photos: PhotoManifest[]
    hasAnimated: boolean
    onAnimationComplete: () => void
  }) => {
    // Generate a unique key for each item for tracking
    const itemKey = useMemo(() => {
      return (data as PhotoManifest).id
    }, [data])

    // Only animate items on the first screen, and only on the first load
    const shouldAnimate = !hasAnimated && index < FIRST_SCREEN_ITEMS_COUNT

    // Calculate animation delay
    const delay = shouldAnimate ? Math.min(index * 0.05, 0.3) : 0

    // Framer Motion animation variants
    const itemVariants = {
      hidden: {
        opacity: 0,
        y: 30,
        scale: 0.95,
        filter: 'blur(4px)',
      },
      visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: {
          ...Spring.presets.smooth,
          delay,
        },
      },
    }

    return (
      <m.div
        key={itemKey}
        variants={shouldAnimate ? itemVariants : undefined}
        initial={shouldAnimate ? 'hidden' : 'visible'}
        animate="visible"
        onAnimationComplete={shouldAnimate ? onAnimationComplete : undefined}
      >
        <MasonryPhotoItem
          data={data as PhotoManifest}
          width={width}
          index={index}
          onPhotoClick={onPhotoClick}
          photos={photos}
        />
      </m.div>
    )
  },
)

const FloatingActionBar = ({
  showFloatingActions,
}: {
  showFloatingActions: boolean
}) => {
  const isMobile = useMobile()

  const variants = isMobile
    ? {
        initial: {
          opacity: 0,
        },
        animate: { opacity: 1 },
      }
    : {
        initial: {
          opacity: 0,
          x: 20,
          y: 0,
          scale: 0.95,
        },
        animate: { opacity: 1, x: 0, y: 0, scale: 1 },
      }
  return (
    <AnimatePresence>
      {showFloatingActions && (
        <m.div
          variants={variants}
          initial="initial"
          animate="animate"
          exit="initial"
          transition={Spring.presets.snappy}
          className={clsxm(
            'border-material-opaque rounded-xl border bg-black/60 p-3 shadow-2xl backdrop-blur-[70px]',
            isMobile
              ? 'rounded-t-none rounded-br-none -translate-y-px'
              : 'fixed top-4 right-4 z-50 lg:top-6 lg:right-6',
          )}
        >
          <ActionGroup />
        </m.div>
      )}
    </AnimatePresence>
  )
}
