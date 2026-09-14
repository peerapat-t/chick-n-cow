import { beep, playCard, preloadCardSounds, startMusic, stopCardSound, stopMusic } from './audio'
import { getAllCards } from './cards'
import { btn, esc, qs } from './dom'
import { getSettings } from './settings'
import type { Card } from './types'

type Phase = 'idle' | 'countdown' | 'playing' | 'paused' | 'finished'

/** Random grid where the same card never appears 3 times in a row (when there's a choice). */
function buildSequence(cards: Card[], length: number): Card[] {
  const seq: Card[] = []
  for (let i = 0; i < length; i++) {
    let options = cards
    if (cards.length > 1 && i >= 2 && seq[i - 1].id === seq[i - 2].id) {
      options = cards.filter((c) => c.id !== seq[i - 1].id)
    }
    seq.push(options[Math.floor(Math.random() * options.length)])
  }
  return seq
}

export async function mountGame(root: HTMLElement): Promise<() => void> {
  const settings = getSettings()
  const allCards = await getAllCards()
  const cards = allCards.filter((c) => !settings.disabledIds.includes(c.id))
  const { rows, cols, speedMs } = settings
  const total = rows * cols

  if (cards.length === 0) {
    root.innerHTML = `
      <div class="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <p class="text-5xl">🙈</p>
        <p class="text-lg">ยังไม่ได้เลือกการ์ดเลย</p>
        <a href="#/settings" class="${btn.primary}">ไปที่ตั้งค่า</a>
      </div>`
    return () => {}
  }

  preloadCardSounds(cards)

  root.innerHTML = `
    <div class="flex h-[calc(100dvh-3.5rem)] flex-col gap-2 pb-3">
      <div class="flex shrink-0 flex-wrap items-center justify-center gap-2 sm:justify-between">
        <p class="text-sm text-stone-500 dark:text-stone-400">
          ตาราง ${rows}×${cols} · ${(speedMs / 1000).toFixed(1)} วินาที/รูป
          <span data-progress class="ml-2 font-medium text-emerald-600 dark:text-emerald-400"></span>
        </p>
        <div class="flex gap-2">
          <button data-action="fullscreen" class="${btn.secondary} py-2!" aria-label="เต็มจอ">⛶ เต็มจอ</button>
          <button data-action="pause" class="${btn.secondary} py-2!" disabled>⏸ หยุด</button>
          <button data-action="restart" class="${btn.primary} py-2!">↻ Restart</button>
        </div>
      </div>

      <div class="relative min-h-0 flex-1">
        <div data-grid class="grid h-full gap-1.5 p-1 sm:gap-2.5" style="grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, minmax(0, 1fr))"></div>
        <div data-overlay class="absolute inset-0 flex items-center justify-center rounded-3xl bg-amber-50/70 backdrop-blur-sm dark:bg-stone-900/70"></div>
      </div>
    </div>`

  const grid = qs(root, '[data-grid]')
  const overlay = qs(root, '[data-overlay]')
  const progress = qs(root, '[data-progress]')
  const pauseBtn = qs<HTMLButtonElement>(root, '[data-action="pause"]')

  let phase: Phase = 'idle'
  let sequence: Card[] = []
  let index = -1
  let timer: number | undefined

  const clearTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }

  function renderGrid() {
    grid.innerHTML = sequence
      .map(
        (card, i) => `
        <button data-cell="${i}" aria-label="${esc(card.label)}"
          class="relative min-h-0 min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 outline-none transition duration-200 dark:bg-stone-800 dark:ring-stone-700">
          <img src="${card.image}" alt="" draggable="false" class="h-full w-full select-none object-contain p-[6%]" />
        </button>`,
      )
      .join('')
  }

  function highlight(i: number) {
    grid.querySelectorAll<HTMLElement>('[data-cell]').forEach((cell, n) => {
      const active = n === i
      cell.classList.toggle('ring-[6px]', active)
      cell.classList.toggle('ring-emerald-500!', active)
      cell.classList.toggle('scale-105', active)
      cell.classList.toggle('z-10', active)
      cell.classList.toggle('shadow-xl', active)
      cell.classList.toggle('opacity-50', i >= 0 && n < i)
    })
    progress.textContent = i >= 0 ? `${Math.min(i + 1, total)} / ${total}` : ''
  }

  function showOverlay(html: string) {
    overlay.innerHTML = html
    overlay.hidden = false
  }

  function showStart() {
    showOverlay(`
      <button data-action="start" class="${btn.primary} px-10 py-5 text-2xl shadow-lg animate-pop">▶ เริ่มเล่น</button>`)
  }

  function updateControls() {
    pauseBtn.disabled = phase !== 'playing' && phase !== 'paused'
    pauseBtn.textContent = phase === 'paused' ? '▶ เล่นต่อ' : '⏸ หยุด'
  }

  function setPhase(p: Phase) {
    phase = p
    updateControls()
    if (settings.music && (p === 'countdown' || p === 'playing')) startMusic(settings.musicTrack)
    else stopMusic()
  }

  function countdown(n: number) {
    if (n === 0) {
      showOverlay(`<p class="text-7xl font-bold text-emerald-500 animate-pop sm:text-8xl">เริ่ม!</p>`)
      beep(true)
      timer = window.setTimeout(() => {
        overlay.hidden = true
        setPhase('playing')
        step()
      }, 700)
      return
    }
    showOverlay(`<p class="text-9xl font-bold text-emerald-500 drop-shadow animate-pop" style="font-size: min(10rem, 25vw)">${n}</p>`)
    beep()
    timer = window.setTimeout(() => countdown(n - 1), 1000)
  }

  function step() {
    index++
    if (index >= total) return finish()
    highlight(index)
    if (settings.voice) playCard(sequence[index])
    timer = window.setTimeout(step, speedMs)
  }

  function finish() {
    clearTimer()
    stopCardSound()
    setPhase('finished')
    highlight(-1)
    progress.textContent = `${total} / ${total}`
    showOverlay(`
      <div class="flex flex-col items-center gap-5 text-center animate-pop">
        <p class="text-6xl">🎉</p>
        <p class="text-3xl font-bold">เก่งมาก! อ่านครบ ${total} รูปแล้ว</p>
        <button data-action="restart" class="${btn.primary} px-8 py-4 text-xl shadow-lg">↻ เล่นอีกครั้ง</button>
      </div>`)
  }

  function start() {
    clearTimer()
    stopCardSound()
    sequence = buildSequence(cards, total)
    index = -1
    renderGrid()
    highlight(-1)
    setPhase('countdown')
    countdown(3)
  }

  function togglePause() {
    if (phase === 'playing') {
      clearTimer()
      stopCardSound()
      setPhase('paused')
      showOverlay(`<button data-action="pause" class="${btn.primary} px-10 py-5 text-2xl shadow-lg animate-pop">▶ เล่นต่อ</button>`)
    } else if (phase === 'paused') {
      overlay.hidden = true
      setPhase('playing')
      // Replay the current card, then continue
      if (settings.voice && index >= 0) playCard(sequence[index])
      timer = window.setTimeout(step, speedMs)
    }
  }

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'start' || action === 'restart') return start()
    if (action === 'pause') return togglePause()
    if (action === 'fullscreen') return toggleFullscreen()

    // Tap a card to hear it when the game isn't running
    const cell = target.closest<HTMLElement>('[data-cell]')
    if (cell && phase !== 'countdown' && phase !== 'playing') playCard(sequence[Number(cell.dataset.cell)])
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const fullscreenBtn = qs<HTMLButtonElement>(root, '[data-action="fullscreen"]')
  const onFullscreenChange = () => {
    fullscreenBtn.textContent = document.fullscreenElement ? '✕ ออกจากเต็มจอ' : '⛶ เต็มจอ'
  }
  if (!document.fullscreenEnabled) fullscreenBtn.hidden = true

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.code === 'Space') {
      e.preventDefault()
      if (phase === 'idle' || phase === 'finished') start()
      else togglePause()
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen()
    } else if (e.key === 'r' || e.key === 'R') {
      start()
    }
  }

  root.addEventListener('click', onClick)
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFullscreenChange)

  sequence = buildSequence(cards, total)
  renderGrid()
  showStart()
  updateControls()

  return () => {
    clearTimer()
    stopCardSound()
    stopMusic()
    root.removeEventListener('click', onClick)
    window.removeEventListener('keydown', onKey)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
  }
}
