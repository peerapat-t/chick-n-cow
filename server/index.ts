// Production server: serves the built app (dist/), the card files (cards/) and the card API.
//   npm run build && npm start
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { CARDS_DIR, cardsMiddleware } from './cards.ts'

const DIST_DIR = path.resolve('dist')
const PORT = Number(process.env.PORT ?? 3000)

const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

const server = createServer((req, res) => {
  cardsMiddleware(req, res, async () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname)
    let file = path.resolve(DIST_DIR, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(DIST_DIR + path.sep)) file = path.join(DIST_DIR, 'index.html')

    let info = await stat(file).catch(() => null)
    if (!info?.isFile()) {
      file = path.join(DIST_DIR, 'index.html')
      info = await stat(file).catch(() => null)
    }
    if (!info) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('dist/ not found — run "npm run build" first')
      return
    }

    const ext = path.extname(file)
    res.writeHead(200, {
      'Content-Type': STATIC_TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    if (req.method === 'HEAD') res.end()
    else createReadStream(file).pipe(res)
  })
})

server.listen(PORT, () => {
  console.log(`Chick n Cow running at http://localhost:${PORT}`)
  console.log(`Cards folder: ${CARDS_DIR}`)
})
