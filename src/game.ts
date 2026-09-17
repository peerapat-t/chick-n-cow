import {
  audioNow,
  beep,
  duringDuration,
  hasStartSound,
  loadGameSounds,
  scheduleDuringSound,
  scheduleStartSound,
  startDuration,
  stopDuringSound,
  stopStartSound,
  whistle,
} from './audio'
import { getAllCards } from './cards'
import { btn, esc, qs } from './dom'
import { saveRunHistory, type RunResult } from './history'
import { getSettings, syncPoolsWithCards } from './settings'
import { CELLS, COLS, LEVEL_COUNT, ROWS, type Card, type Difficulty } from './types'

/** Card speeds used only when there is no sound/during.* file to take the timing from */
const START_SPEED_MS = 1400
const END_SPEED_MS = 450

/** Easy keeps every level at this time per card */
const EASY_STEP_MS = 320

/**
 * How fast the sounds are played on medium and hard: 1× on level 1, `end`× on the last level.
 * `curve` shapes the climb between those two. Above 1 the early levels speed up gently and
 * the jumps get bigger later, which keeps levels 2-4 close to the pace of level 1.
 */
const CLIMB: Record<Exclude<Difficulty, 'easy'>, { end: number; curve: number }> = {
  medium: { end: 2.2, curve: 1.4 },
  hard: { end: 3.2, curve: 1 },
}

export const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

/** No frame at all for this share of the sound — the get-ready part... */
const INTRO_SHARE = 0.5
/** ...then the frame walks every card over the rest of it, ending exactly with the sound. */
const MAIN_SHARE = 1 - INTRO_SHARE

/** One count of the 3-2-1 when there is no start sound to pace it */
const DEFAULT_COUNT_MS = 1000

/** The level sound fades out this quickly if a level is cut short */
const LEVEL_FADE_MS = 200

/** 0 on level 1 up to 1 on the last level, bent by the difficulty's curve */
const climbOf = (level: number, { curve }: { curve: number }) => ((level - 1) / (LEVEL_COUNT - 1)) ** curve

export interface LevelTiming {
  /** Playback rate of the sounds */
  rate: number
  /** How long the grid shows with no frame before the first card, in ms */
  holdMs: number
  /** Time per card once the frame appears, in ms */
  stepMs: number
  /** Length of the whole level, in ms */
  totalMs: number
}

/**
 * One level lasts exactly one play of sound/during.*: no frame during the intro, then the
 * frame covers all the cards over the rest of it, finishing as the sound ends.
 * With no sound file it falls back to fixed card speeds.
 */
export function levelTiming(level: number, difficulty: Difficulty = getSettings().difficulty): LevelTiming {
  const seconds = duringDuration()
  if (difficulty === 'easy') {
    if (!seconds) return { rate: 1, holdMs: EASY_STEP_MS, stepMs: EASY_STEP_MS, totalMs: EASY_STEP_MS * (CELLS + 1) }
    // Play the sound at whatever tempo makes the cards land on EASY_STEP_MS
    const playMs = (EASY_STEP_MS * CELLS) / MAIN_SHARE
    return { rate: (seconds * 1000) / playMs, holdMs: playMs * INTRO_SHARE, stepMs: EASY_STEP_MS, totalMs: playMs }
  }
  const climb = CLIMB[difficulty]
  const t = climbOf(level, climb)
  const rate = 1 + (climb.end - 1) * t
  if (!seconds) {
    // Medium keeps the original even climb; hard stretches it by how much further its sound climbs
    const linear = ((level - 1) / (LEVEL_COUNT - 1)) * ((climb.end - 1) / (CLIMB.medium.end - 1))
    const stepMs = Math.round(START_SPEED_MS * (END_SPEED_MS / START_SPEED_MS) ** linear)
    return { rate, holdMs: stepMs, stepMs, totalMs: stepMs * (CELLS + 1) }
  }
  const playMs = (seconds / rate) * 1000
  return { rate, holdMs: playMs * INTRO_SHARE, stepMs: (playMs * MAIN_SHARE) / CELLS, totalMs: playMs }
}

