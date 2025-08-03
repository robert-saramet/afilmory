import 'dotenv-expand/config'

import { execSync } from 'node:child_process'
import cluster from 'node:cluster'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { builderConfig } from '@builder'
import { $ } from 'execa'

import { defaultBuilder } from './builder/index.js'
import { logger } from './logger/index.js'
import { workdir } from './path.js'
import { runAsWorker } from './runAsWorker.js'

/**
 * Push the updated manifest to the remote repository
 */
async function pushManifestToRemoteRepo(): Promise<boolean> {
  if (!builderConfig.repo.enable || !builderConfig.repo.token) {
    if (!builderConfig.repo.enable) {
      logger.main.info('🔧 Remote repository is not enabled, skipping push')
    } else {
      logger.main.warn('⚠️ Git Token not provided, skipping push to remote repository')
    }
    return false
  }

  try {
    const assetsGitDir = path.resolve(workdir, 'assets-git')

    if (!existsSync(assetsGitDir)) {
      logger.main.error('❌ assets-git directory not found, cannot push')
      return false
    }

    logger.main.info('📤 Starting to push updates to the remote repository...')

    // Configure Git user identity (especially in a CI environment)
    try {
      // Check if user identity is already configured
      await $({
        cwd: assetsGitDir,
        stdio: 'pipe',
      })`git config user.name`
    } catch {
      // If not configured, set the default CI user identity
      logger.main.info('🔧 Configuring Git user identity (CI environment)...')
      await $({
        cwd: assetsGitDir,
        stdio: 'pipe',
      })`git config user.email "ci@afilmory.local"`
      await $({
        cwd: assetsGitDir,
        stdio: 'pipe',
      })`git config user.name "Afilmory CI"`
    }

    // Check for changes
    const status = await $({
      cwd: assetsGitDir,
      stdio: 'pipe',
    })`git status --porcelain`

    if (!status.stdout.trim()) {
      logger.main.info('💡 No changes to push')
      return false
    }

    logger.main.info('📋 Detected the following changes:')
    logger.main.info(status.stdout)

    // Configure git credentials
    const repoUrl = builderConfig.repo.url
    const { token } = builderConfig.repo

    // Parse the repository URL and add the token
    let authenticatedUrl = repoUrl
    if (repoUrl.startsWith('https://github.com/')) {
      const urlWithoutProtocol = repoUrl.replace('https://', '')
      authenticatedUrl = `https://${token}@${urlWithoutProtocol}`
    }

    // Set the remote repository URL (including the token)
    await $({
      cwd: assetsGitDir,
      stdio: 'pipe',
    })`git remote set-url origin ${authenticatedUrl}`

    // Add all changes
    await $({
      cwd: assetsGitDir,
      stdio: 'inherit',
    })`git add .`

    // Commit changes
    const commitMessage = `chore: update photos-manifest.json and thumbnails - ${new Date().toISOString()}`
    await $({
      cwd: assetsGitDir,
      stdio: 'inherit',
    })`git commit -m ${commitMessage}`

    // Push to the remote repository
    await $({
      cwd: assetsGitDir,
      stdio: 'inherit',
    })`git push origin HEAD`

    logger.main.success('✅ Successfully pushed updates to the remote repository')
    return true
  } catch (error) {
    logger.main.error('❌ Failed to push to the remote repository:', error)
    return false
  }
}

