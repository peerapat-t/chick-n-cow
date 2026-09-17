import { loadGameSounds, playCardSound } from './audio'
import { addCard, deleteCard, getAllCards, prepareImage } from './cards'
import { btn, esc, qs, switchHtml } from './dom'
import { DIFFICULTIES } from './game'
import { addCardToAllPools, DEFAULT_SETTINGS, getSettings, syncPoolsWithCards, updateSettings } from './settings'
import { createTrimmer, type Trimmer } from './trimmer'
import { LEVEL_COUNT, type Card, type Difficulty, type GameSounds, type Settings, type Theme } from './types'

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

const pill = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'bg-emerald-500 text-white' : 'bg-stone-100 hover:bg-stone-200 dark:bg-stone-700 dark:hover:bg-stone-600'}`

export async function mountSettings(root: HTMLElement): Promise<() => void> {
  let cards: Card[] = await getAllCards()
  let sounds: GameSounds = await loadGameSounds()
  let recorder: MediaRecorder | null = null
  /** The recorded or uploaded clip, before trimming */
  let rawSound: Blob | null = null
  let trimmer: Trimmer | null = null
  let previewUrls: string[] = []
  syncPoolsWithCards(cards.map((c) => c.id))

  /** What the page is editing. Nothing is kept until Save is pressed (cards themselves save right away). */
  const copy = (from: Settings): Settings => ({ ...from, levelPools: from.levelPools.map((p) => [...p]) })
  let draft = copy(getSettings())
  let dirty = false

  function editDraft(patch: Partial<Settings>) {
    draft = { ...draft, ...patch }
    dirty = true
    render()
  }

  /** Same clean-up as syncPoolsWithCards, applied to the draft */
  function syncDraftWithCards() {
    const ids = cards.map((c) => c.id)
    const pools = draft.levelPools.map((pool) => {
      const kept = [...new Set(pool.filter((id) => ids.includes(id)))]
      return kept.length > 0 ? kept : [...ids]
    })
    draft = { ...draft, levelPools: pools }
  }

  function save() {
    updateSettings(copy(draft))
    dirty = false
    render()
  }

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty) e.preventDefault()
  }

  const revokePreviews = () => {
    previewUrls.forEach((u) => URL.revokeObjectURL(u))
    previewUrls = []
  }

  const cardById = (id: string) => cards.find((c) => c.id === id)

  // ---------- markup ----------

  /** A card in the "all cards" tray: drag it onto a level, or delete it entirely. */
  function trayCardHtml(c: Card) {
    return `
      <div class="relative">
        <div data-drag-card="${c.id}" data-drag-from="tray" tabindex="0"
          class="flex w-24 cursor-grab touch-none flex-col items-center gap-1 rounded-2xl bg-stone-50 p-2 ring-1 ring-stone-200 select-none active:cursor-grabbing dark:bg-stone-900 dark:ring-stone-700">
          <img src="${c.image}" alt="" draggable="false" class="h-16 w-full object-contain" />
          <span class="w-full truncate text-center text-xs font-medium">${esc(c.label)}</span>
          ${
            c.sound
              ? `<button type="button" data-play="${c.id}" class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">🔊 ฟัง</button>`
              : `<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">ไม่มีเสียง</span>`
          }
        </div>
        <button type="button" data-delete="${c.id}" aria-label="ลบการ์ด ${esc(c.label)}"
          class="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs text-white shadow hover:bg-rose-600">✕</button>
      </div>`
  }

  /** A card chip inside one level's pool */
  function chipHtml(c: Card, levelIndex: number) {
    return `
      <span data-drag-card="${c.id}" data-drag-from="${levelIndex}"
        class="inline-flex cursor-grab touch-none items-center gap-1 rounded-full bg-emerald-50 py-1 pr-1 pl-2 ring-1 ring-emerald-300 select-none active:cursor-grabbing dark:bg-emerald-950/50 dark:ring-emerald-800">
        <img src="${c.image}" alt="" draggable="false" class="h-7 w-7 object-contain" />
        <span class="text-sm font-medium">${esc(c.label)}</span>
        <button type="button" data-remove="${levelIndex}:${c.id}" aria-label="เอา ${esc(c.label)} ออกจากด่าน ${levelIndex + 1}"
          class="flex h-5 w-5 items-center justify-center rounded-full text-stone-400 hover:bg-rose-500 hover:text-white">✕</button>
      </span>`
  }

  function levelRowHtml(s: Settings, i: number) {
    const pool = s.levelPools[i] ?? []
    const missing = cards.filter((c) => !pool.includes(c.id))
    return `
      <div data-drop="${i}" class="rounded-2xl p-3 ring-1 ring-stone-200 transition dark:ring-stone-700">
        <div class="flex items-baseline justify-between gap-2">
          <span class="font-semibold">ด่าน ${i + 1}</span>
          <span class="text-xs text-stone-500 tabular-nums dark:text-stone-400">${pool.length} รูป</span>
        </div>
        <div class="mt-2 flex min-h-12 flex-wrap items-center gap-2">
          ${pool.map((id) => cardById(id)).filter((c): c is Card => Boolean(c)).map((c) => chipHtml(c, i)).join('')}
          ${
            missing.length > 0
              ? `<details class="relative">
                  <summary class="cursor-pointer list-none rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600">＋ เพิ่ม</summary>
                  <div class="absolute left-0 z-20 mt-1 flex w-52 flex-wrap gap-1 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
                    ${missing
                      .map(
                        (c) => `<button type="button" data-add-to="${i}:${c.id}"
                          class="flex items-center gap-1 rounded-full px-2 py-1 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950">
                          <img src="${c.image}" alt="" class="h-6 w-6 object-contain" />${esc(c.label)}</button>`,
                      )
                      .join('')}
                  </div>
                </details>`
              : ''
          }
        </div>
      </div>`
  }

  function soundStatus() {
    const row = (label: string, url: string | undefined, hint: string) => `
      <li class="flex flex-wrap items-center gap-2">
        <span class="font-medium">${label}</span>
        ${
          url
            ? `<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">พบไฟล์</span>
               <audio controls src="${url}" class="h-8 max-w-full"></audio>`
            : `<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">ยังไม่มีไฟล์</span>
               <span class="text-sm text-stone-500 dark:text-stone-400">${hint}</span>`
        }
      </li>`
    return `<ul class="flex flex-col gap-3">
      ${row('เสียงก่อนเริ่ม (sound/start)', sounds.start, 'วางไฟล์ชื่อ start.mp3 ในโฟลเดอร์ sound/')}
      ${row('เสียงระหว่างเล่น (sound/during)', sounds.during, 'วางไฟล์ชื่อ during.mp3 ในโฟลเดอร์ sound/')}
    </ul>`
  }

  /** Re-renders the page. The add-card form keeps what you typed unless resetForm is set. */
  function render(resetForm = false) {
    const s = draft
    const keptForm = resetForm ? null : root.querySelector('[data-add-section]')
    root.innerHTML = `
      <div class="mx-auto flex max-w-5xl flex-col gap-5 pt-2 pb-10">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold">⚙️ ตั้งค่า</h1>
        </div>

        ${section(
          '1. คลังรูปทั้งหมด',
          cards.length
            ? `<div data-drop="tray" class="flex flex-wrap gap-3 rounded-2xl p-2 transition">${cards.map(trayCardHtml).join('')}</div>`
            : `<p class="text-stone-500 dark:text-stone-400">ยังไม่มีการ์ด เพิ่มได้ที่หัวข้อ 3</p>`,
          'ลากรูปจากตรงนี้ไปใส่ด่านที่ต้องการ · ปุ่ม ✕ คือลบการ์ดถาวร',
        )}

        ${section(
          `2. รูปของแต่ละด่าน (${LEVEL_COUNT} ด่าน)`,
          `<div class="flex flex-col gap-3">${Array.from({ length: LEVEL_COUNT }, (_, i) => levelRowHtml(s, i)).join('')}</div>
           <p data-pool-error class="mt-3 text-sm text-rose-500" hidden></p>`,
          'ลากรูปเข้า-ออกได้อิสระ · ลากออกมานอกด่าน (หรือกด ✕) เพื่อเอาออก · ทุกด่านต้องมีอย่างน้อย 1 รูป',
        )}

        <div data-add-section>${section(
          '3. เพิ่มการ์ดของฉัน',
          `<form data-add class="flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">ชื่อการ์ด</span>
              <input name="label" required maxlength="30" placeholder="เช่น หมู"
                class="rounded-xl border-0 bg-stone-100 px-4 py-2.5 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-stone-900 dark:ring-stone-700" />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-sm font-medium">รูปภาพ</span>
              <input name="image" type="file" accept="image/*" required
                class="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:font-medium file:text-emerald-700 dark:file:bg-emerald-900 dark:file:text-emerald-200" />
              <img data-image-preview hidden class="mt-2 h-24 w-24 rounded-xl object-contain ring-1 ring-stone-200 dark:ring-stone-700" alt="" />
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-sm font-medium">เสียงอ่านชื่อการ์ด (จำเป็น)</span>
              <div class="flex flex-wrap items-center gap-2">
                <input name="sound" type="file" accept="audio/*"
                  class="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-emerald-100 file:px-4 file:py-2 file:font-medium file:text-emerald-700 dark:file:bg-emerald-900 dark:file:text-emerald-200" />
                <button type="button" data-record class="${btn.secondary} py-2! text-sm">🎙️ อัดเสียง</button>
                <button type="button" data-clear-sound hidden class="text-sm text-stone-500 underline-offset-4 hover:underline dark:text-stone-400">ล้างเสียง</button>
              </div>
            </div>
            <div data-trimmer></div>
            <p data-add-error class="text-sm text-rose-500" hidden></p>
            <div><button type="submit" class="${btn.primary}">＋ เพิ่มการ์ด</button></div>
          </form>`,
          'อัปโหลดหรืออัดเสียงอ่านชื่อการ์ด แล้วตัดเฉพาะช่วงที่ต้องการ · การ์ดใหม่จะถูกใส่ไว้ในทุกด่านให้อัตโนมัติ',
        )}</div>

        ${section(
          '4. ความยาก',
          `<div class="flex flex-wrap gap-2">
            ${DIFFICULTIES.map((d) => `<button type="button" data-difficulty-option="${d.value}" class="${pill(s.difficulty === d.value)}">${d.label}</button>`).join('')}
          </div>`,
          'Easy ความเร็วคงที่ทุกด่าน · Medium ค่อย ๆ เร็วขึ้น · Hard เร่งเร็วขึ้นมาก',
        )}

        ${section(
          '5. ธีม',
          `<div class="flex flex-wrap gap-2">
            ${themes.map((t) => `<button type="button" data-theme-option="${t.value}" class="${pill(s.theme === t.value)}">${t.label}</button>`).join('')}
          </div>`,
        )}

        ${section(
          '6. เสียง',
          `<div class="flex flex-col gap-5">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="font-medium">เสียงเกม (start / during)</p>
                <p class="text-sm text-stone-500 dark:text-stone-400">ยิ่งด่านสูง เสียง during จะเร่งเร็วขึ้นตามความไวของเกม</p>
              </div>
              ${switchHtml('sound', s.sound, 'เสียงเกม')}
            </div>
            ${soundStatus()}
            <div class="flex items-center justify-between gap-4 border-t border-stone-200 pt-4 dark:border-stone-700">
              <p class="font-medium">เสียงนกหวีดตอนกรอบเลื่อน</p>
              ${switchHtml('whistle', s.whistle, 'เสียงนกหวีด')}
            </div>
          </div>`,
        )}

        <div class="sticky bottom-3 z-20 flex items-center justify-end gap-3 rounded-3xl bg-white/90 p-3 shadow-lg ring-1 ring-stone-200 backdrop-blur dark:bg-stone-800/90 dark:ring-stone-700">
          <span class="text-sm ${dirty ? 'text-amber-600 dark:text-amber-400' : 'text-stone-500 dark:text-stone-400'}">
            ${dirty ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'บันทึกแล้ว ✓'}
          </span>
          <button type="button" data-save class="${btn.primary} px-8" ${dirty ? '' : 'disabled'}>💾 Save setting</button>
        </div>

        <div class="flex justify-center">
          <button type="button" data-reset class="text-sm text-stone-500 underline-offset-4 hover:underline dark:text-stone-400">คืนค่าเริ่มต้น (ทุกด่านใช้ทุกรูป)</button>
        </div>
      </div>`
    if (keptForm) root.querySelector('[data-add-section]')!.replaceWith(keptForm)
  }

  // ---------- pool editing ----------

  function poolError(msg: string) {
    const el = root.querySelector<HTMLElement>('[data-pool-error]')
    if (!el) return
    el.textContent = msg
    el.hidden = !msg
  }

  function setPools(pools: string[][]) {
    editDraft({ levelPools: pools })
  }

  function addToLevel(levelIndex: number, cardId: string) {
    const pools = draft.levelPools.map((p) => [...p])
    if (pools[levelIndex].includes(cardId)) return
    pools[levelIndex].push(cardId)
    setPools(pools)
  }

  /** Removing the last card of a level is refused: every level needs at least one. */
  function removeFromLevel(levelIndex: number, cardId: string): boolean {
    const pools = draft.levelPools.map((p) => [...p])
    if (!pools[levelIndex].includes(cardId)) return false
    if (pools[levelIndex].length <= 1) {
      poolError(`ด่าน ${levelIndex + 1} ต้องมีอย่างน้อย 1 รูป`)
      return false
    }
    pools[levelIndex] = pools[levelIndex].filter((id) => id !== cardId)
    setPools(pools)
    return true
  }

  function moveBetweenLevels(from: number, to: number, cardId: string) {
    const pools = draft.levelPools.map((p) => [...p])
    if (pools[from].length <= 1) {
      poolError(`ด่าน ${from + 1} ต้องมีอย่างน้อย 1 รูป`)
      return
    }
    pools[from] = pools[from].filter((id) => id !== cardId)
    if (!pools[to].includes(cardId)) pools[to].push(cardId)
    setPools(pools)
  }

  // ---------- drag & drop (pointer events, so it works on touch too) ----------

  let drag: { cardId: string; from: string; ghost: HTMLElement; pointerId: number } | null = null
  let pressed: { cardId: string; from: string; x: number; y: number; el: HTMLElement; pointerId: number } | null = null

  const dropZoneAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]') ?? null

  function highlightZone(zone: HTMLElement | null) {
    root.querySelectorAll<HTMLElement>('[data-drop]').forEach((el) => {
      const on = el === zone
      el.classList.toggle('bg-emerald-50', on)
      el.classList.toggle('ring-emerald-500', on)
      el.classList.toggle('dark:bg-emerald-950/40', on)
    })
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-drag-card]')
    if (!el || (e.target as HTMLElement).closest('button')) return
    pressed = { cardId: el.dataset.dragCard!, from: el.dataset.dragFrom!, x: e.clientX, y: e.clientY, el, pointerId: e.pointerId }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (pressed && !drag && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > 6) {
      const ghost = pressed.el.cloneNode(true) as HTMLElement
      ghost.classList.add('pointer-events-none', 'fixed', 'z-50', 'opacity-80', 'shadow-xl')
      ghost.style.width = `${pressed.el.offsetWidth}px`
      document.body.append(ghost)
      document.body.classList.add('select-none')
      drag = { cardId: pressed.cardId, from: pressed.from, ghost, pointerId: pressed.pointerId }
      poolError('')
    }
    if (!drag || e.pointerId !== drag.pointerId) return
    e.preventDefault()
    drag.ghost.style.left = `${e.clientX - drag.ghost.offsetWidth / 2}px`
    drag.ghost.style.top = `${e.clientY - drag.ghost.offsetHeight / 2}px`
    highlightZone(dropZoneAt(e.clientX, e.clientY))
  }

  const onPointerUp = (e: PointerEvent) => {
    pressed = null
    if (!drag || e.pointerId !== drag.pointerId) return
    const { cardId, from, ghost } = drag
    drag = null
    ghost.remove()
    document.body.classList.remove('select-none')
    const zone = dropZoneAt(e.clientX, e.clientY)
    highlightZone(null)

    const target = zone?.dataset.drop
    if (from === 'tray') {
      // From the tray: dropping on a level adds it; anywhere else does nothing
      if (target && target !== 'tray') addToLevel(Number(target), cardId)
      return
    }
    const fromLevel = Number(from)
    if (!target || target === 'tray') removeFromLevel(fromLevel, cardId)
    else if (Number(target) !== fromLevel) moveBetweenLevels(fromLevel, Number(target), cardId)
  }

  // ---------- other interaction ----------

  const onClick = async (e: MouseEvent) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!t) return

    if (t.dataset.save !== undefined) {
      save()
    } else if (t.dataset.difficultyOption) {
      editDraft({ difficulty: t.dataset.difficultyOption as Difficulty })
    } else if (t.dataset.themeOption) {
      editDraft({ theme: t.dataset.themeOption as Theme })
    } else if (t.dataset.switch) {
      const key = t.dataset.switch as 'sound' | 'whistle'
      editDraft({ [key]: !draft[key] })
    } else if (t.dataset.addTo) {
      const [levelIndex, cardId] = t.dataset.addTo.split(':')
      addToLevel(Number(levelIndex), cardId)
    } else if (t.dataset.remove) {
      const [levelIndex, cardId] = t.dataset.remove.split(':')
      removeFromLevel(Number(levelIndex), cardId)
    } else if (t.dataset.play) {
      const card = cardById(t.dataset.play)
      if (card?.sound) playCardSound(card.sound)
    } else if (t.dataset.record !== undefined) {
      await toggleRecording(t)
    } else if (t.dataset.clearSound !== undefined) {
      clearSound()
    } else if (t.dataset.delete) {
      const card = cardById(t.dataset.delete)
      if (!card || !confirm(`ลบการ์ด "${card.label}" ? (ลบโฟลเดอร์ใน cards/ และเอาออกจากทุกด่าน)`)) return
      try {
        await deleteCard(card.id)
      } catch (err) {
        return alert(`ลบไม่สำเร็จ: ${(err as Error).message}`)
      }
      cards = await getAllCards()
      syncPoolsWithCards(cards.map((c) => c.id))
      syncDraftWithCards()
      render()
    } else if (t.dataset.reset !== undefined) {
      if (confirm('คืนค่าการตั้งค่าทั้งหมด? (การ์ดยังอยู่ครบ ทุกด่านจะใช้ทุกรูป)')) {
        editDraft({ ...copy(DEFAULT_SETTINGS), levelPools: Array.from({ length: LEVEL_COUNT }, () => cards.map((c) => c.id)) })
      }
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
      addError('ไม่สามารถใช้ไมโครโฟนได้')
    }
  }

  /** Shows the trim editor for a freshly recorded or uploaded clip. */
  async function setSound(blob: Blob) {
    trimmer?.destroy()
    trimmer = null
    rawSound = blob
    addError('')
    qs(root, '[data-clear-sound]').hidden = false
    try {
      trimmer = await createTrimmer(qs(root, '[data-trimmer]'), blob)
    } catch (err) {
      console.warn('Cannot decode audio for trimming', err)
      addError('เปิดไฟล์เสียงนี้เพื่อตัดไม่ได้ จะใช้เสียงทั้งไฟล์แทน')
    }
  }

  function clearSound() {
    trimmer?.destroy()
    trimmer = null
    rawSound = null
    const input = root.querySelector<HTMLInputElement>('input[name="sound"]')
    if (input) input.value = ''
    qs(root, '[data-clear-sound]').hidden = true
    addError('')
  }

  function addError(msg: string) {
    const el = qs(root, '[data-add-error]')
    el.textContent = msg
    el.hidden = !msg
  }

  const onChange = (e: Event) => {
    const t = e.target as HTMLInputElement
    if (t.name === 'sound' && t.files?.[0]) {
      void setSound(t.files[0])
    } else if (t.name === 'image' && t.files?.[0]) {
      const img = qs<HTMLImageElement>(root, '[data-image-preview]')
      const url = URL.createObjectURL(t.files[0])
      previewUrls.push(url)
      img.src = url
      img.hidden = false
    }
  }

  const onSubmit = async (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement
    if (form.dataset.add === undefined) return
    e.preventDefault()
    const data = new FormData(form)
    const label = String(data.get('label') ?? '').trim()
    const image = data.get('image') as File | null
    const showError = addError

    if (!label) return showError('กรุณาใส่ชื่อการ์ด')
    if (!image || image.size === 0) return showError('กรุณาเลือกรูปภาพ')
    if (!rawSound) return showError('กรุณาใส่เสียงอ่านชื่อการ์ด (อัปโหลดไฟล์หรือกดอัดเสียง)')

    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!
    submit.disabled = true
    try {
      const before = new Set(cards.map((c) => c.id))
      const sound = trimmer ? await trimmer.export() : rawSound!
      await addCard(label, await prepareImage(image), sound)
      trimmer?.destroy()
      trimmer = null
      rawSound = null
      revokePreviews()
      cards = await getAllCards()
      for (const c of cards) {
        if (before.has(c.id)) continue
        addCardToAllPools(c.id)
        draft = { ...draft, levelPools: draft.levelPools.map((pool) => (pool.includes(c.id) ? pool : [...pool, c.id])) }
      }
      render(true)
    } catch (err) {
      console.error(err)
      showError(`บันทึกการ์ดไม่สำเร็จ: ${(err as Error).message}`)
      submit.disabled = false
    }
  }

  render()
  window.addEventListener('beforeunload', onBeforeUnload)
  root.addEventListener('click', onClick)
  root.addEventListener('change', onChange)
  root.addEventListener('submit', onSubmit)
  root.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)

  // Pick up sound files that were added while the page is open
  const soundPoll = window.setInterval(async () => {
    const found = await loadGameSounds()
    if (found.start !== sounds.start || found.during !== sounds.during) {
      sounds = found
      render()
    }
  }, 10000)

  return () => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    recorder?.stop()
    trimmer?.destroy()
    clearInterval(soundPoll)
    drag?.ghost.remove()
    document.body.classList.remove('select-none')
    revokePreviews()
    root.removeEventListener('click', onClick)
    root.removeEventListener('change', onChange)
    root.removeEventListener('submit', onSubmit)
    root.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  }
}
