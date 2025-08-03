import path from 'node:path'

import type { BuilderConfig } from '@builder'
import { builderConfig } from '@builder'

import { thumbnailExists } from '../image/thumbnail.js'
import { logger } from '../logger/index.js'
import {
  handleDeletedPhotos,
  loadExistingManifest,
  needsUpdate,
  saveManifest,
} from '../manifest/manager.js'
import type { PhotoProcessorOptions } from '../photo/processor.js'
import { processPhoto } from '../photo/processor.js'
import { StorageManager } from '../storage/index.js'
import type { AfilmoryManifest } from '../types/manifest.js'
import type { PhotoManifestItem, ProcessPhotoResult } from '../types/photo.js'
import { ClusterPool } from '../worker/cluster-pool.js'
import { WorkerPool } from '../worker/pool.js'

export interface BuilderOptions {
  isForceMode: boolean
  isForceManifest: boolean
  isForceThumbnails: boolean
  concurrencyLimit?: number // Optional, if not provided, the default value in the configuration file will be used
}

export interface BuilderResult {
  hasUpdates: boolean
  newCount: number
  processedCount: number
  skippedCount: number
  deletedCount: number
  totalPhotos: number
}

class PhotoGalleryBuilder {
  private storageManager: StorageManager
  private config: BuilderConfig

  constructor(config?: Partial<BuilderConfig>) {
    // Merge user configuration and default configuration
    this.config = this.mergeConfig(builderConfig, config)

    // Create storage manager
    this.storageManager = new StorageManager(this.config.storage)

    // Configure log level
    this.configureLogging()
  }

  private mergeConfig(
    baseConfig: BuilderConfig,
    userConfig?: Partial<BuilderConfig>,
  ): BuilderConfig {
    if (!userConfig) return baseConfig

    return {
      repo: { ...baseConfig.repo, ...userConfig.repo },
      storage: { ...baseConfig.storage, ...userConfig.storage },
      options: { ...baseConfig.options, ...userConfig.options },
      logging: { ...baseConfig.logging, ...userConfig.logging },
      performance: {
        ...baseConfig.performance,
        ...userConfig.performance,
        worker: {
          ...baseConfig.performance.worker,
          ...userConfig.performance?.worker,
        },
      },
    }
  }

  private configureLogging(): void {
    // Log settings can be adjusted here according to the configuration
    // Currently, log configuration is handled in the logger module
  }

  async buildManifest(options: BuilderOptions): Promise<BuilderResult> {
    try {
      return await this.#buildManifest(options)
    } catch (error) {
      logger.main.error('❌ Failed to build manifest:', error)
      throw error
    }
  }
  /**
   * Build photo manifest
   * @param options build options
   */
  async #buildManifest(options: BuilderOptions): Promise<BuilderResult> {
    const startTime = Date.now()

    this.logBuildStart()

    // Read the existing manifest (if it exists)
    const existingManifestItems = await this.loadExistingManifest(options).then(
      (manifest) => manifest.data,
    )
    const existingManifestMap = new Map(
      existingManifestItems.map((item) => [item.s3Key, item]),
    )

    logger.main.info(
      `Existing manifest contains ${existingManifestItems.length} photos`,
    )

    // List all files in storage
    const allObjects = await this.storageManager.listAllFiles()
    logger.main.info(`Found ${allObjects.length} files in storage`)

    // Detect Live Photo pairs (if enabled)
    const livePhotoMap = await this.detectLivePhotos(allObjects)
    if (this.config.options.enableLivePhotoDetection) {
      logger.main.info(`Detected ${livePhotoMap.size} Live Photos`)
    }

    // List all image files in storage
    const imageObjects = await this.storageManager.listImages()
    logger.main.info(`Found ${imageObjects.length} photos in storage`)

    // Create a set of existing image keys in storage to detect deleted images
    const s3ImageKeys = new Set(imageObjects.map((obj) => obj.key))

    const manifest: PhotoManifestItem[] = []
    let processedCount = 0
    let skippedCount = 0
    let newCount = 0
    let deletedCount = 0

    if (imageObjects.length === 0) {
      logger.main.error('❌ 没有找到需要处理的照片')
      return {
        hasUpdates: false,
        newCount: 0,
        processedCount: 0,
        skippedCount: 0,
        deletedCount: 0,
        totalPhotos: 0,
      }
    }

    // Filter out the images that actually need to be processed
    const tasksToProcess = await this.filterTaskImages(
      imageObjects,
      existingManifestMap,
      options,
    )

    logger.main.info(
      `Found ${imageObjects.length} photos in storage, ${tasksToProcess.length} tasks to process`,
    )

