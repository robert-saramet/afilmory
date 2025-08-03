import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import sharp from 'sharp'

import { buildTimePhotoLoader } from './photo-loader.js'
import { renderSVGText, wrapSVGText } from './svg-text-renderer.js'

// Get the latest photos
async function getLatestPhotos(count = 4) {
  const photos = buildTimePhotoLoader.getPhotos()

  // Sort by shooting time to get the latest photos
  const sortedPhotos = photos.sort((a, b) => {
    if (
      !a?.exif?.Photo?.DateTimeOriginal ||
      !b?.exif?.Photo?.DateTimeOriginal
    ) {
      return 0
    }

    const aDate =
      (a.exif.Photo?.DateTimeOriginal as unknown as string) || a.lastModified
    const bDate =
      (b.exif.Photo?.DateTimeOriginal as unknown as string) || b.lastModified
    return bDate.localeCompare(aDate)
  })

  return sortedPhotos.slice(0, count)
}

// Download and process photo thumbnails
async function downloadAndProcessThumbnail(thumbnailUrl: string, size = 150) {
  try {
    // If it is a local path, read it directly
    if (thumbnailUrl.startsWith('/')) {
      const localPath = join(process.cwd(), 'public', thumbnailUrl)
      if (existsSync(localPath)) {
        return await sharp(localPath)
          .resize(size, size, { fit: 'cover' })
          .png()
          .toBuffer()
      }
    }

    // If it is a URL, it needs to be downloaded (return null for now, network download function can be added later)
    console.warn(`Cannot download thumbnail from URL: ${thumbnailUrl}`)
    return null
  } catch (error) {
    console.warn(`Failed to process thumbnail: ${thumbnailUrl}`, error)
    return null
  }
}

