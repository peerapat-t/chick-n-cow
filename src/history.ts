const base = import.meta.env.BASE_URL

export interface RunResult {
  /** Level the game was on when it ended */
  level: number
  /** How many pictures the frame passed over in total */
  cards: number
  /** How long the game lasted, in seconds */
  seconds: number
  reason: 'restart' | 'finish' | 'leave'
}

/** Appends one line to history/<date>.txt on the server. */
export function saveRunHistory(run: RunResult): void {
  try {
    void fetch(`${base}api/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
      // Still sent if the page is being closed
      keepalive: true,
    }).catch(() => {})
  } catch {
    // history is a nice-to-have; never let it break the game
  }
}

export interface HistoryRow {
  /** The original line from the text file */
  raw: string
  date?: string
  time?: string
  level?: number
  cards?: number
  seconds?: number
  reason?: string
}

/** Empties history/history.txt for good. */
export async function clearHistory(): Promise<void> {
  const res = await fetch(`${base}api/history`, { method: 'DELETE' })
  if (!res.ok) throw new Error(res.statusText)
}

/** Most recent games first. */
export async function getHistory(limit = 100): Promise<HistoryRow[]> {
  try {
    const res = await fetch(`${base}api/history?limit=${limit}`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}
