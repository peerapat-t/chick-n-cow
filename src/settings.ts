import type { Settings, Theme } from './types'

const KEY = 'chick-n-cow:settings'

export const LIMITS = {
  rows: { min: 1, max: 8 },
  cols: { min: 1, max: 10 },
  speedMs: { min: 300, max: 3000, step: 100 },
}

export const DEFAULT_SETTINGS: Settings = {
  rows: 3,
  cols: 4,
  speedMs: 1200,
  disabledIds: [],
  theme: 'system',
  music: true,
  musicTrack: 'normal',
  voice: true,
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))

function load(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    return {
      ...s,
      rows: clamp(Number(s.rows) || DEFAULT_SETTINGS.rows, LIMITS.rows.min, LIMITS.rows.max),
      cols: clamp(Number(s.cols) || DEFAULT_SETTINGS.cols, LIMITS.cols.min, LIMITS.cols.max),
      speedMs: clamp(Number(s.speedMs) || DEFAULT_SETTINGS.speedMs, LIMITS.speedMs.min, LIMITS.speedMs.max),
      disabledIds: Array.isArray(s.disabledIds) ? s.disabledIds : [],
      musicTrack: ['slow', 'normal', 'fast'].includes(s.musicTrack) ? s.musicTrack : DEFAULT_SETTINGS.musicTrack,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

let current = load()

export const getSettings = (): Settings => current

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // storage unavailable (private mode) — keep settings in memory only
  }
  if (patch.theme) applyTheme(patch.theme)
  return current
}

export function resetSettings(): Settings {
  return updateSettings({ ...DEFAULT_SETTINGS })
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)')

export function applyTheme(theme: Theme = current.theme) {
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches)
  document.documentElement.classList.toggle('dark', dark)
}

darkQuery.addEventListener('change', () => applyTheme())