/** How long the whole 3-2-1 takes at this level's tempo, in ms */
function countdownMs(rate: number): number {
  const seconds = startDuration()
  return seconds ? (seconds * 1000) / rate : (DEFAULT_COUNT_MS * 4) / rate
}

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
  const [allCards] = await Promise.all([getAllCards(), loadGameSounds()])
  const settings = syncPoolsWithCards(allCards.map((c) => c.id))
  const byId = new Map(allCards.map((c) => [c.id, c]))

  if (allCards.length === 0) {
    root.innerHTML = `
      <div class="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
        <p class="text-5xl">🙈</p>
        <p class="text-lg">ยังไม่มีการ์ดเลย</p>
        <a href="#/settings" class="${btn.primary}">ไปเพิ่มการ์ด</a>
      </div>`
    return () => {}
  }

  /** Cards allowed in this level (falls back to every card if the pool is somehow empty) */
  const poolOf = (level: number): Card[] => {
    const ids = settings.levelPools[level - 1] ?? []
    const pool = ids.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c))
    return pool.length > 0 ? pool : allCards
  }

  root.innerHTML = `
    <div class="flex h-[calc(100dvh-3.5rem)] flex-col gap-2 pb-3">
      <div class="flex shrink-0 flex-wrap items-center justify-center gap-2 sm:justify-between">
        <div class="flex items-center gap-2 text-sm">
          <span data-level-badge class="flex h-7 items-center rounded-full bg-emerald-500 px-3 text-xs font-semibold text-white"></span>
          <span data-level-info class="text-stone-500 dark:text-stone-400"></span>
          <span data-progress class="font-medium text-emerald-600 tabular-nums dark:text-emerald-400"></span>
          <span class="hidden text-stone-400 sm:inline dark:text-stone-500">· แตะกลางจอเพื่อหยุด</span>
        </div>
        <button data-action="restart" class="${btn.primary} py-2!">↻ Restart</button>
      </div>

      <div class="relative min-h-0 flex-1">
        <div data-grid class="grid h-full gap-2 p-1 sm:gap-3"
          style="grid-template-columns: repeat(${COLS}, minmax(0, 1fr)); grid-template-rows: repeat(${ROWS}, minmax(0, 1fr))"></div>
        <div data-overlay class="absolute inset-0 flex items-center justify-center rounded-3xl bg-amber-50/70 backdrop-blur-sm dark:bg-stone-900/70"></div>
      </div>
    </div>`

  const grid = qs(root, '[data-grid]')
  const overlay = qs(root, '[data-overlay]')
  const progress = qs(root, '[data-progress]')
  const badge = qs(root, '[data-level-badge]')
  const levelInfoEl = qs(root, '[data-level-info]')

  let phase: Phase = 'idle'
  let level = 1
  let sequence: Card[] = []
  let index = -1
  /** Context time this level's sound started, used to work out where a pause happened */
  let levelStartedAt = 0
  let pausedElapsedMs = 0
  let runStartedAt = 0
  let cardsSeen = 0
  /** The level sound, queued up while the countdown is still running */
  let queuedLevelAt = 0
  let timers: number[] = []

  /** Runs `fn` at a point on the audio clock, so visuals follow the sound. */
  function at(contextTime: number, fn: () => void) {
    timers.push(window.setTimeout(fn, Math.max(0, (contextTime - audioNow()) * 1000)))
  }

  function afterMs(ms: number, fn: () => void) {
    timers.push(window.setTimeout(fn, Math.max(0, ms)))
  }

  function clearTimers() {
    timers.forEach(clearTimeout)
    timers = []
  }

  /** Writes one line to history/<date>.txt — on Restart, on finishing, and on leaving mid-game. */
  function saveRun(reason: RunResult['reason']) {
    if (!runStartedAt) return
    const seconds = Math.round((Date.now() - runStartedAt) / 1000)
    runStartedAt = 0
    // A run where no card was ever shown is not worth a line
    if (cardsSeen === 0) return
    saveRunHistory({ level, cards: cardsSeen, seconds, reason })
  }

  const difficultyLabel = () => DIFFICULTIES.find((d) => d.value === getSettings().difficulty)!.label

  const levelInfo = () => {
    return `โหมด ${difficultyLabel()}`
  }

  function renderStatus() {
    badge.textContent = `ด่าน ${level}/${LEVEL_COUNT}`
    levelInfoEl.textContent = levelInfo()
  }

  /** Shuffles a new grid for the current level. */
  function prepareLevel() {
    sequence = buildSequence(poolOf(level), CELLS)
    index = -1
    grid.innerHTML = sequence
      .map(
        (card, i) => `
        <div data-cell="${i}" role="img" aria-label="${esc(card.label)}"
          class="relative min-h-0 min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition duration-200 dark:bg-stone-800 dark:ring-stone-700">
          <img src="${card.image}" alt="" draggable="false" class="h-full w-full select-none object-contain p-[6%]" />
        </div>`,
      )
      .join('')
    renderStatus()
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
    progress.textContent = i >= 0 ? `${Math.min(i + 1, CELLS)} / ${CELLS}` : ''
  }

  function showOverlay(html: string) {
    overlay.innerHTML = html
    overlay.hidden = false
  }

  function showStart() {
    showOverlay(`
      <div class="flex flex-col items-center gap-4 text-center animate-pop">
        <button data-action="start" class="${btn.primary} px-10 py-5 text-2xl shadow-lg">▶ เริ่มเล่น</button>
        <p class="text-stone-600 dark:text-stone-300">
          ${LEVEL_COUNT} ด่าน · ตาราง ${ROWS}×${COLS} · โหมด ${difficultyLabel()}
        </p>
      </div>`)
  }

  /**
   * Runs the 3-2-1 for the current level and hands straight over to the level itself.
   * `startAt` is a point on the audio clock, so one level's sound can run into the next
   * countdown with no gap at all.
   */
  function beginCountdown(startAt?: number) {
    phase = 'countdown'
    renderStatus()
    const { rate } = levelTiming(level)
    const withSound = settings.sound && hasStartSound()
    const begin = startAt ?? audioNow() + 0.05
    const segment = withSound ? scheduleStartSound(rate, begin) : null
    const from = segment?.at ?? begin
    const until = segment?.endsAt ?? from + countdownMs(rate) / 1000
    const beat = (until - from) / 4

    const title = `<p class="text-2xl font-semibold text-stone-700 dark:text-stone-200">ด่าน ${level} · โหมด ${difficultyLabel()}</p>`
    for (const n of [3, 2, 1]) {
      at(from + (3 - n) * beat, () => {
        showOverlay(`
          <div class="flex flex-col items-center gap-2 text-center">
            ${title}
            <p class="font-bold text-emerald-500 drop-shadow animate-pop" style="font-size: min(10rem, 25vw); line-height: 1">${n}</p>
          </div>`)
        if (!segment) beep()
      })
    }
    at(from + 3 * beat, () => {
      showOverlay(`<div class="flex flex-col items-center gap-2 text-center">${title}<p class="text-7xl font-bold text-emerald-500 animate-pop sm:text-8xl">เริ่ม!</p></div>`)
      if (!segment) beep(true)
    })

    // Queue the level sound now, for the exact sample the countdown ends on
    const levelSound = settings.sound ? scheduleDuringSound(rate, until) : null
    queuedLevelAt = levelSound?.at ?? until
    at(until, () => startLevel(queuedLevelAt))
  }

  /** Runs one level; its sound was already queued to begin at `startAt`. */
  function startLevel(startAt: number) {
    phase = 'playing'
    overlay.hidden = true
    const { holdMs, stepMs, totalMs } = levelTiming(level)
    levelStartedAt = startAt
    pausedElapsedMs = 0
    index = -1
    highlight(-1)
    scheduleCards(holdMs, stepMs, totalMs, 0)
  }

  /** Schedules the remaining cards of the level, `elapsedMs` into it. */
  function scheduleCards(holdMs: number, stepMs: number, totalMs: number, elapsedMs: number) {
    for (let i = index + 1; i < CELLS; i++) {
      const cardAt = holdMs + i * stepMs
      if (cardAt < elapsedMs) continue
      afterMs(cardAt - elapsedMs, () => {
        index = i
        highlight(i)
        cardsSeen++
        if (settings.whistle) whistle()
      })
    }
    afterMs(totalMs - elapsedMs, completeLevel)
  }

  function completeLevel() {
    clearTimers()
    const endsAt = levelStartedAt + (levelTiming(level).totalMs - pausedElapsedMs) / 1000
    if (level >= LEVEL_COUNT) return finish()
    level++
    prepareLevel()
    // The next countdown starts on the same sample the level sound ends on
    beginCountdown(Math.max(endsAt, audioNow()))
  }

  function finish() {
    saveRun('finish')
    phase = 'finished'
    highlight(-1)
    progress.textContent = ''
    showOverlay(`
      <div class="flex flex-col items-center gap-5 text-center animate-pop">
        <p class="text-6xl">🏆</p>
        <p class="text-3xl font-bold">เก่งมาก! ผ่านครบ ${LEVEL_COUNT} ด่านแล้ว</p>
        <button data-action="restart" class="${btn.primary} px-8 py-4 text-xl shadow-lg">↻ เล่นอีกครั้ง</button>
      </div>`)
  }

  /** Starts (or restarts) from level 1. The run being replaced is saved to the history first. */
  function start() {
    clearTimers()
    saveRun('restart')
    stopDuringSound()
    stopStartSound()
    runStartedAt = Date.now()
    cardsSeen = 0
    level = 1
    prepareLevel()
    beginCountdown()
  }

  function togglePause() {
    if (phase === 'playing') {
      clearTimers()
      pausedElapsedMs = Math.max(0, (audioNow() - levelStartedAt) * 1000)
      stopDuringSound(LEVEL_FADE_MS)
      phase = 'paused'
      showOverlay(`
        <div class="flex flex-col items-center gap-3 text-center animate-pop">
          <p class="text-6xl">⏸</p>
          <p class="text-2xl font-bold">แตะอีกครั้งเพื่อเล่นต่อ</p>
          <p class="text-stone-600 dark:text-stone-300">ด่าน ${level} · ${index + 1} / ${CELLS}</p>
        </div>`)
    } else if (phase === 'paused') {
      overlay.hidden = true
      phase = 'playing'
      const { rate, holdMs, stepMs, totalMs } = levelTiming(level)
      const seconds = duringDuration()
      const resumeAt = audioNow() + 0.05
      // Pick the sound up where it left off
      if (settings.sound && seconds) scheduleDuringSound(rate, resumeAt, (pausedElapsedMs / totalMs) * seconds)
      levelStartedAt = resumeAt - pausedElapsedMs / 1000
      scheduleCards(holdMs, stepMs, totalMs, pausedElapsedMs)
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const onClick = (e: MouseEvent) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action
    if (action === 'start' || action === 'restart') return start()
    // Anywhere else on the play area pauses and resumes
    if (phase === 'playing' || phase === 'paused') togglePause()
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

  prepareLevel()
  showStart()

  return () => {
    saveRun('leave')
    clearTimers()
    stopStartSound()
    stopDuringSound()
    root.removeEventListener('click', onClick)
    window.removeEventListener('keydown', onKey)
  }
}
