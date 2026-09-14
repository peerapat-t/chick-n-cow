import { audioContext } from './audio'

export interface Trimmer {
  /** The selected range, mono 22.05 kHz WAV */
  export(): Promise<Blob>
  destroy(): void
}

const EXPORT_SAMPLE_RATE = 22050
const MIN_LENGTH = 0.1 // seconds
const FADE = 0.005 // seconds, avoids clicks at the cut points

const fmt = (s: number) => `${s.toFixed(2)} วิ`

/** Finds where speech starts/ends, ignoring quiet noise around it. */
function detectSound(buffer: AudioBuffer): [number, number] {
  const data = mixDown(buffer)
  const win = Math.max(1, Math.floor(buffer.sampleRate * 0.01))
  const rms: number[] = []
  for (let i = 0; i < data.length; i += win) {
    let sum = 0
    const end = Math.min(data.length, i + win)
    for (let j = i; j < end; j++) sum += data[j] * data[j]
    rms.push(Math.sqrt(sum / (end - i)))
  }
  const peak = Math.max(...rms)
  const threshold = Math.max(0.01, peak * 0.1)
  const first = rms.findIndex((v) => v > threshold)
  const last = rms.length - 1 - [...rms].reverse().findIndex((v) => v > threshold)
  if (first < 0) return [0, buffer.duration]
  const toSec = (i: number) => (i * win) / buffer.sampleRate
  return [Math.max(0, toSec(first) - 0.05), Math.min(buffer.duration, toSec(last + 1) + 0.12)]
}

function mixDown(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const out = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buffer.numberOfChannels
  }
  return out
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}

