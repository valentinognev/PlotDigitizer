import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Missing hashed bundles must 404 — SPA fallback serving HTML breaks the app silently. */
function asset404Plugin(): Plugin {
  return {
    name: 'asset-404',
    configurePreviewServer(server) {
      const dist = path.resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith('/assets/')) {
          next()
          return
        }
        const file = path.join(dist, url)
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), asset404Plugin()],
  optimizeDeps: {
    include: ['react-plotly.js', 'plotly.js/dist/plotly'],
  },
  server: {
    port: 5173,
    proxy: {
      '/sessions': 'http://127.0.0.1:8000',
      '/settings': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
  preview: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
    proxy: {
      '/sessions': 'http://127.0.0.1:8000',
      '/settings': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
