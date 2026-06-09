import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'
import fs from 'fs'

function copySqlWasm() {
  return {
    name: 'copy-sql-wasm',
    closeBundle() {
      const src = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')
      const dest = path.resolve('dist-electron/sql-wasm.wasm')
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          plugins: [copySqlWasm()],
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron-store', 'sql.js', 'pdfjs-dist/legacy/build/pdf.js', 'epubjs', 'openai', 'jszip', '@xmldom/xmldom'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the PDF stack into its own vendor chunk so it loads only when a
        // PDF is opened, instead of bloating the main bundle.
        manualChunks: {
          'pdf-vendor': [
            'pdfjs-dist',
            '@react-pdf-viewer/core',
            '@react-pdf-viewer/default-layout',
          ],
        },
      },
    },
  },
  base: './',
})