    // If there are no tasks to process, use the existing manifest directly
    if (tasksToProcess.length === 0) {
      logger.main.info('💡 No photos to process, using existing manifest')
      manifest.push(
        ...existingManifestItems.filter((item) => s3ImageKeys.has(item.s3Key)),
      )
    } else {
      // Get concurrency limit
      const concurrency =
        options.concurrencyLimit ?? this.config.options.defaultConcurrency

      // Select the processing mode according to the configuration and the actual number of tasks
      const { useClusterMode } = this.config.performance.worker

      // If the actual number of tasks is small, do not use cluster mode
      const shouldUseCluster =
        useClusterMode && tasksToProcess.length >= concurrency * 2

      logger.main.info(
        `Starting ${shouldUseCluster ? 'multi-process' : 'concurrent'} task processing, number of ${shouldUseCluster ? 'processes' : 'workers'}: ${concurrency}${shouldUseCluster ? `, concurrency per process: ${this.config.performance.worker.workerConcurrency}` : ''}`,
      )

      const processorOptions: PhotoProcessorOptions = {
        isForceMode: options.isForceMode,
        isForceManifest: options.isForceManifest,
        isForceThumbnails: options.isForceThumbnails,
      }

      let results: ProcessPhotoResult[]

      if (shouldUseCluster) {
        // Create a Cluster pool (multi-process mode)
        const clusterPool = new ClusterPool<ProcessPhotoResult>({
          concurrency,
          totalTasks: tasksToProcess.length,
          workerConcurrency: this.config.performance.worker.workerConcurrency,
          workerEnv: {
            FORCE_MODE: processorOptions.isForceMode.toString(),
            FORCE_MANIFEST: processorOptions.isForceManifest.toString(),
            FORCE_THUMBNAILS: processorOptions.isForceThumbnails.toString(),
          },
          sharedData: {
            existingManifestMap,
            livePhotoMap,
            imageObjects: tasksToProcess,
          },
        })

        // Execute multi-process concurrent processing
        results = await clusterPool.execute()
      } else {
        // Create a traditional Worker pool (main thread concurrent mode)
        const workerPool = new WorkerPool<ProcessPhotoResult>({
          concurrency,
          totalTasks: tasksToProcess.length,
        })

        // Execute concurrent processing
        results = await workerPool.execute(async (taskIndex, workerId) => {
          const obj = tasksToProcess[taskIndex]

          // Convert StorageObject to the old _Object format to be compatible with the existing processPhoto function
          const legacyObj = {
            Key: obj.key,
            Size: obj.size,
            LastModified: obj.lastModified,
            ETag: obj.etag,
          }

          // Convert Live Photo Map
          const legacyLivePhotoMap = new Map()
          for (const [key, value] of livePhotoMap) {
            legacyLivePhotoMap.set(key, {
              Key: value.key,
              Size: value.size,
              LastModified: value.lastModified,
              ETag: value.etag,
            })
          }

          return await processPhoto(
            legacyObj,
            taskIndex,
            workerId,
            tasksToProcess.length,
            existingManifestMap,
            legacyLivePhotoMap,
            processorOptions,
          )
        })
      }

      // Count the results and add them to the manifest
      for (const result of results) {
        if (result.item) {
          manifest.push(result.item)

          switch (result.type) {
            case 'new': {
              newCount++
              processedCount++
              break
            }
            case 'processed': {
              processedCount++
              break
            }
            case 'skipped': {
              skippedCount++
              break
            }
          }
        }
      }

      // Add unprocessed but still existing photos to the manifest
      for (const [key, item] of existingManifestMap) {
        if (s3ImageKeys.has(key) && !manifest.some((m) => m.s3Key === key)) {
          manifest.push(item)
          skippedCount++
        }
      }
    }

    // Detect and process deleted images
    deletedCount = await handleDeletedPhotos(manifest)
    // Save manifest
    await saveManifest(manifest)

    // Show build results
    if (this.config.options.showDetailedStats) {
      this.logBuildResults(
        manifest,
        {
          newCount,
          processedCount,
          skippedCount,
          deletedCount,
        },
        Date.now() - startTime,
      )
    }

