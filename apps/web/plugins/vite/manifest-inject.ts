import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

import { MANIFEST_PATH } from './__internal__/constants'

export function manifestInjectPlugin(): Plugin {
  function getManifestContent(): string {
    try {
      const content = readFileSync(MANIFEST_PATH, 'utf-8')
      return content
    } catch (error) {
      console.warn('Failed to read manifest file:', error)
      return '{}'
    }
  }

  return {
    name: 'manifest-inject',

    configureServer(server) {
      // Watch for manifest file changes
      server.watcher.add(MANIFEST_PATH)

      server.watcher.on('change', (file) => {
        if (file === MANIFEST_PATH) {
          console.info(
            '[manifest-inject] Manifest file changed, triggering HMR...',
          )
          // Trigger page reload
          server.ws.send({
            type: 'full-reload',
          })
        }
      })
    },

    transformIndexHtml(html) {
      const manifestContent = getManifestContent()

      // Inject manifest content into script#manifest tag
      const scriptContent = `window.__MANIFEST__ = ${manifestContent};`

      return html.replace(
        '<script id="manifest"></script>',
        `<script id="manifest">${scriptContent}</script>`,
      )
    },
  }
}
