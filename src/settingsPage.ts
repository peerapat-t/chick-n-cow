import { isMusicPlaying, playCard, startMusic, stopMusic } from './audio'
import { addCard, deleteCard, getAllCards, prepareImage } from './cards'
import { btn, esc, qs, switchHtml } from './dom'
import { getSettings, resetSettings, updateSettings } from './settings'
import { createTrimmer, type Trimmer } from './trimmer'
import type { Card, MusicTrack, Settings, Theme } from './types'

const section = (title: string, body: string, hint = '') => `
  <section class="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-6 dark:bg-stone-800 dark:ring-stone-700">
    <h2 class="text-lg font-semibold">${title}</h2>
    ${hint ? `<p class="mt-0.5 text-sm text-stone-500 dark:text-stone-400">${hint}</p>` : ''}
    <div class="mt-4">${body}</div>
  </section>`

const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: '☀️ สว่าง' },
  { value: 'dark', label: '🌙 มืด' },
  { value: 'system', label: '💻 ตามระบบ' },
]

const musicTracks: { value: MusicTrack; label: string; hint: string }[] = [
  { value: 'slow', label: '🌙 เพลงช้า', hint: 'นุ่มๆ ผ่อนคลาย' },
  { value: 'normal', label: '🎵 ปกติ', hint: 'สดใส กำลังดี' },
  { value: 'fast', label: '🥁 เร็ว สนุก', hint: 'มีกลอง จังหวะมันส์' },
]

