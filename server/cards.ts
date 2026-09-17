// Card storage on disk. Every card is its own folder:
//
//   cards/<id>/card.json   { label, image, createdAt }
//   cards/<id>/image.<ext>
//
// Shared by the Vite dev server (vite.config.ts) and the production server (server/index.ts).

import { createReadStream } from 'node:fs'
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'

export const CARDS_DIR = path.resolve(process.env.CARDS_DIR ?? 'cards')
/** Holds start.* (played before a game) and during.* (looped while playing) */
export const SOUND_DIR = path.resolve(process.env.SOUND_DIR ?? 'sound')
/** Plain-text log of how each game ended */
export const HISTORY_DIR = path.resolve(process.env.HISTORY_DIR ?? 'history')
export const HISTORY_FILE = path.join(HISTORY_DIR, 'history.txt')

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

/** Sound formats accepted for a card */
const CARD_AUDIO_EXT: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
}

const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  json: 'application/json; charset=utf-8',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  flac: 'audio/flac',
}

const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'webm', 'flac']

interface CardMeta {
  label: string
  image: string
  sound: string
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
  if (!(sound instanceof File) || sound.size === 0) throw new HttpError(400, 'กรุณาใส่เสียงอ่านของการ์ด')

  const imageExt = IMAGE_EXT[mimeBase(image.type)]
  if (!imageExt) throw new HttpError(400, 'ไม่รองรับไฟล์รูปประเภทนี้')
  if (image.size > MAX_FILE_BYTES) throw new HttpError(400, 'ไฟล์รูปใหญ่เกินไป (สูงสุด 5MB)')

  const soundExt = CARD_AUDIO_EXT[mimeBase(sound.type)]
  if (!soundExt) throw new HttpError(400, 'ไม่รองรับไฟล์เสียงประเภทนี้')
  if (sound.size > MAX_FILE_BYTES) throw new HttpError(400, 'ไฟล์เสียงใหญ่เกินไป (สูงสุด 5MB)')

  const id = `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const dir = path.join(CARDS_DIR, id)
  const meta: CardMeta = {
    label,
    image: `image.${imageExt}`,
    sound: `sound.${soundExt}`,
    createdAt: Date.now(),
  }

  await mkdir(dir, { recursive: true })
  try {
    await writeFile(path.join(dir, meta.image), Buffer.from(await image.arrayBuffer()))
    await writeFile(path.join(dir, meta.sound), Buffer.from(await sound.arrayBuffer()))
    await writeFile(path.join(dir, 'card.json'), JSON.stringify(meta, null, 2) + '\n')
  } catch (err) {
    await rm(dir, { recursive: true, force: true })
    throw err
  }

  return { id, label, image: `cards/${id}/${meta.image}`, sound: `cards/${id}/${meta.sound}` }
}

async function deleteCard(id: string) {
  if (!ID_PATTERN.test(id)) throw new HttpError(400, 'รหัสการ์ดไม่ถูกต้อง')
  const dir = path.join(CARDS_DIR, id)
  const info = await stat(dir).catch(() => null)
  if (!info?.isDirectory()) throw new HttpError(404, 'ไม่พบการ์ด')
  await rm(dir, { recursive: true, force: true })
}

/** Finds sound/start.* and sound/during.*, whatever audio format they are in. */
async function listSounds(): Promise<{ start?: string; during?: string }> {
  let files: string[] = []
  try {
    files = await readdir(SOUND_DIR)
  } catch {
    return {}
  }
  const find = (stem: string) =>
    files.find((f) => {
      const ext = path.extname(f).slice(1).toLowerCase()
      return path.basename(f, path.extname(f)).toLowerCase() === stem && AUDIO_EXT.includes(ext)
    })
  const start = find('start')
  const during = find('during')
  return { start: start && `sound/${start}`, during: during && `sound/${during}` }
}

async function serveFile(req: IncomingMessage, res: ServerResponse, dir: string, relPath: string) {
  const file = path.resolve(dir, relPath)
  if (!file.startsWith(dir + path.sep)) throw new HttpError(404, 'Not found')
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

// ---------- Play history ----------

interface HistoryEntry {
  /** Level the game was on when it ended */
  level: number
  /** How many pictures the frame passed over in total */
  cards: number
  /** How long the game lasted, in seconds */
  seconds: number
  /** Why it ended */
  reason: string
}

const REASONS: Record<string, string> = {
  restart: 'กด Restart',
  finish: 'เล่นจบครบทุกด่าน',
  leave: 'ออกจากหน้าเกม',
}

const two = (n: number) => String(n).padStart(2, '0')

/** history/history.txt, one line per game */
async function appendHistory(req: IncomingMessage): Promise<{ file: string; line: string }> {
  const raw = await readBody(req)
  let body: Partial<HistoryEntry>
  try {
    body = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'ข้อมูลไม่ถูกต้อง')
  }

  const num = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)))
  const entry: HistoryEntry = {
    level: num(body.level, 999),
    cards: num(body.cards, 99999),
    seconds: num(body.seconds, 86400),
    reason: REASONS[String(body.reason)] ?? 'จบเกม',
  }

  const now = new Date()
  const date = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
  const time = `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`
  const mmss = `${two(Math.floor(entry.seconds / 60))}:${two(entry.seconds % 60)}`
  const line = `${date} ${time} | ด่าน ${entry.level} | ${entry.cards} รูป | เวลา ${mmss} | ${entry.reason}`

  await mkdir(HISTORY_DIR, { recursive: true })
  await appendFile(HISTORY_FILE, line + '\n', 'utf8')
  return { file: 'history/history.txt', line }
}

const LINE_PATTERN = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) \| ด่าน (\d+) \| (\d+) รูป \| เวลา (\d+):(\d+) \| (.*)$/

/** Most recent games first. */
async function readHistory(limit: number): Promise<unknown[]> {
  const text = await readFile(HISTORY_FILE, 'utf8').catch(() => '')
  const lines = text.split('\n').filter(Boolean).reverse()
  return lines.slice(0, limit).map((raw) => {
    const m = LINE_PATTERN.exec(raw)
    if (!m) return { raw }
    return {
      raw,
      date: m[1],
      time: m[2],
      level: Number(m[3]),
      cards: Number(m[4]),
      seconds: Number(m[5]) * 60 + Number(m[6]),
      reason: m[7],
    }
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 10_000) reject(new HttpError(400, 'ข้อมูลใหญ่เกินไป'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// ---------- Middleware ----------

/** Handles /api/cards, /api/sounds, /api/history, /cards/* and /sound/*. Calls next() for anything else. */
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

    if (pathname === '/api/history') {
      if (req.method === 'POST') return sendJson(res, 201, await appendHistory(req))
      if (req.method === 'GET') return sendJson(res, 200, await readHistory(Math.min(200, Number(url.searchParams.get('limit')) || 20)))
      return sendJson(res, 405, { error: 'Method not allowed' })
    }

    if (pathname === '/api/sounds') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
      return sendJson(res, 200, await listSounds())
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname.startsWith('/cards/')) return await serveFile(req, res, CARDS_DIR, pathname.slice('/cards/'.length))
      if (pathname.startsWith('/sound/')) return await serveFile(req, res, SOUND_DIR, pathname.slice('/sound/'.length))
    }
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message })
    console.error(err)
    return sendJson(res, 500, { error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' })
  }

  next()
}
