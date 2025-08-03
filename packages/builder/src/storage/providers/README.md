# Storage Providers

This directory contains concrete implementations for various storage services.

## S3 Storage Provider

Supports AWS S3 and S3-compatible storage services (such as MinIO, Alibaba Cloud OSS, etc.).

### Configuration Example

```typescript
const s3Config: StorageConfig = {
  provider: 's3',
  bucket: 'my-bucket',
  region: 'us-east-1',
  endpoint: 'https://s3.amazonaws.com',
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  prefix: 'photos/',
  customDomain: 'https://cdn.example.com',
}
```

## GitHub Storage Provider

Stores photos in a GitHub repository, taking advantage of GitHub's free storage and global CDN.

### Features

- ✅ Free storage space (GitHub repository limit is 1GB)
- ✅ Global CDN support
- ✅ Version control
- ✅ Public access (via raw.githubusercontent.com)
- ✅ Supports private repositories (requires an access token)
- ⚠️ GitHub API has request rate limits
- ⚠️ Not suitable for a large number of files or frequent updates

### Configuration Example

```typescript
const githubConfig: StorageConfig = {
  provider: 'github',
  github: {
    owner: 'your-username',      // GitHub username or organization name
    repo: 'photo-gallery',       // Repository name
    branch: 'main',              // Branch name (optional, default 'main')
    token: 'ghp_xxxxxxxxxxxx',   // GitHub access token (optional)
    path: 'photos',              // Photo storage path (optional)
    useRawUrl: true,             // Use raw.githubusercontent.com (default true)
  },
}
```

### Setup Steps

1. **Create a GitHub repository**
   ```bash
   # Create a new repository (or use an existing one)
   git clone https://github.com/your-username/photo-gallery.git
   cd photo-gallery
   mkdir photos
   ```

2. **Get a GitHub access token** (optional, but recommended)
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Create a new Fine-grained personal access token
   - Select your repository
   - Grant "Contents" permissions (read and write)

3. **Configure environment variables**
   ```bash
   export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
   ```

4. **Update the configuration file**
   ```typescript
   // builder.config.ts
   export const builderConfig: BuilderConfig = {
     ...defaultBuilderConfig,
     storage: {
       provider: 'github',
       github: {
         owner: 'your-username',
         repo: 'photo-gallery',
         branch: 'main',
         token: process.env.GITHUB_TOKEN,
         path: 'photos',
         useRawUrl: true,
       },
     },
   }
   ```

### Usage Example

```typescript
import { GitHubStorageProvider } from '@/core/storage'

const githubProvider = new GitHubStorageProvider({
  provider: 'github',
  github: {
    owner: 'octocat',
    repo: 'Hello-World',
    branch: 'main',
    token: 'your-token',
    path: 'images',
  },
})

// Get a file
const buffer = await githubProvider.getFile('sunset.jpg')

// List all images
const images = await githubProvider.listImages()

// Generate a public URL
const url = githubProvider.generatePublicUrl('sunset.jpg')
// Result: https://raw.githubusercontent.com/octocat/Hello-World/main/images/sunset.jpg
```

### API Limits

The GitHub API has the following limits:

- **Unauthenticated requests**: 60 requests/hour/IP
- **Authenticated requests**: 5,000 requests/hour/token
- **File size**: Maximum 100MB (via API)
- **Repository size**: Recommended not to exceed 1GB

### Best Practices

1. **Use an access token**: To increase the API request limit
2. **Organize the directory structure reasonably**: For easy management and access
3. **Clean up regularly**: Delete unnecessary files to save space
4. **Monitor API usage**: To avoid exceeding request limits
5. **Consider file size**: For large files, consider using other storage services

### Error Handling

The GitHub storage provider handles the following errors:

- **404 Not Found**: File or repository does not exist
- **403 Forbidden**: Insufficient permissions or API limit exceeded
- **422 Unprocessable Entity**: Incorrect request format
- **500+ Server Error**: GitHub server error

## Local Storage Provider

Stores photos on the local file system, suitable for development environments or private deployments.

### Features

- ✅ No external dependencies
- ✅ Fast access speed
- ✅ Full private control
- ✅ Supports recursive directory scanning
- ✅ Supports Live Photos detection
- ⚠️ Requires ensuring file system permissions
- ⚠️ Not suitable for distributed deployments

### Configuration Example

```typescript
const localConfig: StorageConfig = {
  provider: 'local',
  basePath: './photos',              // Local photo storage path (relative or absolute)
  baseUrl: 'http://localhost:3000/photos', // Optional: for generating public URLs
  excludeRegex: '\\.(tmp|cache)$',   // Optional: regex to exclude files
  maxFileLimit: 1000,                // Optional: maximum number of files
}
```

### Path Configuration

- **Relative path**: Relative to the project root directory, e.g., `./photos`, `../images`
- **Absolute path**: Full file system path, e.g., `/home/user/photos`, `C:\\Photos`

### Usage Example

```typescript
import { LocalStorageProvider } from '@/core/storage'

const localProvider = new LocalStorageProvider({
  provider: 'local',
  basePath: './photos',
  baseUrl: 'http://localhost:3000/photos',
})

// Get a file
const buffer = await localProvider.getFile('sunset.jpg')

// List all images
const images = await localProvider.listImages()

// Generate a public URL
const url = localProvider.generatePublicUrl('sunset.jpg')
// Result: http://localhost:3000/photos/sunset.jpg

// Check storage path
const exists = await localProvider.checkBasePath()
if (!exists) {
  await localProvider.ensureBasePath()
}
```

### Directory Structure Example

```
photos/
├── 2024/
│   ├── 01-january/
│   │   ├── IMG_001.jpg
│   │   ├── IMG_001.mov  # Live Photo video
│   │   └── IMG_002.heic
│   └── 02-february/
│       └── sunset.jpg
├── 2023/
│   └── vacation/
│       ├── beach.jpg
│       └── mountain.png
└── misc/
    └── screenshot.png
```

### Best Practices

1. **Permission management**: Ensure the application has permission to read the photo directory
2. **Path safety**: Avoid using paths that contain special characters
3. **Performance optimization**: For a large number of files, consider using `maxFileLimit`
4. **Backup strategy**: Regularly back up important photo files
5. **Monitor space**: Monitor disk space usage

### Development Environment Configuration

For a development environment, it is recommended to use a relative path:

```json
{
  "storage": {
    "provider": "local",
    "basePath": "./dev-photos",
    "baseUrl": "http://localhost:1924/photos"
  }
}
```

### Production Environment Configuration

For a production environment, it is recommended to use an absolute path:

```json
{
  "storage": {
    "provider": "local",
    "basePath": "/var/www/photos",
    "baseUrl": "https://yourdomain.com/photos",
    "excludeRegex": "\\.(tmp|cache|DS_Store)$",
    "maxFileLimit": 5000
  }
}
```

### Comparison with Other Providers

| Feature | S3 | GitHub |
|------|----|----|
| Storage Space | Pay-as-you-go | 1GB free |
| CDN | Additional charge | Free global CDN |
| API Limits | Very high | Limited |
| Use Case | Production | Small projects, demos |
| Setup Complexity | Medium | Simple |

When choosing a storage provider, please make your selection based on your specific needs and budget.