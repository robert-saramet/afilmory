import { WebGLImageViewer } from '@afilmory/webgl-viewer'
import { AnimatePresence, m } from 'motion/react'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { useMediaQuery } from 'usehooks-ts'

import { useShowContextMenu } from '~/atoms/context-menu'
import { clsxm } from '~/lib/cn'
import { canUseWebGL } from '~/lib/feature'

import { SlidingNumber } from '../number/SlidingNumber'
import { DOMImageViewer } from './DOMImageViewer'
import { HDRBadge } from './HDRBadge'
import {
  createContextMenuItems,
  useImageLoader,
  useLivePhotoControls,
  useProgressiveImageState,
  useScaleIndicator,
  useWebGLLoadingState,
} from './hooks'
import { LivePhotoBadge } from './LivePhotoBadge'
import { LivePhotoVideo } from './LivePhotoVideo'
import type { ProgressiveImageProps, WebGLImageViewerRef } from './types'

export const ProgressiveImage = ({
  src,
  thumbnailSrc,
  alt,
  width,
  height,
  className,
  onError,
  onProgress,
  onZoomChange,
  onBlobSrcChange,
  maxZoom = 20,
  minZoom = 1,
  isCurrentImage = false,
  isLivePhoto = false,
  livePhotoVideoUrl,
  isHDR = false,
  loadingIndicatorRef,
}: ProgressiveImageProps) => {
  const { t } = useTranslation()

  // State management
  const [state, setState] = useProgressiveImageState()
  const {
    blobSrc,
    highResLoaded,
    error,
    isHighResImageRendered,
    currentScale,
    showScaleIndicator,
    isThumbnailLoaded,
    isLivePhotoPlaying,
  } = state

  // Refs
  const thumbnailRef = useRef<HTMLImageElement>(null)
  const webglImageViewerRef = useRef<WebGLImageViewerRef | null>(null)
  const domImageViewerRef = useRef<ReactZoomPanPinchRef>(null)
  const livePhotoRef = useRef<any>(null)

  // Hooks
  const imageLoaderManagerRef = useImageLoader(
    src,
    isCurrentImage,
    highResLoaded,
    error,
    onProgress,
    onError,
    onBlobSrcChange,
    loadingIndicatorRef,
    setState.setBlobSrc,
    setState.setHighResLoaded,
    setState.setError,
    setState.setIsHighResImageRendered,
  )

  const { onTransformed, onDOMTransformed } = useScaleIndicator(
    onZoomChange,
    setState.setCurrentScale,
    setState.setShowScaleIndicator,
  )

  const { handleLongPressStart, handleLongPressEnd } = useLivePhotoControls(
    isLivePhoto,
    isLivePhotoPlaying,
    livePhotoRef,
  )

  const handleWebGLLoadingStateChange =
    useWebGLLoadingState(loadingIndicatorRef)

  const handleThumbnailLoad = useCallback(() => {
    setState.setIsThumbnailLoaded(true)
  }, [setState])

  const showContextMenu = useShowContextMenu()

  const isHDRSupported = useMediaQuery('(dynamic-range: high)')
  // Only use HDR if the browser supports it and the image is HDR
  const shouldUseHDR = isHDR && isHDRSupported

  return (
    <div
      className={clsxm('relative overflow-hidden', className)}
      onMouseDown={handleLongPressStart}
      onMouseUp={handleLongPressEnd}
      onMouseLeave={handleLongPressEnd}
      onTouchStart={handleLongPressStart}
      onTouchEnd={handleLongPressEnd}
    >
      {/* Thumbnail - shown when high-res image is not loaded or has failed to load */}
      {thumbnailSrc && (!isHighResImageRendered || error) && (
        <img
          ref={thumbnailRef}
          src={thumbnailSrc}
          key={thumbnailSrc}
          alt={alt}
          className={clsxm(
            'absolute inset-0 h-full w-full object-contain transition-opacity duration-300',
            isThumbnailLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={handleThumbnailLoad}
        />
      )}

      {/* High-resolution image - only shown on successful load and non-error state */}
      {highResLoaded && blobSrc && isCurrentImage && !error && (
        <div
          className="absolute inset-0 h-full w-full"
          onContextMenu={(e) => {
            const items = createContextMenuItems(blobSrc, alt, t)
            showContextMenu(items, e)
          }}
        >
          {/* Use DOMImageViewer for LivePhoto or HDR mode */}
          {isLivePhoto || shouldUseHDR ? (
            <DOMImageViewer
              ref={domImageViewerRef}
              onZoomChange={onDOMTransformed}
              minZoom={minZoom}
              maxZoom={maxZoom}
              src={blobSrc}
              alt={alt}
              highResLoaded={highResLoaded}
              onLoad={() => setState.setIsHighResImageRendered(true)}
            >
              {/* LivePhoto video component as children, follows the image's transform */}
              {livePhotoVideoUrl && imageLoaderManagerRef.current && (
                <LivePhotoVideo
                  ref={livePhotoRef}
                  videoUrl={livePhotoVideoUrl}
                  imageLoaderManager={imageLoaderManagerRef.current}
                  loadingIndicatorRef={loadingIndicatorRef}
                  isCurrentImage={isCurrentImage}
                  onPlayingChange={setState.setIsLivePhotoPlaying}
                />
              )}
            </DOMImageViewer>
          ) : (
            /* Use WebGLImageViewer for non-LivePhoto mode */
            <WebGLImageViewer
              ref={webglImageViewerRef}
              src={blobSrc}
              className="absolute inset-0 h-full w-full"
              width={width}
              height={height}
              initialScale={1}
              minScale={minZoom}
              maxScale={maxZoom}
              limitToBounds={true}
              centerOnInit={true}
              smooth={true}
              onZoomChange={onTransformed}
              onLoadingStateChange={handleWebGLLoadingStateChange}
              debug={import.meta.env.DEV}
            />
          )}
        </div>
      )}

      {isLivePhoto && highResLoaded && blobSrc && isCurrentImage && !error && (
        <LivePhotoBadge
          livePhotoRef={livePhotoRef}
          isLivePhotoPlaying={isLivePhotoPlaying}
          imageLoaderManagerRef={imageLoaderManagerRef}
        />
      )}

      {shouldUseHDR && highResLoaded && blobSrc && isCurrentImage && !error && (
        <HDRBadge />
      )}

      {/* Fallback image (when WebGL is not available) - only shown in non-error state */}
      {!canUseWebGL && highResLoaded && blobSrc && !error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/20">
          <i className="i-mingcute-warning-line mb-2 text-4xl" />
          <span className="text-center text-sm text-white">
            {t('photo.webgl.unavailable')}
          </span>
        </div>
      )}

      {/* Action hint */}
      {!isLivePhoto && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white opacity-0 duration-200 group-hover:opacity-50">
          {t('photo.zoom.hint')}
        </div>
      )}

      {/* Zoom ratio indicator */}
      <AnimatePresence>
        {showScaleIndicator && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded bg-black/50 px-3 py-1 text-lg text-white tabular-nums"
          >
            <SlidingNumber number={currentScale} decimalPlaces={1} />x
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export type { ProgressiveImageProps } from './types'
