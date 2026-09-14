import type { Card } from './types'

const base = import.meta.env.BASE_URL

async function errorMessage(res: Response): Promise<string> {
  try {
    return (await res.json()).error ?? res.statusText
  } catch {
    return res.statusText
  }
}

export async function getAllCards(): Promise<Card[]> {
  const res = await fetch(`${base}api/cards`, { cache: 'no-store' })
  if (!res.ok) throw new Error(await errorMessage(res))
  const cards: Card[] = await res.json()
  return cards.map((c) => ({ ...c, image: base + c.image, sound: c.sound ? base + c.sound : undefined }))
}

/** Uploads a card; the server stores it as its own folder in cards/. */
export async function addCard(label: string, image: Blob, sound?: Blob): Promise<void> {
  const form = new FormData()
  form.append('label', label)
  form.append('image', image)
  if (sound) form.append('sound', sound)
  const res = await fetch(`${base}api/cards`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await errorMessage(res))
}

export async function deleteCard(id: string): Promise<void> {
  const res = await fetch(`${base}api/cards/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await errorMessage(res))
}

/** Downscale uploaded photos before sending. SVG/GIF are kept as-is. */
export async function prepareImage(file: File, maxSize = 512): Promise<Blob> {
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/webp', 0.85))
}
