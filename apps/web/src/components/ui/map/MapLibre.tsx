// Styles
import 'maplibre-gl/dist/maplibre-gl.css'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Map from 'react-map-gl/maplibre'

import { getMapStyle } from '~/lib/map/style'
import { calculateMapBounds } from '~/lib/map-utils'
import type { PhotoMarker } from '~/types/map'

import {
  ClusterMarker,
  clusterMarkers,
  DEFAULT_MARKERS,
  DEFAULT_STYLE,
  DEFAULT_VIEW_STATE,
  GeoJsonLayer,
  MapControls,
  PhotoMarkerPin,
} from './shared'

export interface PureMaplibreProps {
  id?: string
  initialViewState?: {
    longitude: number
    latitude: number
    zoom: number
  }
  markers?: PhotoMarker[]
  selectedMarkerId?: string | null
  geoJsonData?: GeoJSON.FeatureCollection
  onMarkerClick?: (marker: PhotoMarker) => void
  onGeoJsonClick?: (event: any) => void
  onGeolocate?: (longitude: number, latitude: number) => void
  onClusterClick?: (longitude: number, latitude: number) => void
  className?: string
  style?: React.CSSProperties
  mapRef?: React.RefObject<any>
  autoFitBounds?: boolean
}

export const Maplibre = ({
  id,
  initialViewState = DEFAULT_VIEW_STATE,
  markers = DEFAULT_MARKERS,
  selectedMarkerId,
  geoJsonData,
  onMarkerClick,
  onGeoJsonClick,
  onGeolocate,
  onClusterClick,
  className = 'w-full h-full',
  style = DEFAULT_STYLE,
  mapRef,
  autoFitBounds = true,
}: PureMaplibreProps) => {
  const [currentZoom, setCurrentZoom] = useState(initialViewState.zoom)
  const [viewState, setViewState] = useState(initialViewState)
  const [isMapLoaded, setIsMapLoaded] = useState(false)
  const [hasInitialFitCompleted, setHasInitialFitCompleted] = useState(false)

  // Handle marker click - only call the external callback
  const handleMarkerClick = useCallback(
    (marker: PhotoMarker) => {
      onMarkerClick?.(marker)
    },
    [onMarkerClick],
  )

  // Handle marker close - call onMarkerClick with the currently selected marker to toggle it off
  const handleMarkerClose = useCallback(() => {
    if (selectedMarkerId && onMarkerClick) {
      // Find the currently selected marker and call onMarkerClick to deselect it
      const selectedMarker = markers.find(
        (marker) => marker.id === selectedMarkerId,
      )
      if (selectedMarker) {
        onMarkerClick(selectedMarker)
      }
    }
  }, [selectedMarkerId, onMarkerClick, markers])

  // Clustered markers
  const clusteredMarkers = useMemo(
    () => clusterMarkers(markers, currentZoom),
    [markers, currentZoom],
  )

  // Calculate the appropriate zoom level
  const calculateZoomLevel = useCallback((latDiff: number, lngDiff: number) => {
    const maxDiff = Math.max(latDiff, lngDiff)

    if (maxDiff < 0.001) return 16 // Very close points
    if (maxDiff < 0.01) return 14 // Close points
    if (maxDiff < 0.1) return 11 // Nearby points
    if (maxDiff < 1) return 8 // Same city
    if (maxDiff < 10) return 5 // Same country/region
    return 2 // Intercontinental
  }, [])

  // Auto-fit to the area containing all photos - only on initial load
  const fitMapToBounds = useCallback(() => {
    if (
      !autoFitBounds ||
      markers.length === 0 ||
      !isMapLoaded ||
      hasInitialFitCompleted
    )
      return

    const bounds = calculateMapBounds(markers)
    if (!bounds) return

    // Mark initial fit as complete
    setHasInitialFitCompleted(true)

    // If there is only one point, set a default zoom level
    if (markers.length === 1) {
      const newViewState = {
        longitude: markers[0].longitude,
        latitude: markers[0].latitude,
        zoom: 13, // Reasonable zoom level for a single point
      }
      setViewState(newViewState)
      setCurrentZoom(newViewState.zoom)
      return
    }

    // Use the fitBounds method of mapRef (recommended)
    if (mapRef?.current?.getMap) {
      // Calculate dynamic padding to ensure the photo area is within 80% of the window
      // This means leaving a 10% buffer on each side
      const mapContainer = mapRef.current.getContainer()
      const containerWidth = mapContainer.offsetWidth
      const containerHeight = mapContainer.offsetHeight

      const paddingPercentage = 0.1 // 10% padding on each side
      const horizontalPadding = containerWidth * paddingPercentage
      const verticalPadding = containerHeight * paddingPercentage

      const padding = {
        top: Math.max(verticalPadding, 40), // Minimum 40px
        bottom: Math.max(verticalPadding, 40),
        left: Math.max(horizontalPadding, 40),
        right: Math.max(horizontalPadding, 40),
      }

      try {
        const map = mapRef.current.getMap()
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat], // Southwest corner
            [bounds.maxLng, bounds.maxLat], // Northeast corner
          ],
          {
            padding,
            duration: 800, // Smooth animation
            maxZoom: 15, // Max zoom level limit to avoid over-zooming
          },
        )
      } catch (error) {
        console.warn('fitBounds failed, using fallback:', error)
        // Fallback: manually calculate view state
        fallbackToViewState(bounds)
      }
    } else {
      // Fallback for when mapRef is not available
      fallbackToViewState(bounds)
    }

    function fallbackToViewState(
      bounds: ReturnType<typeof calculateMapBounds>,
    ) {
      if (!bounds) return

      const latDiff = bounds.maxLat - bounds.minLat
      const lngDiff = bounds.maxLng - bounds.minLng
      // Also add some buffer for the fallback, reduce zoom by one level
      const zoom = Math.max(calculateZoomLevel(latDiff, lngDiff) - 1, 2)

      const newViewState = {
        longitude: bounds.centerLng,
        latitude: bounds.centerLat,
        zoom,
      }

      setViewState(newViewState)
      setCurrentZoom(zoom)
    }
  }, [
    markers,
    autoFitBounds,
    isMapLoaded,
    mapRef,
    calculateZoomLevel,
    hasInitialFitCompleted,
  ])

  // Trigger fit when map is loaded
  const handleMapLoad = useCallback(() => {
    setIsMapLoaded(true)
  }, [])

  // Re-fit bounds when markers change
  useEffect(() => {
    // Delay execution to ensure the map has rendered
    const timer = setTimeout(() => {
      fitMapToBounds()
    }, 100)

    return () => clearTimeout(timer)
  }, [fitMapToBounds])

  return (
    <div className={className} style={style}>
      <Map
        id={id}
        ref={mapRef}
        {...viewState}
        style={{ width: '100%', height: '100%' }}
        mapStyle={getMapStyle()}
        attributionControl={false}
        interactiveLayerIds={geoJsonData ? ['data'] : undefined}
        onClick={onGeoJsonClick}
        onLoad={handleMapLoad}
        onMove={(evt) => {
          setCurrentZoom(evt.viewState.zoom)
          setViewState(evt.viewState)
        }}
      >
        {/* Map Controls */}
        <MapControls onGeolocate={onGeolocate} />

        {/* Photo Markers */}
        {clusteredMarkers.map((clusterPoint) => {
          if (clusterPoint.properties.cluster) {
            // Render cluster marker
            return (
              <ClusterMarker
                key={`cluster-${clusterPoint.geometry.coordinates[0]}-${clusterPoint.geometry.coordinates[1]}`}
                longitude={clusterPoint.geometry.coordinates[0]}
                latitude={clusterPoint.geometry.coordinates[1]}
                pointCount={clusterPoint.properties.point_count || 0}
                representativeMarker={clusterPoint.properties.marker}
                clusteredPhotos={clusterPoint.properties.clusteredPhotos}
                onClusterClick={onClusterClick}
              />
            )
          } else {
            // Render individual marker
            const { marker } = clusterPoint.properties
            if (!marker) return null

            return (
              <PhotoMarkerPin
                key={marker.id}
                marker={marker}
                isSelected={selectedMarkerId === marker.id}
                onClick={handleMarkerClick}
                onClose={handleMarkerClose}
              />
            )
          }
        })}

        {/* GeoJSON Layer */}
        {geoJsonData && <GeoJsonLayer data={geoJsonData} />}
      </Map>
    </div>
  )
}
