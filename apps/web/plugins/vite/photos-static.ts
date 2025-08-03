import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Plugin } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../../../..')

/**
 * Vite plugin to serve local photos statically.
 * In development mode, it maps /photos/* requests to the local photos directory.
 */
export function photosStaticPlugin(): Plugin {
  // URL path validation regex: only allow letters, numbers, dots, underscores, hyphens, slashes, and spaces
  const pathValidationRegex = /^[\w\u4e00-\u9fa5\s\-./[\]()]+$/

  // Dangerous path patterns
  const dangerousPatterns = [
    /\.\.\//, // Path traversal
    /\.\.\\/,
    /%2e%2e/i, // URL-encoded ..
    /%252e%252e/i, // Double-encoded
    /\0/, // Null byte
  ]

  // ETag generation function
  const generateETag = (stats: fs.Stats): string => {
    return `"${stats.mtime.getTime()}-${stats.size}"`
  }
  return {
    name: 'photos-static',
    configureServer(server) {
      server.middlewares.use('/photos', (req, res, next) => {
        if (!req.url) {
          next()
          return
        }

        // Decode URL to handle special characters
        let decodedUrl: string
        try {
          decodedUrl = decodeURIComponent(req.url)
        } catch {
          // URL decoding failed, possibly a malicious request
          console.error('[photos-static] URL decoding failed:', req.url)
          res.statusCode = 400
          res.end('Bad Request')
          return
        }

        // Remove query parameters
        const cleanPath = decodedUrl.split('?')[0]

        // Check for dangerous path patterns
        for (const pattern of dangerousPatterns) {
          if (pattern.test(cleanPath)) {
            console.error(
              '[photos-static] Dangerous path pattern detected:',
              cleanPath,
            )
            res.statusCode = 403
            res.end('Forbidden')
            return
          }
        }

        // Validate path characters
        if (!pathValidationRegex.test(cleanPath)) {
          console.error(
            '[photos-static] Path contains disallowed characters:',
            cleanPath,
          )
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        // Build local file path
        const localPhotoPath = path.join(projectRoot, 'photos', cleanPath)

        // Security check: ensure the file path is within the photos directory
        const resolvedPath = path.resolve(localPhotoPath)
        const resolvedPhotosDir = path.resolve(projectRoot, 'photos')

        if (!resolvedPath.startsWith(resolvedPhotosDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        // Check if file exists
        if (!fs.existsSync(localPhotoPath)) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }

        // Check if it is a file (not a directory)
        const stats = fs.statSync(localPhotoPath)
        if (!stats.isFile()) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }

        // Set correct Content-Type
        const ext = path.extname(localPhotoPath).toLowerCase()
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.bmp': 'image/bmp',
          '.tiff': 'image/tiff',
          '.tif': 'image/tiff',
          '.heic': 'image/heic',
          '.heif': 'image/heif',
          '.hif': 'image/heif',
          '.avif': 'image/avif',
          '.svg': 'image/svg+xml',
        }

        const contentType = mimeTypes[ext] || 'application/octet-stream'
        res.setHeader('Content-Type', contentType)

        // Set cache headers
        res.setHeader('Cache-Control', 'public, max-age=31536000') // 1 year
        const etag = generateETag(stats)
        res.setHeader('ETag', etag)

        // Check If-None-Match header (ETag cache)
        const ifNoneMatch = req.headers['if-none-match']

        if (ifNoneMatch === etag) {
          res.statusCode = 304
          res.end()
          return
        }

        // Stream the file
        const stream = fs.createReadStream(localPhotoPath)

        stream.on('error', (error) => {
          console.error('[photos-static] Error streaming photo file:', error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('Internal Server Error')
          }
        })

        stream.pipe(res)
      })
    },
  }
}
