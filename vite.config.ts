import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { cardsMiddleware } from './server/cards.ts'

/** Serves the card API and cards/ folder from the Vite dev server too. */
const cardsApi = (): Plugin => ({
  name: 'cards-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => void cardsMiddleware(req, res, next))
    // Uploaded files shouldn't trigger a page reload
    server.watcher.unwatch('cards')
  },
})

export default defineConfig({
  plugins: [tailwindcss(), cardsApi()],
})
