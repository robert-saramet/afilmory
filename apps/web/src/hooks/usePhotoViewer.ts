import { photoLoader } from '@afilmory/data'
import { atom, useAtom, useAtomValue } from 'jotai'
import { useCallback, useMemo } from 'react'

import { gallerySettingAtom } from '~/atoms/app'
import { jotaiStore } from '~/lib/jotai'
import { trackView } from '~/lib/tracker'

const openAtom = atom(false)
const currentIndexAtom = atom(0)
const triggerElementAtom = atom<HTMLElement | null>(null)
const data = photoLoader.getPhotos()

// Extract photo filtering and sorting logic into a separate function
const filterAndSortPhotos = (
  selectedTags: string[],
  sortOrder: 'asc' | 'desc',
) => {
  // First filter by tags (including display tags and equipment tags)
  let filteredPhotos = data
  if (selectedTags.length > 0) {
    filteredPhotos = data.filter((photo) =>
      selectedTags.some((tag) => {
        // Check display tags
        if (photo.tags.includes(tag)) return true
        // Check equipment tags
        if (photo.equipmentTags && photo.equipmentTags.includes(tag))
          return true
        return false
      }),
    )
  }

  // Then sort
  const sortedPhotos = filteredPhotos.toSorted((a, b) => {
    let aDateStr = ''
    let bDateStr = ''

    if (a.exif && a.exif.DateTimeOriginal) {
      aDateStr = a.exif.DateTimeOriginal as unknown as string
    } else {
      aDateStr = a.lastModified
    }

    if (b.exif && b.exif.DateTimeOriginal) {
      bDateStr = b.exif.DateTimeOriginal as unknown as string
    } else {
      bDateStr = b.lastModified
    }

    return sortOrder === 'asc'
      ? aDateStr.localeCompare(bDateStr)
      : bDateStr.localeCompare(aDateStr)
  })

  return sortedPhotos
}

// Provide a getter function for non-UI components to use
export const getFilteredPhotos = () => {
  // Read the current state directly from jotaiStore
  const currentGallerySetting = jotaiStore.get(gallerySettingAtom)
  return filterAndSortPhotos(
    currentGallerySetting.selectedTags,
    currentGallerySetting.sortOrder,
  )
}

export const usePhotos = () => {
  const { sortOrder, selectedTags } = useAtomValue(gallerySettingAtom)

  const masonryItems = useMemo(() => {
    return filterAndSortPhotos(selectedTags, sortOrder)
  }, [sortOrder, selectedTags])

  return masonryItems
}

export const usePhotoViewer = () => {
  const photos = usePhotos()
  const [isOpen, setIsOpen] = useAtom(openAtom)
  const [currentIndex, setCurrentIndex] = useAtom(currentIndexAtom)
  const [triggerElement, setTriggerElement] = useAtom(triggerElementAtom)

  const id = useMemo(() => {
    return photos[currentIndex].id
  }, [photos, currentIndex])
  const openViewer = useCallback(
    (index: number, element?: HTMLElement) => {
      setCurrentIndex(index)
      setTriggerElement(element || null)
      setIsOpen(true)
      // Prevent background scrolling
      document.body.style.overflow = 'hidden'

      trackView(id)
    },
    [id, setCurrentIndex, setIsOpen, setTriggerElement],
  )

  const closeViewer = useCallback(() => {
    setIsOpen(false)
    setTriggerElement(null)
    // Restore background scrolling
    document.body.style.overflow = ''
  }, [setIsOpen, setTriggerElement])

  const goToIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < photos.length) {
        setCurrentIndex(index)
        trackView(photos[index].id)
      }
    },
    [photos, setCurrentIndex],
  )

  return {
    isOpen,
    currentIndex,
    triggerElement,
    openViewer,
    closeViewer,

    goToIndex,
  }
}
