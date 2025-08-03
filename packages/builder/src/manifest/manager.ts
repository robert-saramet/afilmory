import fs from 'node:fs/promises'
import path, { basename } from 'node:path'

import { workdir } from '@afilmory/builder/path.js'
import type { _Object } from '@aws-sdk/client-s3'

import { logger } from '../logger/index.js'
import type { AfilmoryManifest } from '../types/manifest.js'
import type { PhotoManifestItem } from '../types/photo.js'

const manifestPath = path.join(workdir, 'src/data/photos-manifest.json')

export async function loadExistingManifest(): Promise<AfilmoryManifest> {
  let manifest: AfilmoryManifest
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8')
    manifest = JSON.parse(manifestContent) as AfilmoryManifest
  } catch {
    logger.fs.error(
      '🔍 未找到 manifest 文件/解析失败，创建新的 manifest 文件...',
    )
    return {
      version: 'v5',
      data: [],
    }
  }

  if (manifest.version !== 'v5') {
    logger.fs.error('🔍 无效的 manifest 版本，创建新的 manifest 文件...')
    return {
      version: 'v5',
      data: [],
    }
  }
  return manifest
}

// Check if the photo needs to be updated (based on last modification time)
export function needsUpdate(
  existingItem: PhotoManifestItem | undefined,
  s3Object: _Object,
): boolean {
  if (!existingItem) return true
  if (!s3Object.LastModified) return true

  const existingModified = new Date(existingItem.lastModified)
  const s3Modified = s3Object.LastModified

  return s3Modified > existingModified
}

// Save manifest
export async function saveManifest(items: PhotoManifestItem[]): Promise<void> {
  // Sort by date (newest first)
  const sortedManifest = [...items].sort(
    (a, b) => new Date(b.dateTaken).getTime() - new Date(a.dateTaken).getTime(),
  )

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 'v5',
        data: sortedManifest,
      } as AfilmoryManifest,
      null,
      2,
    ),
  )

  logger.fs.info(`📁 Manifest saved to: ${manifestPath}`)
}

// Detect and process deleted images
export async function handleDeletedPhotos(
  items: PhotoManifestItem[],
): Promise<number> {
  logger.main.info('🔍 检查已删除的图片...')
  if (items.length === 0) {
    // Clear all thumbnails
    await fs.rm(path.join(workdir, 'public/thumbnails'), { recursive: true })
    logger.main.info('🔍 没有图片，清空缩略图...')
    return 0
  }

  let deletedCount = 0
  const allThumbnails = await fs.readdir(
    path.join(workdir, 'public/thumbnails'),
  )

  // If thumbnails not in manifest, delete it
  const manifestKeySet = new Set(items.map((item) => item.id))

  for (const thumbnail of allThumbnails) {
    if (!manifestKeySet.has(basename(thumbnail, '.webp'))) {
      await fs.unlink(path.join(workdir, 'public/thumbnails', thumbnail))
      deletedCount++
    }
  }

  return deletedCount
}