// Create a photo with special effects (rotation, shadow, border)
async function createPhotoWithEffects(
  imageBuffer: Buffer,
  size: number,
  rotation: number,
) {
  try {
    // Calculate the required canvas size after rotation
    const diagonal = Math.ceil(size * Math.sqrt(2))
    const canvasSize = diagonal + 40 // Extra space for shadow

    // Create an SVG with a shadow effect
    const shadowSvg = `
      <svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="4" dy="8" stdDeviation="6" flood-color="rgba(0,0,0,0.4)"/>
          </filter>
        </defs>
        <rect x="${(canvasSize - size - 12) / 2}" y="${(canvasSize - size - 12) / 2}" 
              width="${size + 12}" height="${size + 12}" 
              fill="#f0f0f0" filter="url(#shadow)" 
              transform="rotate(${rotation} ${canvasSize / 2} ${canvasSize / 2})"/>
      </svg>
    `

    // Create a shadow layer
    const shadowBuffer = await sharp(Buffer.from(shadowSvg)).png().toBuffer()

    // Process the original image: add a light gray border and rotate (adapter for dark theme)
    const photoWithBorder = await sharp(imageBuffer)
      .extend({
        top: 6,
        bottom: 6,
        left: 6,
        right: 6,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      })
      .png()
      .toBuffer()

    // Create the final canvas
    const canvas = sharp({
      create: {
        width: canvasSize,
        height: canvasSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })

    // Calculate the position of the photo on the canvas
    const photoX = (canvasSize - size - 12) / 2
    const photoY = (canvasSize - size - 12) / 2

    // Composite the shadow and the photo
    const result = await canvas
      .composite([
        { input: shadowBuffer, top: 0, left: 0 },
        {
          input: photoWithBorder,
          top: Math.round(photoY),
          left: Math.round(photoX),
        },
      ])
      .png()
      .toBuffer()

    // Rotate the entire image
    return await sharp(result)
      .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  } catch (error) {
    console.warn('Failed to create photo with effects:', error)
    // If the special effects fail, return a simple bordered version (for dark theme)
    return await sharp(imageBuffer)
      .extend({
        top: 4,
        bottom: 4,
        left: 4,
        right: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      })
      .png()
      .toBuffer()
  }
}

interface OGImageOptions {
  title: string
  description: string
  width?: number
  height?: number
  outputPath: string
  includePhotos?: boolean
  photoCount?: number
}

export async function generateOGImage(options: OGImageOptions) {
  const {
    title,
    description,
    width = 1200,
    height = 630,
    outputPath,
    includePhotos = true,
    photoCount = 4,
  } = options

  // Ensure the output directory exists
  const outputDir = join(process.cwd(), 'public')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  try {
    let finalImage: sharp.Sharp

    if (includePhotos) {
      // Get latest photos
      const latestPhotos = await getLatestPhotos(photoCount)
      console.info(`📸 Found ${latestPhotos.length} latest photos`)

      // Create a basic canvas - dark theme
      const canvas = sharp({
        create: {
          width,
          height,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      })

      // Create a modern dark theme gradient background
      const gradientSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#0f0f0f;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#1a1a1a;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
            </linearGradient>
            <radialGradient id="accent" cx="80%" cy="20%" r="60%">
              <stop offset="0%" style="stop-color:#333333;stop-opacity:0.3" />
              <stop offset="100%" style="stop-color:#000000;stop-opacity:0" />
            </radialGradient>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <rect width="100%" height="100%" fill="url(#accent)"/>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      `

      const gradientBuffer = await sharp(Buffer.from(gradientSvg))
        .png()
        .toBuffer()

      // Create a text layer - use SVG paths to draw Helvetica-style fonts
      const wrappedTitle = wrapSVGText(title, width - 120, {
        fontSize: 48,
        fontWeight: 'bold',
      })
      const wrappedDescription = wrapSVGText(description, width - 120, {
        fontSize: 24,
      })
      const footerText = `Latest Photos • Generated on ${new Date().toLocaleDateString()}`

      const titleSVG = renderSVGText(wrappedTitle, 60, 72, {
        fontSize: 48,
        fontWeight: 'bold',
        color: 'white',
        letterSpacing: 2,
      })

      const descriptionSVG = renderSVGText(wrappedDescription, 60, 146, {
        fontSize: 24,
        color: 'rgba(255,255,255,0.9)',
        letterSpacing: 1,
      })

      const footerSVG = renderSVGText(footerText, 60, 556, {
        fontSize: 18,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 0.5,
      })

      const textSvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          ${titleSVG}
          ${descriptionSVG}
          ${footerSVG}
        </svg>
      `

      const textBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer()

      // Prepare composite layers
      const composite: sharp.OverlayOptions[] = [
        { input: gradientBuffer, top: 0, left: 0 },
        { input: textBuffer, top: 0, left: 0 },
      ]

      // Process photo thumbnails - create a tilted overlay effect
      const photoSize = 160
      const baseX = 580
      const baseY = 200 // Move down 50px
      const rotations = [-12, 5, -8, 10] // Rotation angle for each photo
      const offsets = [
        { x: 0, y: 20 },
        { x: 90, y: 60 },
        { x: 180, y: -10 },
        { x: 270, y: 70 },
      ]

      const length = Math.min(latestPhotos.length, photoCount)
      for (let i = length - 1; i >= 0; i--) {
        const photo = latestPhotos[i]
        const thumbnailBuffer = await downloadAndProcessThumbnail(
          photo.thumbnailUrl,
          photoSize,
        )

        if (thumbnailBuffer) {
          const rotation = rotations[i] || 0
          const offset = offsets[i] || { x: i * 60, y: 0 }
          const x = baseX + offset.x
          const y = baseY + offset.y

          // Create a photo with a shadow and border
          const photoWithEffects = await createPhotoWithEffects(
            thumbnailBuffer,
            photoSize,
            rotation,
          )

          composite.push({
            input: photoWithEffects,
            top: y,
            left: x,
          })

          console.info(
            `📷 Added photo: ${photo.title} at position (${x}, ${y}) with rotation ${rotation}°`,
          )
        }
      }

      // Composite the final image
      finalImage = canvas.composite(composite)
    } else {
      // Simple version without photos - dark theme, using SVG paths to draw fonts
      const simpleWrappedTitle = wrapSVGText(title, width - 120, {
        fontSize: 72,
        fontWeight: 'bold',
      })
      const simpleWrappedDescription = wrapSVGText(description, width - 120, {
        fontSize: 32,
      })
      const simpleFooterText = `Generated on ${new Date().toLocaleDateString()}`

      const simpleTitleSVG = renderSVGText(simpleWrappedTitle, 60, 152, {
        fontSize: 72,
        fontWeight: 'bold',
        color: 'white',
        letterSpacing: 3,
      })

      const simpleDescriptionSVG = renderSVGText(
        simpleWrappedDescription,
        60,
        256,
        {
          fontSize: 32,
          color: 'rgba(255,255,255,0.9)',
          letterSpacing: 1.5,
        },
      )

      const simpleFooterSVG = renderSVGText(simpleFooterText, 60, 526, {
        fontSize: 24,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1,
      })

      const svgContent = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#0f0f0f;stop-opacity:1" />
              <stop offset="50%" style="stop-color:#1a1a1a;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1" />
            </linearGradient>
            <radialGradient id="accent" cx="80%" cy="20%" r="60%">
              <stop offset="0%" style="stop-color:#333333;stop-opacity:0.3" />
              <stop offset="100%" style="stop-color:#000000;stop-opacity:0" />
            </radialGradient>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          
          <rect width="100%" height="100%" fill="url(#bg)"/>
          <rect width="100%" height="100%" fill="url(#accent)"/>
          <rect width="100%" height="100%" fill="url(#grid)" />

          ${simpleTitleSVG}
          ${simpleDescriptionSVG}
          ${simpleFooterSVG}
          
          <circle cx="1000" cy="150" r="80" fill="rgba(255,255,255,0.03)"/>
          <circle cx="1050" cy="200" r="40" fill="rgba(255,255,255,0.02)"/>
          <circle cx="950" cy="250" r="60" fill="rgba(255,255,255,0.025)"/>
        </svg>
      `

      finalImage = sharp(Buffer.from(svgContent))
    }

    // Generate the final image
    const buffer = await finalImage.png().toBuffer()

    // Write to file
    const fullOutputPath = join(outputDir, outputPath)
    writeFileSync(fullOutputPath, buffer)

    console.info(`✅ OG image generated: ${fullOutputPath}`)
    return fullOutputPath
  } catch (error) {
    console.error('❌ Error generating OG image:', error)
    throw error
  }
}
