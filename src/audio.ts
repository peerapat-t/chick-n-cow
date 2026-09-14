import type { Card, MusicTrack } from './types'

let ctx: AudioContext | null = null

/** Browsers only allow audio after a user gesture, so call this from a click first. */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// ---------- Card pronunciation ----------

const players = new Map<string, HTMLAudioElement>()
let playing: HTMLAudioElement | null = null

function player(src: string): HTMLAudioElement {
  let el = players.get(src)
  if (!el) {
    el = new Audio(src)
    el.preload = 'auto'
    players.set(src, el)
  }
  return el
}

export function preloadCardSounds(cards: Card[]) {
  for (const card of cards) if (card.sound) player(card.sound)
}

export function playCard(card: Card) {
  stopCardSound()
  if (!card.sound) return
  const el = player(card.sound)
  playing = el
  el.currentTime = 0
  el.play().catch(() => {})
}

export function stopCardSound() {
  playing?.pause()
  playing = null
}

// ---------- Countdown beep ----------

export function beep(high = false) {
  const ac = audioContext()
  const t = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'triangle'
  osc.frequency.value = high ? 1046.5 : 659.25
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (high ? 0.5 : 0.25))
  osc.connect(gain).connect(ac.destination)
  osc.start(t)
  osc.stop(t + 0.6)
}

// ---------- Background music (synthesized, no files needed) ----------

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** "C5 - E5 F#4 Bb3" -> frequencies, "-" is a rest */
function notes(score: string): number[] {
  return score
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = /^([A-G])([#b]?)(\d)$/.exec(tok)
      if (!m) return 0
      const midi = 12 * (Number(m[3]) + 1) + SEMITONES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
      return 440 * 2 ** ((midi - 69) / 12)
    })
}

interface TrackDef {
  bpm: number
  /** One entry per eighth note */
  melody: number[]
  /** One entry per quarter note */
  bass: number[]
  lead: OscillatorType
  leadVolume: number
  /** Melody note length in eighth notes */
  noteLength: number
  /** Bass note length in eighth notes */
  bassLength: number
  /** Bass jumps an octave on every off-beat */
  bounce?: boolean
  drums?: boolean
}

const TRACKS: Record<MusicTrack, TrackDef> = {
  slow: {
    bpm: 72,
    melody: notes(`
      E5 - D5 C5 D5 - E5 -  G5 - E5 - D5 - - -
      C5 - D5 E5 G5 - A5 -  G5 - E5 - C5 - - -`),
    bass: notes('C3 C3 G2 G2 A2 A2 G2 G2 F2 F2 C3 C3 F2 G2 C3 C3'),
    lead: 'sine',
    leadVolume: 0.55,
    noteLength: 1.8,
    bassLength: 3.5,
  },
  normal: {
    bpm: 120,
    melody: notes('C5 D5 E5 G5 E5 D5 C5 -  D5 E5 G5 A5 G5 E5 D5 -'),
    bass: notes('C3 C3 G3 G3 F3 F3 G3 G3'),
    lead: 'triangle',
    leadVolume: 0.5,
    noteLength: 0.9,
    bassLength: 1.8,
  },
  fast: {
    bpm: 152,
    melody: notes(`
      C5 C5 E5 G5 A5 G5 E5 C5  D5 D5 F5 A5 G5 - - -
      E5 G5 C6 G5 A5 G5 E5 D5  C5 E5 D5 B4 C5 - C5 -`),
    bass: notes('C3 C3 F3 G3 C3 C3 G2 G2 A2 A2 F2 G2 C3 G2 C3 C3'),
    lead: 'square',
    leadVolume: 0.22,
    noteLength: 0.7,
    bassLength: 0.8,
    bounce: true,
    drums: true,
  },
}

let musicTimer: number | undefined
let musicOut: GainNode | null = null
let currentTrack: MusicTrack | null = null
let noiseBuffer: AudioBuffer | null = null

function tone(out: AudioNode, freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
  const ac = audioContext()
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(vol, at + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + dur + 0.05)
}

function noise(out: AudioNode, at: number, dur: number, filter: BiquadFilterType, freq: number, vol: number) {
  const ac = audioContext()
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer
  const f = ac.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  const g = ac.createGain()
  g.gain.setValueAtTime(vol, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(f).connect(g).connect(out)
  src.start(at, Math.random() * 0.5)
  src.stop(at + dur + 0.02)
}

function kick(out: AudioNode, at: number) {
  const ac = audioContext()
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.frequency.setValueAtTime(150, at)
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.15)
  g.gain.setValueAtTime(0.9, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25)
  osc.connect(g).connect(out)
  osc.start(at)
  osc.stop(at + 0.3)
}

export function isMusicPlaying(): boolean {
  return musicTimer !== undefined
}

export function startMusic(trackId: MusicTrack) {
  if (currentTrack === trackId && isMusicPlaying()) return
  stopMusic()

  const track = TRACKS[trackId] ?? TRACKS.normal
  const ac = audioContext()
  const out = ac.createGain()
  out.gain.value = 0.1
  out.connect(ac.destination)
  musicOut = out
  currentTrack = trackId

  const eighth = 60 / track.bpm / 2
  let nextTime = ac.currentTime + 0.1
  let step = 0

  const schedule = () => {
    while (nextTime < ac.currentTime + 0.5) {
      const m = track.melody[step % track.melody.length]
      if (m) tone(out, m, nextTime, eighth * track.noteLength, track.lead, track.leadVolume)

      const bass = track.bass[Math.floor(step / 2) % track.bass.length]
      if (track.bounce) {
        if (bass) tone(out, step % 2 ? bass * 2 : bass, nextTime, eighth * track.bassLength, 'triangle', 0.7)
      } else if (step % 2 === 0 && bass) {
        tone(out, bass, nextTime, eighth * track.bassLength, 'sine', 0.7)
      }

      if (track.drums) {
        if (step % 4 === 0) kick(out, nextTime)
        if (step % 4 === 2) noise(out, nextTime, 0.12, 'bandpass', 1800, 0.6)
        noise(out, nextTime, 0.03, 'highpass', 7000, step % 2 ? 0.25 : 0.12)
      }

      nextTime += eighth
      step++
    }
  }
  schedule()
  musicTimer = window.setInterval(schedule, 100)
}

export function stopMusic() {
  if (musicTimer === undefined) return
  clearInterval(musicTimer)
  musicTimer = undefined
  currentTrack = null
  const out = musicOut
  musicOut = null
  if (out && ctx) {
    out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08)
    setTimeout(() => out.disconnect(), 500)
  }
}
