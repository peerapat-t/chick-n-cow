import type { GameSounds } from './types'

const base = import.meta.env.BASE_URL

let ctx: AudioContext | null = null

/** Browsers only allow audio after a user gesture, so call this from a click first. */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** The Web Audio clock, in seconds. All game timing is scheduled against it. */
export const audioNow = () => audioContext().currentTime

// ---------- Countdown beep (used when there is no start sound file) ----------

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

/** Short referee-style whistle, played as the frame moves from card to card. */
export function whistle() {
  const ac = audioContext()
  const t = ac.currentTime
  const out = ac.createGain()
  out.gain.setValueAtTime(0.0001, t)
  out.gain.exponentialRampToValueAtTime(0.22, t + 0.015)
  out.gain.setValueAtTime(0.22, t + 0.1)
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
  out.connect(ac.destination)

  // Two detuned tones plus a fast wobble give it the trill of a real whistle
  const wobble = ac.createOscillator()
  const wobbleDepth = ac.createGain()
  wobble.frequency.value = 45
  wobbleDepth.gain.value = 110
  wobble.connect(wobbleDepth)
  for (const freq of [2100, 2650]) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq * 0.92, t)
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04)
    wobbleDepth.connect(osc.frequency)
    osc.connect(out)
    osc.start(t)
    osc.stop(t + 0.22)
  }
  wobble.start(t)
  wobble.stop(t + 0.22)

  // A puff of air at the start
  const buffer = ac.createBuffer(1, ac.sampleRate * 0.08, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const air = ac.createBufferSource()
  air.buffer = buffer
  const airFilter = ac.createBiquadFilter()
  airFilter.type = 'bandpass'
  airFilter.frequency.value = 2400
  const airGain = ac.createGain()
  airGain.gain.value = 0.25
  air.connect(airFilter).connect(airGain).connect(out)
  air.start(t)

  setTimeout(() => out.disconnect(), 400)
}

// ---------- Card pronunciation ----------

const cardPlayers = new Map<string, HTMLAudioElement>()
let cardPlaying: HTMLAudioElement | null = null

/** Plays a card's own clip — used to teach how the word sounds. */
export function playCardSound(url: string) {
  stopCardSound()
  let el = cardPlayers.get(url)
  if (!el) {
    el = new Audio(url)
    el.preload = 'auto'
    cardPlayers.set(url, el)
  }
  cardPlaying = el
  el.currentTime = 0
  el.play().catch(() => {})
}

export function stopCardSound() {
  cardPlaying?.pause()
  cardPlaying = null
}

// ---------- Game sound files (sound/start.*, sound/during.*) ----------

/** A decoded file with the silence at either end skipped */
interface Clip {
  buffer: AudioBuffer
  /** Where the audible part starts inside the file, in seconds */
  offset: number
  /** Length of the audible part, in seconds */
  seconds: number
}

/** A scheduled playback of a clip */
interface Voice {
  source: AudioBufferSourceNode
  gain: GainNode
  clip: Clip
  rate: number
  /** Context time it starts at */
  at: number
  /** How far into the clip it began */
  from: number
  endsAt: number
}

let sounds: GameSounds = {}
let startClip: Clip | null = null
let duringClip: Clip | null = null
let startVoice: Voice | null = null
let duringVoice: Voice | null = null

export async function loadGameSounds(): Promise<GameSounds> {
  try {
    const res = await fetch(`${base}api/sounds`, { cache: 'no-store' })
    if (!res.ok) throw new Error(res.statusText)
    const found: GameSounds = await res.json()
    sounds = {
      start: found.start ? base + found.start : undefined,
      during: found.during ? base + found.during : undefined,
    }
  } catch (err) {
    console.warn('Game sounds unavailable', err)
    sounds = {}
  }

  stopStartSound()
  stopDuringSound()
  startClip = sounds.start ? await loadClip(sounds.start) : null
  duringClip = sounds.during ? await loadClip(sounds.during) : null
  return sounds
}

