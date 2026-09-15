export type Theme = 'light' | 'dark' | 'system'

export type MusicTrack = 'slow' | 'normal' | 'fast'

export interface Settings {
  /** Card ids that are NOT used in the game (new cards are enabled by default) */
  disabledIds: string[]
  theme: Theme
  music: boolean
  musicTrack: MusicTrack
  voice: boolean
}

export interface Card {
  id: string
  label: string
  /** URL for <img src> */
  image: string
  /** URL for the pronunciation audio; the card is silent when missing */
  sound?: string
}