    // Return build results
    const hasUpdates = newCount > 0 || processedCount > 0 || deletedCount > 0
    return {
      hasUpdates,
      newCount,
      processedCount,
      skippedCount,
      deletedCount,
      totalPhotos: manifest.length,
    }
  }

  private async loadExistingManifest(
    options: BuilderOptions,
  ): Promise<AfilmoryManifest> {
    return options.isForceMode || options.isForceManifest
      ? {
          version: 'v5',
          data: [],
        }
      : await loadExistingManifest()
  }

  private async detectLivePhotos(
    allObjects: Awaited<ReturnType<StorageManager['listAllFiles']>>,
  ): Promise<Map<string, (typeof allObjects)[0]>> {
    if (!this.config.options.enableLivePhotoDetection) {
      return new Map()
    }

    return await this.storageManager.detectLivePhotos(allObjects)
  }

  private logBuildStart(): void {
    switch (this.config.storage.provider) {
      case 's3': {
        const endpoint = this.config.storage.endpoint || 'Default AWS S3'
        const customDomain = this.config.storage.customDomain || 'Not set'
        const { bucket } = this.config.storage
        const prefix = this.config.storage.prefix || 'No prefix'

        logger.main.info('🚀 Starting to fetch photo list from storage...')
        logger.main.info(`🔗 Using endpoint: ${endpoint}`)
        logger.main.info(`🌐 Custom domain: ${customDomain}`)
        logger.main.info(`🪣 Bucket: ${bucket}`)
        logger.main.info(`📂 Prefix: ${prefix}`)
        break
      }
      case 'github': {
        const { owner, repo, branch, path } = this.config.storage
        logger.main.info('🚀 Starting to fetch photo list from storage...')
        logger.main.info(`👤 Repository owner: ${owner}`)
        logger.main.info(`🏷️ Repository name: ${repo}`)
        logger.main.info(`🌲 Branch: ${branch}`)
        logger.main.info(`📂 Path: ${path}`)
        break
      }
    }
  }

  private logBuildResults(
    manifest: PhotoManifestItem[],
    stats: {
      newCount: number
      processedCount: number
      skippedCount: number
      deletedCount: number
    },
    totalDuration: number,
  ): void {
    const durationSeconds = Math.round(totalDuration / 1000)
    const durationMinutes = Math.floor(durationSeconds / 60)
    const remainingSeconds = durationSeconds % 60

    logger.main.success(`🎉 Manifest built successfully!`)
    logger.main.info(`📊 Processing statistics:`)
    logger.main.info(`   📸 Total photos: ${manifest.length}`)
    logger.main.info(`   🆕 New photos: ${stats.newCount}`)
    logger.main.info(`   🔄 Processed photos: ${stats.processedCount}`)
    logger.main.info(`   ⏭️ Skipped photos: ${stats.skippedCount}`)
    logger.main.info(`   🗑️ Deleted photos: ${stats.deletedCount}`)
    logger.main.info(
      `   ⏱️ Total time: ${durationMinutes > 0 ? `${durationMinutes}m ${remainingSeconds}s` : `${durationSeconds}s`}`,
    )
  }

  /**
   * Get the currently used storage manager
   */
  getStorageManager(): StorageManager {
    return this.storageManager
  }

  /**
   * Get current configuration
   */
  getConfig(): BuilderConfig {
    return { ...this.config }
  }

  /**
   * Filter out the images that actually need to be processed
   * @param imageObjects List of image objects in storage
   * @param existingManifestMap Mapping of the existing manifest
   * @param options build options
   * @returns Array of images that actually need to be processed
   */
  private async filterTaskImages(
    imageObjects: Awaited<ReturnType<StorageManager['listImages']>>,
    existingManifestMap: Map<string, PhotoManifestItem>,
    options: BuilderOptions,
  ): Promise<Awaited<ReturnType<StorageManager['listImages']>>> {
    // All images need to be processed in force mode
    if (options.isForceMode || options.isForceManifest) {
      return imageObjects
    }

    const tasksToProcess: Awaited<ReturnType<StorageManager['listImages']>> = []

    for (const obj of imageObjects) {
      const { key } = obj
      const photoId = path.basename(key, path.extname(key))
      const existingItem = existingManifestMap.get(key)

      // New images need to be processed
      if (!existingItem) {
        tasksToProcess.push(obj)
        continue
      }

      // Check if an update is needed (based on modification time)
      const legacyObj = {
        Key: key,
        Size: obj.size,
        LastModified: obj.lastModified,
        ETag: obj.etag,
      }

      if (needsUpdate(existingItem, legacyObj)) {
        tasksToProcess.push(obj)
        continue
      }

      // Check if the thumbnail exists, if it does not exist or if a forced refresh of the thumbnail is required, it needs to be processed
      const hasThumbnail = await thumbnailExists(photoId)
      if (!hasThumbnail || options.isForceThumbnails) {
        tasksToProcess.push(obj)
        continue
      }

      // Skip processing in other cases
    }

    return tasksToProcess
  }
}

// Export the default builder instance
export const defaultBuilder = new PhotoGalleryBuilder()
