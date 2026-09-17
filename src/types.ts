export type Theme = 'light' | 'dark' | 'system'

/** easy: fixed pace every level · medium: the normal climb · hard: a steeper climb */
export type Difficulty = 'easy' | 'medium' | 'hard'

/** Every level uses the same grid; only the speed changes. */
export const ROWS = 2
export const COLS = 4
export const CELLS = ROWS * COLS
export const LEVEL_COUNT = 10

export interface Settings {
  /** Card ids allowed in each level; index 0 is level 1. Never empty. */
  levelPools: string[][]
  theme: Theme
  difficulty: Difficulty
  /** Play the start/during sound files */
  sound: boolean
  /** Whistle each time the frame moves to the next card */
  whistle: boolean
}

export interface Card {
  id: string
  label: string
  /** URL for <img src> */
  image: string
  /** URL of the card's pronunciation clip */
  sound?: string
}

export interface GameSounds {
  /** URL of sound/start.* — played before the game begins */
  start?: string
  /** URL of sound/during.* — looped while playing, sped up with the level */
  during?: string
}
