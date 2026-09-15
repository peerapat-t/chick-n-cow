import { beep, playCard, preloadCardSounds, startMusic, stopCardSound, stopMusic } from './audio'
import { getAllCards } from './cards'
import { btn, esc, qs } from './dom'
import { getSettings } from './settings'
import type { Card } from './types'

interface Level {
  size: number
  /** Time each card stays highlighted, in milliseconds */
  speedMs: number
  speedLabel: string
}

const LEVELS: Level[] = [
  { size: 3, speedMs: 1200, speedLabel: 'ปานกลาง' },
  { size: 4, speedMs: 850, speedLabel: 'เร็ว' },
  { size: 5, speedMs: 600, speedLabel: 'เร็วมาก' },
  { size: 6, speedMs: 450, speedLabel: 'เร็วสุดๆ' },
]

/** Pause between levels (before the next countdown starts) */
const LEVEL_BREAK_MS = 2000

type Phase = 'idle' | 'countdown' | 'playing' | 'paused' | 'break' | 'finished'

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

const levelName = (i: number) => `ด่าน ${i + 1}`
const levelInfo = (l: Level) => `${l.size}×${l.size} · ${l.speedLabel}`

export async function mountGame(root: HTMLElement): Promise<() => void> {
  const settings = getSettings()
  const allCards = await getAllCards()
  const cards = allCards.filter((c) => !settings.disabledIds.includes(c.id))

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
        <div class="flex items-center gap-3 text-sm">
          <div data-levels class="flex gap-1.5"></div>
          <span data-level-info class="text-stone-500 dark:text-stone-400"></span>
          <span data-progress class="font-medium text-emerald-600 tabular-nums dark:text-emerald-400"></span>
        </div>
        <div class="flex gap-2">
          <button data-action="fullscreen" class="${btn.secondary} py-2!" aria-label="เต็มจอ">⛶ เต็มจอ</button>
          <button data-action="pause" class="${btn.secondary} py-2!" disabled>⏸ หยุด</button>
          <button data-action="restart" class="${btn.primary} py-2!">↻ Restart</button>
        </div>
      </div>

      <div class="relative min-h-0 flex-1">
        <div data-grid class="grid h-full gap-1.5 p-1 sm:gap-2.5"></div>
        <div data-overlay class="absolute inset-0 flex items-center justify-center rounded-3xl bg-amber-50/70 backdrop-blur-sm dark:bg-stone-900/70"></div>
      </div>
    </div>`

  const grid = qs(root, '[data-grid]')
  const overlay = qs(root, '[data-overlay]')
  const progress = qs(root, '[data-progress]')
  const levelsEl = qs(root, '[data-levels]')
  const levelInfoEl = qs(root, '[data-level-info]')
  const pauseBtn = qs<HTMLButtonElement>(root, '[data-action="pause"]')
  const fullscreenBtn = qs<HTMLButtonElement>(root, '[data-action="fullscreen"]')

  let phase: Phase = 'idle'
  let levelIndex = 0
  let sequence: Card[] = []
  let index = -1
  let timer: number | undefined

  const level = () => LEVELS[levelIndex]
  const total = () => level().size ** 2

  const clearTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }

  function renderLevelBar() {
    levelsEl.innerHTML = LEVELS.map((_, i) => {
      const cls =
        i < levelIndex || phase === 'finished'
          ? 'bg-emerald-500 text-white'
          : i === levelIndex
            ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400'
      return `<span class="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${cls}">${i + 1}</span>`
    }).join('')
    levelInfoEl.textContent = `${levelName(levelIndex)} · ${levelInfo(level())}`
  }

  /** Shuffles a new grid for the current level. */
  function prepareLevel() {
    const { size } = level()
    sequence = buildSequence(cards, total())
    index = -1
    grid.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`
    grid.style.gridTemplateRows = `repeat(${size}, minmax(0, 1fr))`
    grid.innerHTML = sequence
      .map(
        (card, i) => `
        <button data-cell="${i}" aria-label="${esc(card.label)}"
          class="relative min-h-0 min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 outline-none transition duration-200 dark:bg-stone-800 dark:ring-stone-700">
          <img src="${card.image}" alt="" draggable="false" class="h-full w-full select-none object-contain p-[6%]" />
        </button>`,
      )
      .join('')
    renderLevelBar()
    highlight(-1)
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
    progress.textContent = i >= 0 ? `${Math.min(i + 1, total())} / ${total()}` : ''
  }

  function showOverlay(html: string) {
    overlay.innerHTML = html
    overlay.hidden = false
  }

  function showStart() {
    showOverlay(`
      <div class="flex flex-col items-center gap-5 text-center animate-pop">
        <button data-action="start" class="${btn.primary} px-10 py-5 text-2xl shadow-lg">▶ เริ่มเล่น</button>
        <ol class="flex flex-col gap-1 text-stone-600 dark:text-stone-300">
          ${LEVELS.map((l, i) => `<li><span class="font-semibold">${levelName(i)}</span> · ${levelInfo(l)}</li>`).join('')}
        </ol>
      </div>`)
  }

  function updateControls() {
    pauseBtn.disabled = phase !== 'playing' && phase !== 'paused'
    pauseBtn.textContent = phase === 'paused' ? '▶ เล่นต่อ' : '⏸ หยุด'
  }

  function setPhase(p: Phase) {
    phase = p
    updateControls()
    if (settings.music && (p === 'countdown' || p === 'playing' || p === 'break')) startMusic(settings.musicTrack)
    else stopMusic()
  }

  function countdown(n: number) {
    const title = `<p class="text-2xl font-semibold text-stone-700 dark:text-stone-200">${levelName(levelIndex)} · ${levelInfo(level())}</p>`
    if (n === 0) {
      showOverlay(`<div class="flex flex-col items-center gap-2 text-center">${title}<p class="text-7xl font-bold text-emerald-500 animate-pop sm:text-8xl">เริ่ม!</p></div>`)
      beep(true)
      timer = window.setTimeout(() => {
        overlay.hidden = true
        setPhase('playing')
        step()
      }, 700)
      return
    }
    showOverlay(`
      <div class="flex flex-col items-center gap-2 text-center">
        ${title}
        <p class="font-bold text-emerald-500 drop-shadow animate-pop" style="font-size: min(10rem, 25vw); line-height: 1">${n}</p>
      </div>`)
    beep()
    timer = window.setTimeout(() => countdown(n - 1), 1000)
  }

  function step() {
    index++
    if (index >= total()) return completeLevel()
    highlight(index)
    if (settings.voice) playCard(sequence[index])
    timer = window.setTimeout(step, level().speedMs)
  }

  function completeLevel() {
    clearTimer()
    stopCardSound()
    if (levelIndex === LEVELS.length - 1) return finish()

    const passed = levelIndex
    levelIndex++
    setPhase('break')
    prepareLevel()
    showOverlay(`
      <div class="flex flex-col items-center gap-3 text-center animate-pop">
        <p class="text-6xl">⭐</p>
        <p class="text-3xl font-bold">ผ่าน${levelName(passed)} แล้ว!</p>
        <p class="text-lg text-stone-600 dark:text-stone-300">ต่อไป ${levelName(levelIndex)} · ${levelInfo(level())}</p>
      </div>`)
    timer = window.setTimeout(() => {
      setPhase('countdown')
      countdown(3)
    }, LEVEL_BREAK_MS)
  }

  function finish() {
    setPhase('finished')
    highlight(-1)
    renderLevelBar()
    progress.textContent = ''
    showOverlay(`
      <div class="flex flex-col items-center gap-5 text-center animate-pop">
        <p class="text-6xl">🏆</p>
        <p class="text-3xl font-bold">เก่งมาก! ผ่านครบ ${LEVELS.length} ด่านแล้ว</p>
        <button data-action="restart" class="${btn.primary} px-8 py-4 text-xl shadow-lg">↻ เล่นอีกครั้ง</button>
      </div>`)
  }

  /** Starts (or restarts) from level 1. */
  function start() {
    clearTimer()
    stopCardSound()
    levelIndex = 0
    phase = 'countdown'
    prepareLevel()
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
      timer = window.setTimeout(step, level().speedMs)
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const onFullscreenChange = () => {
    fullscreenBtn.textContent = document.fullscreenElement ? '✕ ออกจากเต็มจอ' : '⛶ เต็มจอ'
  }
  if (!document.fullscreenEnabled) fullscreenBtn.hidden = true

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'start' || action === 'restart') return start()
    if (action === 'pause') return togglePause()
    if (action === 'fullscreen') return toggleFullscreen()

    // Tap a card to hear it when the game isn't running
    const cell = target.closest<HTMLElement>('[data-cell]')
    if (cell && (phase === 'idle' || phase === 'paused' || phase === 'finished')) playCard(sequence[Number(cell.dataset.cell)])
  }

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

  prepareLevel()
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