/**
 * Decodes a file and finds where it actually makes sound. Recordings often begin with a
 * moment of silence, which would otherwise put the countdown out of step with what you hear.
 */
async function loadClip(url: string): Promise<Clip | null> {
  try {
    const bytes = await (await fetch(url)).arrayBuffer()
    const buffer = await audioContext().decodeAudioData(bytes)
    const data = buffer.getChannelData(0)
    let peak = 0
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
    const threshold = peak * 0.02
    let head = 0
    while (head < data.length && Math.abs(data[head]) < threshold) head++
    let tail = data.length - 1
    while (tail > head && Math.abs(data[tail]) < threshold) tail--
    const offset = Math.max(0, head / buffer.sampleRate - 0.02)
    const end = Math.min(buffer.duration, (tail + 1) / buffer.sampleRate + 0.02)
    return { buffer, offset, seconds: Math.max(0.1, end - offset) }
  } catch (err) {
    console.warn('Could not load ' + url, err)
    return null
  }
}

export const hasStartSound = () => startClip !== null
export const hasDuringSound = () => duringClip !== null
/** Audible length of sound/start.*, ignoring silence at either end. */
export const startDuration = () => startClip?.seconds ?? null
/** Audible length of sound/during.* at normal speed. */
export const duringDuration = () => duringClip?.seconds ?? null

const clampRate = (rate: number) => Math.min(4, Math.max(0.25, rate))

/**
 * Schedules a clip on the audio clock. Because the start time is given to the audio
 * hardware rather than to a timer, one sound can begin the exact sample the last one ends.
 */
function schedule(clip: Clip, rate: number, at: number, from = 0): Voice {
  const ac = audioContext()
  const source = ac.createBufferSource()
  source.buffer = clip.buffer
  source.playbackRate.value = clampRate(rate)
  const gain = ac.createGain()
  source.connect(gain).connect(ac.destination)
  const seconds = Math.max(0, clip.seconds - from)
  const startAt = Math.max(at, ac.currentTime)
  source.start(startAt, clip.offset + from, seconds)
  return { source, gain, clip, rate: clampRate(rate), at: startAt, from, endsAt: startAt + seconds / clampRate(rate) }
}

export interface Segment {
  /** Context time it starts */
  at: number
  /** Context time it ends */
  endsAt: number
}

/** Plays sound/start.* at the level's tempo, starting at `at` (default: now). */
export function scheduleStartSound(rate: number, at?: number): Segment | null {
  if (!startClip) return null
  stopStartSound()
  startVoice = schedule(startClip, rate, at ?? audioNow() + 0.02)
  return { at: startVoice.at, endsAt: startVoice.endsAt }
}

/** Plays sound/during.* once at the level's tempo, starting at `at` (default: now). */
export function scheduleDuringSound(rate: number, at?: number, from = 0): Segment | null {
  if (!duringClip) return null
  stopDuringSound()
  duringVoice = schedule(duringClip, rate, at ?? audioNow() + 0.02, from)
  return { at: duringVoice.at, endsAt: duringVoice.endsAt }
}

/** How far into sound/during.* playback has got, in clip seconds. */
export function duringProgress(): number {
  if (!duringVoice) return 0
  return Math.min(duringVoice.clip.seconds, duringVoice.from + Math.max(0, audioNow() - duringVoice.at) * duringVoice.rate)
}

export function stopStartSound(fadeMs = 0) {
  startVoice = stopVoice(startVoice, fadeMs)
}

export function stopDuringSound(fadeMs = 0) {
  duringVoice = stopVoice(duringVoice, fadeMs)
}

function stopVoice(voice: Voice | null, fadeMs: number): null {
  if (!voice) return null
  const ac = audioContext()
  const now = ac.currentTime
  if (fadeMs > 0 && now < voice.endsAt) {
    const until = Math.min(voice.endsAt, now + fadeMs / 1000)
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now)
    voice.gain.gain.linearRampToValueAtTime(0.0001, until)
    voice.source.stop(until + 0.02)
  } else {
    try {
      voice.source.stop()
    } catch {
      // already finished
    }
  }
  return null
}
