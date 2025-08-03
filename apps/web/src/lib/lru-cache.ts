/**
 * Generic LRU cache class
 * Supports custom cleanup functions to be executed when a cache item is removed (e.g., releasing a blob URL)
 */
/**
 * React Hook for managing the lifecycle of an LRU cache
 */
import { useEffect, useRef } from 'react'

export class LRUCache<K, V> {
  private maxSize: number
  private cache: Map<K, V>
  private cleanupFn?: (value: V, key: K, reason: string) => void

  constructor(
    maxSize = 10,
    cleanupFn?: (value: V, key: K, reason: string) => void,
  ) {
    this.maxSize = maxSize
    this.cache = new Map()
    this.cleanupFn = cleanupFn
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
      return value
    }
    return undefined
  }

  set(key: K, value: V): void {
    // If key already exists, clean up old value and delete it first
    if (this.cache.has(key)) {
      const oldValue = this.cache.get(key)!
      this._cleanup(
        oldValue,
        key,
        `Replacing existing cache entry for ${String(key)}`,
      )
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        const firstValue = this.cache.get(firstKey)!
        this._cleanup(firstValue, firstKey, `LRU eviction: ${String(firstKey)}`)
        this.cache.delete(firstKey)
      }
    }

    // Add new item (most recently used)
    this.cache.set(key, value)

    console.info(
      `LRU Cache: Added ${String(key)}, cache size: ${this.cache.size}/${this.maxSize}`,
    )
  }

  /**
   * Remove a specific cache entry and clean up its value
   */
  delete(key: K): boolean {
    const value = this.cache.get(key)
    if (value !== undefined) {
      this._cleanup(value, key, `Manual deletion: ${String(key)}`)
      return this.cache.delete(key)
    }
    return false
  }

  has(key: K): boolean {
    return this.cache.has(key)
  }

  clear(): void {
    // Clean up all cached values
    let cleanedCount = 0
    for (const [key, value] of this.cache.entries()) {
      this._cleanup(value, key, `Cache clear: ${String(key)}`)
      cleanedCount++
    }
    this.cache.clear()
    console.info(`LRU Cache: Cleared ${cleanedCount} cached items`)
  }

  size(): number {
    return this.cache.size
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { size: number; maxSize: number; keys: K[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    }
  }

  /**
   * Get all values (for iteration or debugging)
   */
  values(): IterableIterator<V> {
    return this.cache.values()
  }

  /**
   * Get all entries (for iteration or debugging)
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries()
  }

  /**
   * Private method to safely execute cleanup function
   */
  private _cleanup(value: V, key: K, reason: string): void {
    if (this.cleanupFn) {
      try {
        this.cleanupFn(value, key, reason)
      } catch (error) {
        console.warn(`LRU Cache cleanup failed (${reason}):`, error)
      }
    }
  }
}

/**
 * Create an LRU cache specifically for blob URLs
 * Automatically calls URL.revokeObjectURL when an item is removed
 */
export function createBlobUrlCache<T extends { url?: string }>(
  maxSize = 10,
): LRUCache<string, T> {
  return new LRUCache<string, T>(maxSize, (value, key, reason) => {
    if (value.url) {
      try {
        URL.revokeObjectURL(value.url)
        console.info(`Blob URL revoked - ${reason}`)
      } catch (error) {
        console.warn(`Failed to revoke blob URL (${reason}):`, error)
      }
    }
  })
}

export function useLRUCache<K, V>(
  maxSize = 10,
  cleanupFn?: (value: V, key: K, reason: string) => void,
): LRUCache<K, V> {
  const cacheRef = useRef<LRUCache<K, V> | null>(null)

  if (!cacheRef.current) {
    cacheRef.current = new LRUCache(maxSize, cleanupFn)
  }

  // Automatically clear all caches when the component is unmounted
  useEffect(() => {
    return () => {
      cacheRef.current?.clear()
    }
  }, [])

  return cacheRef.current
}
