import {defineConfig} from 'vite'
import {fileURLToPath} from 'node:url'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        expedition: fileURLToPath(new URL('index.html', import.meta.url)),
        archive: fileURLToPath(new URL('archive.html', import.meta.url)),
      },
    },
  },
})
