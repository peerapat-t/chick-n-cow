import { LEVEL_COUNT, type Settings, type Theme } from './types'

const KEY = 'chick-n-cow:settings'

export const DEFAULT_SETTINGS: Settings = {
  levelPools: Array.from({ length: LEVEL_COUNT }, () => []),
  theme: 'system',
  sound: true,
  whistle: true,
}

function load(): Settings {
  try {
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    const pools: string[][] = Array.isArray(s.levelPools) ? s.levelPools : []
    return {
      theme: (['light', 'dark', 'system'] as Theme[]).includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
      sound: Boolean(s.sound),
      whistle: Boolean(s.whistle),
      levelPools: Array.from({ length: LEVEL_COUNT }, (_, i) =>
        Array.isArray(pools[i]) ? pools[i].filter((id) => typeof id === 'string') : [],
      ),
    }
  } catch {
    return { ...DEFAULT_SETTINGS, levelPools: DEFAULT_SETTINGS.levelPools.map((p) => [...p]) }
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

/**
 * Drops cards that no longer exist and makes sure no level is left empty
 * (an empty level falls back to every card).
 */
export function syncPoolsWithCards(cardIds: string[]): Settings {
  const known = new Set(cardIds)
  const pools = current.levelPools.map((pool) => {
    const kept = [...new Set(pool.filter((id) => known.has(id)))]
    return kept.length > 0 ? kept : [...cardIds]
  })
  const changed = JSON.stringify(pools) !== JSON.stringify(current.levelPools)
  return changed ? updateSettings({ levelPools: pools }) : current
}

/** A newly added card starts out available in every level. */
export function addCardToAllPools(cardId: string): Settings {
  return updateSettings({ levelPools: current.levelPools.map((pool) => (pool.includes(cardId) ? pool : [...pool, cardId])) })
}

export function resetSettings(cardIds: string[]): Settings {
  return updateSettings({ ...DEFAULT_SETTINGS, levelPools: Array.from({ length: LEVEL_COUNT }, () => [...cardIds]) })
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)')

export function applyTheme(theme: Theme = current.theme) {
  const dark = theme === 'dark' || (theme === 'system' && darkQuery.matches)
  document.documentElement.classList.toggle('dark', dark)
}

darkQuery.addEventListener('change', () => applyTheme())