/** Renders a waveform with draggable start/end handles into `container`. Throws if the audio can't be decoded. */
export async function createTrimmer(container: HTMLElement, source: Blob): Promise<Trimmer> {
  const ac = audioContext()
  const buffer = await ac.decodeAudioData(await source.arrayBuffer())
  const duration = buffer.duration
  let [start, end] = detectSound(buffer)
  if (end - start < MIN_LENGTH) [start, end] = [0, duration]

  const smallBtn =
    'rounded-full bg-white px-3 py-1.5 font-medium ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-95 dark:bg-stone-800 dark:ring-stone-700 dark:hover:bg-stone-700'
  const handle = (name: string, label: string) => `
    <div data-handle="${name}" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="${duration.toFixed(2)}"
      class="absolute inset-y-0 z-10 -ml-3 flex w-6 cursor-ew-resize justify-center outline-none focus-visible:[&>span]:bg-emerald-300">
      <span class="h-full w-1 rounded bg-emerald-500"></span>
      <span class="absolute top-1/2 h-8 w-4 -translate-y-1/2 rounded-md bg-emerald-500 shadow"></span>
    </div>`

  container.innerHTML = `
    <div class="flex flex-col gap-2 rounded-2xl bg-stone-100 p-3 dark:bg-stone-900">
      <p class="text-xs text-stone-500 dark:text-stone-400">ลากแถบสีเขียวเพื่อเลือกช่วงเสียงที่ต้องการ</p>
      <div data-wave class="relative h-24 cursor-pointer touch-none select-none overflow-hidden rounded-xl bg-white dark:bg-stone-800">
        <canvas class="absolute inset-0 h-full w-full"></canvas>
        <div data-shade="left" class="absolute inset-y-0 left-0 bg-stone-500/50 dark:bg-black/60"></div>
        <div data-shade="right" class="absolute inset-y-0 right-0 bg-stone-500/50 dark:bg-black/60"></div>
        <div data-playhead hidden class="absolute inset-y-0 w-0.5 bg-rose-500"></div>
        ${handle('start', 'จุดเริ่มเสียง')}
        ${handle('end', 'จุดจบเสียง')}
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" data-trim="play" class="${smallBtn}">▶ ฟังช่วงที่เลือก</button>
        <button type="button" data-trim="auto" class="${smallBtn}">✂️ ตัดช่วงเงียบอัตโนมัติ</button>
        <button type="button" data-trim="all" class="${smallBtn}">เลือกทั้งหมด</button>
        <span data-trim-label class="ml-auto text-stone-600 tabular-nums dark:text-stone-300"></span>
      </div>
    </div>`

  const wave = container.querySelector<HTMLElement>('[data-wave]')!
  const canvas = wave.querySelector('canvas')!
  const shadeL = wave.querySelector<HTMLElement>('[data-shade="left"]')!
  const shadeR = wave.querySelector<HTMLElement>('[data-shade="right"]')!
  const playhead = wave.querySelector<HTMLElement>('[data-playhead]')!
  const hStart = wave.querySelector<HTMLElement>('[data-handle="start"]')!
  const hEnd = wave.querySelector<HTMLElement>('[data-handle="end"]')!
  const playBtn = container.querySelector<HTMLButtonElement>('[data-trim="play"]')!
  const label = container.querySelector<HTMLElement>('[data-trim-label]')!

  const samples = mixDown(buffer)

  function drawWave() {
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(wave.clientWidth * dpr))
    const h = Math.max(1, Math.round(wave.clientHeight * dpr))
    canvas.width = w
    canvas.height = h
    const g = canvas.getContext('2d')!
    g.clearRect(0, 0, w, h)
    g.fillStyle = '#10b981'
    const bar = Math.max(1, Math.round(2 * dpr))
    const gap = Math.max(1, Math.round(dpr))
    const perBar = samples.length / (w / (bar + gap))
    let peakAll = 0
    for (let i = 0; i < samples.length; i += 64) peakAll = Math.max(peakAll, Math.abs(samples[i]))
    const scale = peakAll > 0 ? 0.9 / peakAll : 1
    for (let x = 0, b = 0; x < w; x += bar + gap, b++) {
      let peak = 0
      const from = Math.floor(b * perBar)
      const to = Math.min(samples.length, Math.floor((b + 1) * perBar))
      for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]))
      const barH = Math.max(bar, peak * scale * h)
      g.fillRect(x, (h - barH) / 2, bar, barH)
    }
  }

  function update() {
    const pct = (t: number) => `${(t / duration) * 100}%`
    hStart.style.left = pct(start)
    hEnd.style.left = pct(end)
    shadeL.style.width = pct(start)
    shadeR.style.width = `${100 - (end / duration) * 100}%`
    hStart.setAttribute('aria-valuenow', start.toFixed(2))
    hEnd.setAttribute('aria-valuenow', end.toFixed(2))
    label.textContent = `${fmt(start)} – ${fmt(end)} (ยาว ${fmt(end - start)})`
  }

  function setRange(which: 'start' | 'end', t: number) {
    stop()
    if (which === 'start') start = Math.max(0, Math.min(t, end - MIN_LENGTH))
    else end = Math.min(duration, Math.max(t, start + MIN_LENGTH))
    update()
  }

  // ----- playback -----
  let src: AudioBufferSourceNode | null = null
  let raf = 0

  function stop() {
    if (!src) return
    src.onended = null
    src.stop()
    src = null
    cancelAnimationFrame(raf)
    playhead.hidden = true
    playBtn.textContent = '▶ ฟังช่วงที่เลือก'
  }

  function play() {
    stop()
    const node = ac.createBufferSource()
    node.buffer = buffer
    node.connect(ac.destination)
    const startedAt = ac.currentTime
    node.start(0, start, end - start)
    node.onended = stop
    src = node
    playBtn.textContent = '⏹ หยุด'
    playhead.hidden = false
    const tick = () => {
      const t = start + (ac.currentTime - startedAt)
      playhead.style.left = `${(Math.min(t, end) / duration) * 100}%`
      raf = requestAnimationFrame(tick)
    }
    tick()
  }

  // ----- interaction -----
  let dragging: 'start' | 'end' | null = null
  const timeAt = (clientX: number) => {
    const r = wave.getBoundingClientRect()
    return (Math.min(Math.max(clientX - r.left, 0), r.width) / r.width) * duration
  }

  wave.addEventListener('pointerdown', (e) => {
    const t = timeAt(e.clientX)
    const onHandle = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle as 'start' | 'end' | undefined
    dragging = onHandle ?? (Math.abs(t - start) <= Math.abs(t - end) ? 'start' : 'end')
    wave.setPointerCapture(e.pointerId)
    setRange(dragging, t)
    ;(dragging === 'start' ? hStart : hEnd).focus({ preventScroll: true })
  })
  wave.addEventListener('pointermove', (e) => {
    if (dragging) setRange(dragging, timeAt(e.clientX))
  })
  const endDrag = () => (dragging = null)
  wave.addEventListener('pointerup', endDrag)
  wave.addEventListener('pointercancel', endDrag)

  for (const [el, which] of [[hStart, 'start'], [hEnd, 'end']] as const) {
    el.addEventListener('keydown', (e) => {
      const delta = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0
      if (!delta) return
      e.preventDefault()
      setRange(which, (which === 'start' ? start : end) + delta * (e.shiftKey ? 0.1 : 0.01))
    })
  }

  container.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLElement>('[data-trim]')?.dataset.trim
    if (action === 'play') return src ? stop() : play()
    if (action === 'auto') {
      stop()
      ;[start, end] = detectSound(buffer)
      if (end - start < MIN_LENGTH) [start, end] = [0, duration]
      update()
    }
    if (action === 'all') {
      stop()
      start = 0
      end = duration
      update()
    }
  })

  const resize = new ResizeObserver(drawWave)
  resize.observe(wave)
  update()

  return {
    async export() {
      stop()
      const length = end - start
      const off = new OfflineAudioContext(1, Math.ceil(length * EXPORT_SAMPLE_RATE), EXPORT_SAMPLE_RATE)
      const node = off.createBufferSource()
      node.buffer = buffer
      const gain = off.createGain()
      gain.gain.setValueAtTime(0, 0)
      gain.gain.linearRampToValueAtTime(1, FADE)
      gain.gain.setValueAtTime(1, Math.max(FADE, length - FADE))
      gain.gain.linearRampToValueAtTime(0, length)
      node.connect(gain).connect(off.destination)
      node.start(0, start, length)
      const rendered = await off.startRendering()
      return encodeWav(rendered.getChannelData(0), EXPORT_SAMPLE_RATE)
    },
    destroy() {
      stop()
      resize.disconnect()
      container.innerHTML = ''
    },
  }
}
