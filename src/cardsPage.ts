import { playCardSound, stopCardSound } from './audio'
import { getAllCards } from './cards'
import { btn, esc } from './dom'
import { syncPoolsWithCards } from './settings'
import { LEVEL_COUNT, type Card } from './types'

/** Which levels a card can turn up in */
function levelsOf(pools: string[][], id: string): number[] {
  return pools.map((pool, i) => (pool.includes(id) ? i + 1 : 0)).filter(Boolean)
}

/** "1-4, 7" reads better than a long list of numbers */
function levelRanges(levels: number[]): string {
  const parts: string[] = []
  for (let i = 0; i < levels.length; ) {
    let j = i
    while (j + 1 < levels.length && levels[j + 1] === levels[j] + 1) j++
    parts.push(i === j ? `${levels[i]}` : `${levels[i]}-${levels[j]}`)
    i = j + 1
  }
  return parts.join(', ')
}

export async function mountCards(root: HTMLElement): Promise<() => void> {
  const all = await getAllCards()
  const settings = syncPoolsWithCards(all.map((c) => c.id))
  const pools = settings.levelPools

  // Distinct cards that actually appear somewhere in the 10 levels
  const inUse: Card[] = all.filter((c) => pools.some((pool) => pool.includes(c.id)))
  const unused = all.filter((c) => !inUse.includes(c))

  function cardHtml(card: Card, used: boolean) {
    const levels = levelsOf(pools, card.id)
    return `
      <button type="button" data-play="${card.id}" ${card.sound ? '' : 'disabled'}
        class="group flex flex-col items-center gap-2 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200 transition hover:ring-emerald-400 active:scale-95 disabled:opacity-60 dark:bg-stone-800 dark:ring-stone-700">
        <img src="${card.image}" alt="" draggable="false" class="h-28 w-full select-none object-contain" />
        <span class="text-lg font-semibold">${esc(card.label)}</span>
        ${
          card.sound
            ? `<span class="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">🔊 แตะเพื่อฟัง</span>`
            : `<span class="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">ยังไม่มีเสียง</span>`
        }
        <span class="text-xs text-stone-400 dark:text-stone-500">
          ${used ? `อยู่ในด่าน ${levelRanges(levels)}` : 'ยังไม่ได้ใส่ในด่านไหน'}
        </span>
      </button>`
  }

  const grid = (cards: Card[], used: boolean) =>
    `<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">${cards.map((c) => cardHtml(c, used)).join('')}</div>`

  const noSound = inUse.filter((c) => !c.sound).length

  root.innerHTML = `
    <div class="mx-auto flex max-w-4xl flex-col gap-5 pt-2 pb-10">
      <div>
        <h1 class="text-2xl font-bold">📚 สรุปการ์ด</h1>
        <p class="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          การ์ดทั้งหมดที่ใช้ในเกม ${LEVEL_COUNT} ด่าน (ไม่ซ้ำ) · แตะที่การ์ดเพื่อฟังวิธีออกเสียง
        </p>
      </div>

      ${
        inUse.length === 0
          ? `<div class="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
              <p class="text-5xl">🃏</p>
              <p class="mt-3 text-stone-500 dark:text-stone-400">ยังไม่มีการ์ดในด่านไหนเลย</p>
              <a href="#/settings" class="${btn.primary} mt-5">⚙️ ไปตั้งค่าการ์ด</a>
            </div>`
          : `<p class="text-sm text-stone-500 dark:text-stone-400">ทั้งหมด ${inUse.length} การ์ด${noSound ? ` · ${noSound} การ์ดยังไม่มีเสียง` : ''}</p>
             ${grid(inUse, true)}`
      }

      ${
        unused.length
          ? `<div class="mt-2">
              <h2 class="text-lg font-semibold text-stone-500 dark:text-stone-400">ยังไม่ได้ใช้ในด่านไหน (${unused.length})</h2>
              <div class="mt-3 opacity-70">${grid(unused, false)}</div>
            </div>`
          : ''
      }
    </div>`

  const onClick = (e: MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-play]')?.dataset.play
    const card = id ? all.find((c) => c.id === id) : undefined
    if (card?.sound) playCardSound(card.sound)
  }

  root.addEventListener('click', onClick)
  return () => {
    stopCardSound()
    root.removeEventListener('click', onClick)
  }
}