async function main() {
  // Check if running as a cluster worker
  if (
    process.env.CLUSTER_WORKER === 'true' ||
    process.argv.includes('--cluster-worker') ||
    cluster.isWorker
  ) {
    await runAsWorker()
    return
  }

  // If a remote repository is configured, use it
  if (builderConfig.repo.enable) {
    // Pull from the remote repository
    logger.main.info('🔄 Synchronizing remote repository...')

    // Parse the repository URL and add the token
    let repoUrl = builderConfig.repo.url
    const { token } = builderConfig.repo
    if (token && repoUrl.startsWith('https://github.com/')) {
      const urlWithoutProtocol = repoUrl.replace('https://', '')
      repoUrl = `https://${token}@${urlWithoutProtocol}`
    }

    const hasExist = existsSync(path.resolve(workdir, 'assets-git'))
    if (!hasExist) {
      logger.main.info('📥 Cloning remote repository...')
      await $({
        cwd: workdir,
        stdio: 'inherit',
      })`git clone ${repoUrl} assets-git`
    } else {
      logger.main.info('🔄 Pulling updates from the remote repository...')
      try {
        await $({
          cwd: path.resolve(workdir, 'assets-git'),
          stdio: 'inherit',
        })`git pull --rebase`
      } catch {
        logger.main.warn('⚠️ git pull failed, trying to reset the remote repository...')
        logger.main.info('🗑️ Deleting the existing repository directory...')
        await $({ cwd: workdir, stdio: 'inherit' })`rm -rf assets-git`
        logger.main.info('📥 Re-cloning the remote repository...')
        await $({
          cwd: workdir,
          stdio: 'inherit',
        })`git clone ${repoUrl} assets-git`
      }
    }

    // Ensure the remote repository has the necessary directories and files
    const assetsGitDir = path.resolve(workdir, 'assets-git')
    const thumbnailsSourceDir = path.resolve(assetsGitDir, 'thumbnails')
    const manifestSourcePath = path.resolve(
      assetsGitDir,
      'photos-manifest.json',
    )

    // Create the thumbnails directory (if it doesn't exist)
    if (!existsSync(thumbnailsSourceDir)) {
      logger.main.info('📁 Creating thumbnails directory...')
      await $({ cwd: assetsGitDir, stdio: 'inherit' })`mkdir -p thumbnails`
    }

    // Create an empty manifest file (if it doesn't exist)
    if (!existsSync(manifestSourcePath)) {
      logger.main.info('📄 Creating initial manifest file...')
      await $({
        cwd: assetsGitDir,
        stdio: 'inherit',
      })`echo '{"version":"v2","data":[]}' > photos-manifest.json`
    }

    // Delete the public/thumbnails directory and create a symbolic link to assets-git/thumbnails
    const thumbnailsDir = path.resolve(workdir, 'public', 'thumbnails')
    if (existsSync(thumbnailsDir)) {
      await $({ cwd: workdir, stdio: 'inherit' })`rm -rf ${thumbnailsDir}`
    }
    await $({
      cwd: workdir,
      stdio: 'inherit',
    })`ln -s ${thumbnailsSourceDir} ${thumbnailsDir}`

    // Delete src/data/photos-manifest.json and create a symbolic link to assets-git/photos-manifest.json
    const photosManifestPath = path.resolve(
      workdir,
      'src',
      'data',
      'photos-manifest.json',
    )
    if (existsSync(photosManifestPath)) {
      await $({ cwd: workdir, stdio: 'inherit' })`rm -f ${photosManifestPath}`
    }
    await $({
      cwd: workdir,
      stdio: 'inherit',
    })`ln -s ${manifestSourcePath} ${photosManifestPath}`

    logger.main.success('✅ Remote repository synchronized successfully')
  }

  process.title = 'photo-gallery-builder-main'

  // Parse command-line arguments
  const args = new Set(process.argv.slice(2))
  const isForceMode = args.has('--force')
  const isForceManifest = args.has('--force-manifest')
  const isForceThumbnails = args.has('--force-thumbnails')

  // Show help message
  if (args.has('--help') || args.has('-h')) {
    logger.main.info(`
Photo Gallery Builder (New version - using adapter pattern)

Usage: tsx src/core/cli.ts [options]

Options:
  --force              Force re-processing of all photos
  --force-manifest     Force re-generation of the manifest
  --force-thumbnails   Force re-generation of thumbnails
  --config             Show current configuration information
  --help, -h          Show help message

Example:
  tsx src/core/cli.ts                           # Incremental update
  tsx src/core/cli.ts --force                   # Full update
  tsx src/core/cli.ts --force-thumbnails        # Force re-generation of thumbnails
  tsx src/core/cli.ts --config                  # Show configuration information

Configuration:
  Set performance.worker.useClusterMode = true in builder.config.ts
  to enable multi-process cluster mode and leverage multi-core advantages.

Remote repository:
  If the remote repository is enabled (repo.enable = true), updates will be automatically pushed after the build is complete.
  You need to configure repo.token or set the GIT_TOKEN environment variable to provide push permissions.
  If no token is provided, the push step will be skipped.
`)
    return
  }

  // Show configuration information
  if (args.has('--config')) {
    const config = defaultBuilder.getConfig()
    logger.main.info('🔧 Current configuration:')
    logger.main.info(`   Storage provider: ${config.storage.provider}`)

    switch (config.storage.provider) {
      case 's3': {
        logger.main.info(`   Bucket: ${config.storage.bucket}`)
        logger.main.info(`   Region: ${config.storage.region || 'Not set'}`)
        logger.main.info(`   Endpoint: ${config.storage.endpoint || 'Default'}`)
        logger.main.info(
          `   Custom domain: ${config.storage.customDomain || 'Not set'}`,
        )
        logger.main.info(`   Prefix: ${config.storage.prefix || 'None'}`)
        break
      }
      case 'github': {
        logger.main.info(`   Repository owner: ${config.storage.owner}`)
        logger.main.info(`   Repository name: ${config.storage.repo}`)
        logger.main.info(`   Branch: ${config.storage.branch || 'main'}`)
        logger.main.info(`   Path: ${config.storage.path || 'None'}`)
        logger.main.info(`   Use raw URL: ${config.storage.useRawUrl || 'No'}`)
        break
      }
    }
    logger.main.info(`   Default concurrency: ${config.options.defaultConcurrency}`)
    logger.main.info(
      `   Live Photo detection: ${config.options.enableLivePhotoDetection ? 'Enabled' : 'Disabled'}`,
    )
    logger.main.info(
      `   Photo suffix digest length: ${config.options.digestSuffixLength}`,
    )
    logger.main.info(`   Worker count: ${config.performance.worker.workerCount}`)
    logger.main.info(`   Worker timeout: ${config.performance.worker.timeout}ms`)
    logger.main.info(
      `   Cluster mode: ${config.performance.worker.useClusterMode ? 'Enabled' : 'Disabled'}`,
    )
    logger.main.info('')
    logger.main.info('📦 Remote repository configuration:')
    logger.main.info(`   Enabled status: ${config.repo.enable ? 'Enabled' : 'Disabled'}`)
    if (config.repo.enable) {
      logger.main.info(`   Repository address: ${config.repo.url || 'Not set'}`)
      logger.main.info(
        `   Push permission: ${config.repo.token ? 'Configured' : 'Not configured'}`,
      )
    }
    return
  }

  // Determine the run mode
  let runMode = 'Incremental update'
  if (isForceMode) {
    runMode = 'Full update'
  } else if (isForceManifest && isForceThumbnails) {
    runMode = 'Force refresh of manifest and thumbnails'
  } else if (isForceManifest) {
    runMode = 'Force refresh of manifest'
  } else if (isForceThumbnails) {
    runMode = 'Force refresh of thumbnails'
  }

  const config = defaultBuilder.getConfig()
  const concurrencyLimit = config.performance.worker.workerCount
  const finalConcurrency = concurrencyLimit ?? config.options.defaultConcurrency
  const processingMode = config.performance.worker.useClusterMode
    ? 'Multi-process cluster'
    : 'Concurrent thread pool'

  logger.main.info(`🚀 Run mode: ${runMode}`)
  logger.main.info(`⚡ Max concurrency: ${finalConcurrency}`)
  logger.main.info(`🔧 Processing mode: ${processingMode}`)
  logger.main.info(`🏗️ Using builder: PhotoGalleryBuilder (Adapter Pattern)`)

  environmentCheck()

  // Start the build process
  const buildResult = await defaultBuilder.buildManifest({
    isForceMode,
    isForceManifest,
    isForceThumbnails,
    concurrencyLimit,
  })

  // If the remote repository is enabled, push updates after the build is complete
  if (builderConfig.repo.enable) {
    if (buildResult.hasUpdates) {
      logger.main.info('🔄 Detected updates, pushing to the remote repository...')
      await pushManifestToRemoteRepo()
    } else {
      logger.main.info('💡 No updates to push to the remote repository')
    }
  }

  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0)
}

// Run the main function
main().catch((error) => {
  logger.main.error('Build failed:', error)
  throw error
})

function environmentCheck() {
  try {
    execSync('perl -v', { stdio: 'ignore' })

    logger.main.info('Perl is installed')
  } catch (err) {
    console.error(err)
    logger.main.error('Perl is not installed, please install Perl and run again')
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1)
  }
}