const pill = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'bg-emerald-500 text-white' : 'bg-stone-100 hover:bg-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600'}`

export async function mountSettings(root: HTMLElement): Promise<() => void> {
  let cards: Card[] = await getAllCards()
  let recorder: MediaRecorder | null = null
  /** The recorded/uploaded sound before trimming */
  let rawSound: Blob | null = null
  let trimmer: Trimmer | null = null
  let previewUrls: string[] = []

  const revokePreviews = () => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u))
    previewUrls = []
  }

  function cardsHtml(s: Settings) {
    const enabledCount = cards.filter((c) => !s.disabledIds.includes(c.id)).length
    return `<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      ${cards
        .map((c) => {
          const on = !s.disabledIds.includes(c.id)
          const locked = on && enabledCount === 1
          return `
          <div class="relative flex flex-col items-center gap-2 rounded-2xl p-3 ring-2 transition ${on ? 'ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : 'ring-stone-200 opacity-60 dark:ring-stone-700'}">
            <button type="button" data-preview="${c.id}" class="aspect-square w-full" aria-label="ฟังเสียง ${esc(c.label)}">
              <img src="${c.image}" alt="" class="h-full w-full object-contain" />
            </button>
            <div class="flex w-full items-center justify-between gap-2">
              <span class="truncate font-medium">${esc(c.label)}</span>
              <input type="checkbox" data-card="${c.id}" ${on ? 'checked' : ''} ${locked ? 'disabled title="ต้องมีอย่างน้อย 1 การ์ด"' : ''}
                class="h-5 w-5 accent-emerald-500" aria-label="ใช้การ์ด ${esc(c.label)}" />
            </div>
            <button type="button" data-delete="${c.id}" class="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-sm text-white shadow hover:bg-rose-600" aria-label="ลบการ์ด ${esc(c.label)}">✕</button>
          </div>`
        })
        .join('')}
    </div>`
  }

  /** Re-renders the page. The add-card form keeps its state (inputs, recording, trimmer) unless resetForm is set. */
  function render(resetForm = false) {
    const s = getSettings()
    const keptForm = resetForm ? null : root.querySelector('[data-add-section]')
    root.innerHTML = `
      <div class="mx-auto flex max-w-3xl flex-col gap-5 pt-2 pb-10">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold">⚙️ ตั้งค่า</h1>
          <a href="#/" class="${btn.primary}">▶ ไปเล่นเกม</a>
        </div>

        ${section('1. การ์ดที่ใช้ในเกม', cardsHtml(s), 'ติ๊กเลือกการ์ดที่ต้องการ · แตะที่รูปเพื่อฟังเสียง')}

        <div data-add-section>${section(
          '2. เพิ่มการ์ดของฉัน',
          `<form data-add class="flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">ชื่อการ์ด</span>
              <input name="label" required maxlength="30" placeholder="เช่น หมู"
                class="rounded-xl border-0 bg-stone-100 px-4 py-2.5 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-stone-900 dark:ring-stone-700" />
            </label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium">รูปภาพ</span>
                <input name="image" type="file" accept="image/*" required
                  class="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:font-medium file:text-emerald-700 dark:file:bg-emerald-900 dark:file:text-emerald-200" />
                <img data-image-preview hidden class="mt-2 h-24 w-24 rounded-xl object-contain ring-1 ring-stone-200 dark:ring-stone-700" alt="" />
              </label>
              <div class="flex flex-col gap-1">
                <span class="text-sm font-medium">เสียง (ไม่บังคับ)</span>
                <input name="sound" type="file" accept="audio/*"
                  class="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:font-medium file:text-emerald-700 dark:file:bg-emerald-900 dark:file:text-emerald-200" />
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" data-record class="${btn.secondary} py-2! text-sm">🎙️ อัดเสียง</button>
                  <button type="button" data-clear-sound hidden class="text-sm text-stone-500 underline-offset-4 hover:underline dark:text-stone-400">ไม่ใช้เสียง</button>
                </div>
              </div>
            </div>
            <div data-trimmer></div>
            <p data-add-error class="text-sm text-rose-500" hidden></p>
            <div><button type="submit" class="${btn.primary}">＋ เพิ่มการ์ด</button></div>
          </form>`,
        )}</div>

        ${section(
          '3. ธีม',
          `<div class="flex flex-wrap gap-2">
            ${themes.map((t) => `<button type="button" data-theme-option="${t.value}" class="${pill(s.theme === t.value)}">${t.label}</button>`).join('')}
          </div>`,
        )}

        ${section(
          '4. ดนตรีประกอบ',
          `<div class="flex flex-col gap-4">
            <div class="flex items-center justify-between gap-4">
              <p class="text-sm text-stone-500 dark:text-stone-400">เล่นเพลงระหว่างเกม</p>
              ${switchHtml('music', s.music, 'ดนตรีประกอบ')}
            </div>
            <div class="grid gap-2 sm:grid-cols-3 ${s.music ? '' : 'pointer-events-none opacity-40'}">
              ${musicTracks
                .map(
                  (t) => `
                <button type="button" data-music-track="${t.value}" aria-pressed="${s.musicTrack === t.value}"
                  class="flex flex-col items-start rounded-2xl px-4 py-3 text-left ring-2 transition ${s.musicTrack === t.value ? 'bg-emerald-50 ring-emerald-500 dark:bg-emerald-950/40' : 'ring-stone-200 hover:bg-stone-50 dark:ring-stone-700 dark:hover:bg-stone-700/50'}">
                  <span class="font-medium">${t.label}</span>
                  <span class="text-sm text-stone-500 dark:text-stone-400">${t.hint}</span>
                </button>`,
                )
                .join('')}
            </div>
            <div class="${s.music ? '' : 'pointer-events-none opacity-40'}">
              <button type="button" data-music-preview class="${btn.secondary} py-2! text-sm">${isMusicPlaying() ? '⏹ หยุดฟัง' : '▶ ฟังตัวอย่างเพลง'}</button>
            </div>
          </div>`,
        )}

        ${section(
          'เสียง',
          `<div class="flex flex-col gap-4">
            <div class="flex items-center justify-between gap-4">
              <div><p class="font-medium">5. ช่วยออกเสียง</p><p class="text-sm text-stone-500 dark:text-stone-400">อ่านชื่อการ์ดทุกครั้งที่กรอบเขียววิ่งมาถึง</p></div>
              ${switchHtml('voice', s.voice, 'ช่วยออกเสียง')}
            </div>
          </div>`,
        )}

        <div class="flex justify-center">
          <button type="button" data-reset class="text-sm text-stone-500 underline-offset-4 hover:underline dark:text-stone-400">คืนค่าเริ่มต้น</button>
        </div>
      </div>`
    if (keptForm) root.querySelector('[data-add-section]')!.replaceWith(keptForm)
  }

  async function reloadCards() {
    cards = await getAllCards()
    render()
  }

  const set = (patch: Partial<Settings>) => {
    updateSettings(patch)
    render()
  }

  const onClick = async (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!t) return
    const s = getSettings()

    if (t.dataset.themeOption) {
      set({ theme: t.dataset.themeOption as Theme })
    } else if (t.dataset.switch) {
      const key = t.dataset.switch as 'music' | 'voice'
      if (key === 'music' && s.music) stopMusic()
      set({ [key]: !s[key] })
    } else if (t.dataset.musicTrack) {
      const track = t.dataset.musicTrack as MusicTrack
      if (isMusicPlaying()) startMusic(track)
      set({ musicTrack: track })
    } else if (t.dataset.musicPreview !== undefined) {
      if (isMusicPlaying()) stopMusic()
      else startMusic(s.musicTrack)
      render()
    } else if (t.dataset.clearSound !== undefined) {
      clearSound()
    } else if (t.dataset.preview) {
      const card = cards.find((c) => c.id === t.dataset.preview)
      if (card) playCard(card)
    } else if (t.dataset.delete) {
      const card = cards.find((c) => c.id === t.dataset.delete)
      if (!card || !confirm(`ลบการ์ด "${card.label}" ? (ลบโฟลเดอร์ใน cards/ ด้วย)`)) return
      try {
        await deleteCard(card.id)
      } catch (err) {
        return alert(`ลบไม่สำเร็จ: ${(err as Error).message}`)
      }
      updateSettings({ disabledIds: s.disabledIds.filter((id) => id !== card.id) })
      await reloadCards()
    } else if (t.dataset.reset !== undefined) {
      if (confirm('คืนค่าการตั้งค่าทั้งหมดเป็นค่าเริ่มต้น? (การ์ดที่เพิ่มไว้จะยังอยู่)')) set(resetSettings())
    } else if (t.dataset.record !== undefined) {
      await toggleRecording(t)
    }
  }

  async function toggleRecording(button: HTMLElement) {
    if (recorder) {
      recorder.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (ev) => chunks.push(ev.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        const recorded = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
        recorder = null
        const input = root.querySelector<HTMLInputElement>('input[name="sound"]')
        if (input) input.value = ''
        void setSound(recorded)
        button.textContent = '🎙️ อัดใหม่'
        button.classList.remove('bg-rose-500!', 'text-white!')
      }
      recorder.start()
      button.textContent = '⏹ หยุดอัด'
      button.classList.add('bg-rose-500!', 'text-white!')
    } catch {
      showError('ไม่สามารถใช้ไมโครโฟนได้')
    }
  }

  /** Shows the trim editor for a freshly recorded or uploaded sound. */
  async function setSound(blob: Blob) {
    trimmer?.destroy()
    trimmer = null
    rawSound = blob
    showError('')
    qs(root, '[data-clear-sound]').hidden = false
    try {
      trimmer = await createTrimmer(qs(root, '[data-trimmer]'), blob)
    } catch (err) {
      console.warn('Cannot decode audio for trimming', err)
      showError('เปิดไฟล์เสียงนี้เพื่อตัดไม่ได้ จะใช้เสียงทั้งไฟล์แทน')
    }
  }

  function clearSound() {
    trimmer?.destroy()
    trimmer = null
    rawSound = null
    const input = root.querySelector<HTMLInputElement>('input[name="sound"]')
    if (input) input.value = ''
    qs(root, '[data-clear-sound]').hidden = true
    showError('')
  }

  function showError(msg: string) {
    const el = qs(root, '[data-add-error]')
    el.textContent = msg
    el.hidden = !msg
  }

  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement
    const s = getSettings()
    if (t.dataset.card) {
      const disabled = new Set(s.disabledIds)
      if (t.checked) disabled.delete(t.dataset.card)
      else disabled.add(t.dataset.card)
      set({ disabledIds: [...disabled] })
    } else if (t.name === 'image' && t.files?.[0]) {
      const img = qs<HTMLImageElement>(root, '[data-image-preview]')
      const url = URL.createObjectURL(t.files[0])
      previewUrls.push(url)
      img.src = url
      img.hidden = false
    } else if (t.name === 'sound' && t.files?.[0]) {
      void setSound(t.files[0])
    }
  }

  const onSubmit = async (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement
    if (form.dataset.add === undefined) return
    e.preventDefault()
    const data = new FormData(form)
    const label = String(data.get('label') ?? '').trim()
    const image = data.get('image') as File | null

    if (!label) return showError('กรุณาใส่ชื่อการ์ด')
    if (!image || image.size === 0) return showError('กรุณาเลือกรูปภาพ')

    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
    submit.disabled = true
    try {
      const sound = trimmer ? await trimmer.export() : (rawSound ?? undefined)
      if (sound && sound.size > 5 * 1024 * 1024) throw new Error('ไฟล์เสียงใหญ่เกินไป (สูงสุด 5MB)')
      await addCard(label, await prepareImage(image), sound)
      trimmer?.destroy()
      trimmer = null
      rawSound = null
      revokePreviews()
      cards = await getAllCards()
      render(true)
    } catch (err) {
      console.error(err)
      showError(`บันทึกการ์ดไม่สำเร็จ: ${(err as Error).message}`)
      submit.disabled = false
    }
  }

  render()
  root.addEventListener('click', onClick)
  root.addEventListener('change', onChange)
  root.addEventListener('submit', onSubmit)

  return () => {
    recorder?.stop()
    trimmer?.destroy()
    stopMusic()
    revokePreviews()
    root.removeEventListener('click', onClick)
    root.removeEventListener('change', onChange)
    root.removeEventListener('submit', onSubmit)
  }
}
