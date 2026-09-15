import type { Settings, Theme } from './types'

const KEY = 'chick-n-cow:settings'

export const DEFAULT_SETTINGS: Settings = {
  disabledIds: [],
  theme: 'system',
  music: true,
  musicTrack: 'normal',
  voice: true,
}

function load(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    return {
      theme: ['light', 'dark', 'system'].includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
      music: Boolean(s.music),
      voice: Boolean(s.voice),
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
