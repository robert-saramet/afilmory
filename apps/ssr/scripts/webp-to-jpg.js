import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

import sharp from 'sharp'

const __dirname = new URL('.', import.meta.url).pathname
// Define the target directory
const thumbnailsDir = join(__dirname, '../public/thumbnails')

// Function to convert WebP to JPG
async function convertWebpToJpg(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .jpeg({ quality: 90 }) // Set JPG quality to 90
      .toFile(outputPath)
    console.info(
      `✅ Conversion successful: ${basename(inputPath)} -> ${basename(
        outputPath,
      )}`,
    )
  } catch (error) {
    console.error(`❌ Conversion failed: ${basename(inputPath)}`, error.message)
  }
}

// Recursively process the directory
async function processDirectory(dirPath) {
  try {
    const items = readdirSync(dirPath)

    for (const item of items) {
      const fullPath = join(dirPath, item)
      const stat = statSync(fullPath)

      if (stat.isDirectory()) {
        // Recursively process subdirectories
        await processDirectory(fullPath)
      } else if (stat.isFile() && extname(item).toLowerCase() === '.webp') {
        // Process WebP files
        const baseName = basename(item, '.webp')
        const outputPath = join(dirPath, `${baseName}.jpg`)

        await convertWebpToJpg(fullPath, outputPath)
      }
    }
  } catch (error) {
    console.error(`❌ Failed to process directory: ${dirPath}`, error.message)
  }
}

// Main function
async function main() {
  console.info('🚀 Starting WebP to JPG conversion...')
  console.info(`📁 Target directory: ${thumbnailsDir}`)

  // Check if the directory exists
  if (!existsSync(thumbnailsDir)) {
    console.error(`❌ Directory not found: ${thumbnailsDir}`)
    throw new Error('Target directory not found')
  }

  try {
    await processDirectory(thumbnailsDir)
    console.info('✨ 所有转换任务完成！')
  } catch (error) {
    console.error('❌ 转换过程中发生错误：', error.message)
    throw error
  }
}

main()
