# Afilmory Builder

This is the core module of the photo gallery build system, which adopts a modular design to separate different functions into their respective modules.

## Architecture Overview

```
src/core/
├── types/          # Type definitions
│   └── photo.ts    # Photo-related types
├── logger/         # Logging system
│   └── index.ts    # Unified logger
├── s3/             # S3 storage operations
│   ├── client.ts   # S3 client configuration
│   └── operations.ts # S3 operations (upload, download, list)
├── image/          # Image processing
│   ├── processor.ts # Image preprocessing and metadata
│   ├── blurhash.ts # Blurhash generation
│   ├── thumbnail.ts # Thumbnail generation
│   └── exif.ts     # EXIF data extraction
├── photo/          # Photo processing
│   ├── info-extractor.ts # Photo information extraction
│   └── processor.ts # Main photo processing logic
├── manifest/       # Manifest management
│   └── manager.ts  # Manifest reading, writing, and management
├── worker/         # Concurrent processing
│   └── pool.ts     # Worker pool management
├── builder/        # Main builder
│   └── index.ts    # Build process orchestration
└── index.ts        # Module entry point
```

## Module Descriptions

### 1. Type Definitions (`types/`)
- `PhotoInfo`: Basic photo information
- `ImageMetadata`: Image metadata
- `PhotoManifestItem`: Manifest item
- `ProcessPhotoResult`: Processing result
- `ThumbnailResult`: Thumbnail generation result

### 2. Logging System (`logger/`)
- Unified log management
- Supports tagged logging for different modules
- Dedicated logger for workers

### 3. S3 Storage Operations (`s3/`)
- **client.ts**: S3 client configuration and connection
- **operations.ts**: Image download, list retrieval, URL generation

### 4. Image Processing (`image/`)
- **processor.ts**: Image preprocessing, HEIC conversion, metadata extraction
- **blurhash.ts**: Blurhash generation algorithm
- **thumbnail.ts**: Thumbnail generation and management
- **exif.ts**: EXIF data extraction and cleaning

### 5. Photo Processing (`photo/`)
- **info-extractor.ts**: Extracts photo information from filenames and EXIF
- **processor.ts**: Main photo processing flow, integrating all processing steps

### 6. Manifest Management (`manifest/`)
- **manager.ts**: Reading, saving, and update detection of manifest files

### 7. Concurrent Processing (`worker/`)
- **pool.ts**: Worker pool management, supports concurrent processing

### 8. Main Builder (`builder/`)
- **index.ts**: Orchestration and coordination of the entire build process

## Usage

### Basic Usage
```typescript
import { buildManifest } from './src/core/index.js'

await buildManifest({
  isForceMode: false,
  isForceManifest: false,
  isForceThumbnails: false,
  concurrencyLimit: 10,
})
```

### Using Modules Individually
```typescript
import { 
  getImageFromS3, 
  generateThumbnailAndBlurhash,
  extractExifData 
} from './src/core/index.js'

// Download image
const buffer = await getImageFromS3('path/to/image.jpg')

// Generate thumbnail
const result = await generateThumbnailAndBlurhash(buffer, 'photo-id', 1920, 1080)

// Extract EXIF
const exif = await extractExifData(buffer)
```

## Features

### 1. Modular Design
- Each functional module is independent, which is convenient for testing and maintenance
- Clear dependency relationships
- Easy to extend with new features

### 2. Type Safety
- Complete TypeScript type definitions
- Compile-time error checking

### 3. Performance Optimization
- Worker pool for concurrent processing
- Sharp instance reuse
- Incremental update support

### 4. Error Handling
- Unified error handling mechanism
- Detailed logging
- Graceful failure handling

### 5. Flexible Configuration
- Supports multiple operating modes
- Configurable concurrency
- Environment variable configuration

## Extension Guide

### Adding New Image Processing Features
1. Create a new module in the `image/` directory
2. Export the new feature in `index.ts`
3. Integrate it in `photo/processor.ts`

### Adding a New Storage Backend
1. Create a new operations module in the `s3/` directory
2. Implement the same interface
3. Switch in the configuration

### Custom Logger
```typescript
import { logger } from './src/core/index.js'

const customLogger = logger.worker(1).withTag('CUSTOM')
customLogger.info('Custom log')
```

## Performance Considerations

- Use a worker pool to avoid excessive concurrency
- Reuse Sharp instances to reduce memory overhead
- Use incremental updates to reduce unnecessary processing
- Reuse thumbnail and Blurhash cache