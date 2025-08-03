import { useEffect, useRef, useState } from 'react'

/**
 * Blob URL management utility
 * Used to safely manage URL.createObjectURL and URL.revokeObjectURL to prevent memory leaks
 */

export class BlobUrlManager {
  private urls = new Set<string>()

  /**
   * Create a blob URL and automatically track it
   */
  createUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob)
    this.urls.add(url)
    return url
  }

  /**
   * Manually release the specified URL
   */
  revokeUrl(url: string): void {
    if (this.urls.has(url)) {
      try {
        URL.revokeObjectURL(url)
        this.urls.delete(url)
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error)
      }
    }
  }

  /**
   * Release all tracked URLs
   */
  revokeAll(): void {
    for (const url of this.urls) {
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error)
      }
    }
    this.urls.clear()
  }

  /**
   * Get the number of currently tracked URLs
   */
  getCount(): number {
    return this.urls.size
  }
}

/**
 * React Hook: for safely managing blob URLs in components
 */
export function useBlobUrlManager() {
  const managerRef = useRef<BlobUrlManager | null>(null)

  if (!managerRef.current) {
    managerRef.current = new BlobUrlManager()
  }

  // Automatically clean up all URLs when the component is unmounted
  useEffect(() => {
    return () => {
      managerRef.current?.revokeAll()
    }
  }, [])

  return managerRef.current
}

/**
 * React Hook: for managing a single blob URL
 */
export function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      if (url) {
        URL.revokeObjectURL(url)
        setUrl(null)
      }
      return
    }

    const newUrl = URL.createObjectURL(blob)
    setUrl(newUrl)

    return () => {
      URL.revokeObjectURL(newUrl)
    }
  }, [blob])

  // Clean up the URL when the component is unmounted
  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [])

  return url
}
