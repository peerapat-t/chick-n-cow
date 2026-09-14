// Card storage on disk. Every card is its own folder:
//
//   cards/<id>/card.json   { label, image, sound?, createdAt }
//   cards/<id>/image.<ext>
//   cards/<id>/sound.<ext>  (optional)
//
// Shared by the Vite dev server (vite.config.ts) and the production server (server/index.ts).

import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'

export const CARDS_DIR = path.resolve(process.env.CARDS_DIR ?? 'cards')

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_LABEL_LENGTH = 30
const ID_PATTERN = /^[a-z0-9-]{1,64}$/i

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

const AUDIO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}

const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  json: 'application/json; charset=utf-8',
}

interface CardMeta {
  label: string
  image: string
  sound?: string
  createdAt: number
}

export interface CardDto {
  id: string
  label: string
  image: string
  sound?: string
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const mimeBase = (type: string) => type.split(';')[0].trim().toLowerCase()

// ---------- Operations ----------

async function listCards(): Promise<CardDto[]> {
  await mkdir(CARDS_DIR, { recursive: true })
  const entries = await readdir(CARDS_DIR, { withFileTypes: true })
  const cards: (CardDto & { createdAt: number })[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID_PATTERN.test(entry.name)) continue
    try {
      const meta: CardMeta = JSON.parse(await readFile(path.join(CARDS_DIR, entry.name, 'card.json'), 'utf8'))
      const id = entry.name
      cards.push({
        id,
        label: meta.label,
        image: `cards/${id}/${meta.image}`,
        sound: meta.sound ? `cards/${id}/${meta.sound}` : undefined,
        createdAt: meta.createdAt ?? 0,
      })
    } catch {
      // folder without a valid card.json — ignore
    }
  }
  return cards.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)).map(({ createdAt: _, ...c }) => c)
}

async function createCard(req: IncomingMessage): Promise<CardDto> {
  const request = new Request('http://local/api/cards', {
    method: 'POST',
    headers: req.headers as Record<string, string>,
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  } as RequestInit)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new HttpError(400, 'ข้อมูลที่ส่งมาไม่ถูกต้อง')
  }

  const label = String(form.get('label') ?? '').trim()
  const image = form.get('image')
  const sound = form.get('sound')

  if (!label || label.length > MAX_LABEL_LENGTH) throw new HttpError(400, 'กรุณาใส่ชื่อการ์ด (ไม่เกิน 30 ตัวอักษร)')
  if (!(image instanceof File) || image.size === 0) throw new HttpError(400, 'กรุณาเลือกรูปภาพ')

  const imageExt = IMAGE_EXT[mimeBase(image.type)]
  if (!imageExt) throw new HttpError(400, 'ไม่รองรับไฟล์รูปประเภทนี้')
  if (image.size > MAX_FILE_BYTES) throw new HttpError(400, 'ไฟล์รูปใหญ่เกินไป (สูงสุด 5MB)')

  let soundExt: string | undefined
  if (sound instanceof File && sound.size > 0) {
    soundExt = AUDIO_EXT[mimeBase(sound.type)]
    if (!soundExt) throw new HttpError(400, 'ไม่รองรับไฟล์เสียงประเภทนี้')
    if (sound.size > MAX_FILE_BYTES) throw new HttpError(400, 'ไฟล์เสียงใหญ่เกินไป (สูงสุด 5MB)')
  }

  const id = `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const dir = path.join(CARDS_DIR, id)
  const meta: CardMeta = {
    label,
    image: `image.${imageExt}`,
    sound: soundExt ? `sound.${soundExt}` : undefined,
    createdAt: Date.now(),
  }

  await mkdir(dir, { recursive: true })
  try {
    await writeFile(path.join(dir, meta.image), Buffer.from(await image.arrayBuffer()))
    if (meta.sound && sound instanceof File) await writeFile(path.join(dir, meta.sound), Buffer.from(await sound.arrayBuffer()))
    await writeFile(path.join(dir, 'card.json'), JSON.stringify(meta, null, 2) + '\n')
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    throw err
  }

  return { id, label, image: `cards/${id}/${meta.image}`, sound: meta.sound ? `cards/${id}/${meta.sound}` : undefined }
}

async function deleteCard(id: string) {
  if (!ID_PATTERN.test(id)) throw new HttpError(400, 'รหัสการ์ดไม่ถูกต้อง')
  const dir = path.join(CARDS_DIR, id)
  const info = await stat(dir).catch(() => null)
  if (!info?.isDirectory()) throw new HttpError(404, 'ไม่พบการ์ด')
  await rm(dir, { recursive: true, force: true })
}

async function serveCardFile(req: IncomingMessage, res: ServerResponse, relPath: string) {
  const file = path.resolve(CARDS_DIR, relPath)
  if (!file.startsWith(CARDS_DIR + path.sep)) throw new HttpError(404, 'Not found')
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) throw new HttpError(404, 'Not found')

  const ext = path.extname(file).slice(1).toLowerCase()
  const headers: Record<string, string | number> = {
    'Content-Type': CONTENT_TYPE[ext] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    // Uploaded SVGs must never run scripts
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'X-Content-Type-Options': 'nosniff',
  }

  // Byte ranges are needed for audio seeking in Safari
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1
    if (start > end || start >= info.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` })
      return res.end()
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': end - start + 1 })
    if (req.method === 'HEAD') return res.end()
    return createReadStream(file, { start, end }).pipe(res)
  }

  res.writeHead(200, { ...headers, 'Content-Length': info.size })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

// ---------- Middleware ----------

/** Handles /api/cards and /cards/*. Calls next() for anything else. */
export async function cardsMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://local')
  const pathname = decodeURIComponent(url.pathname)

  try {
    if (pathname === '/api/cards') {
      if (req.method === 'GET') return sendJson(res, 200, await listCards())
      if (req.method === 'POST') return sendJson(res, 201, await createCard(req))
      return sendJson(res, 405, { error: 'Method not allowed' })
    }

    const del = /^\/api\/cards\/([^/]+)$/.exec(pathname)
    if (del) {
      if (req.method !== 'DELETE') return sendJson(res, 405, { error: 'Method not allowed' })
      await deleteCard(del[1])
      res.writeHead(204).end()
      return
    }

    if (pathname.startsWith('/cards/') && (req.method === 'GET' || req.method === 'HEAD')) {
      return await serveCardFile(req, res, pathname.slice('/cards/'.length))
    }
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message })
    console.error(err)
    return sendJson(res, 500, { error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' })
  }

  next()
}
