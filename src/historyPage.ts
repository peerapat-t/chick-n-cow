import { btn, esc, qs } from './dom'
import { clearHistory, getHistory, type HistoryRow } from './history'
import { LEVEL_COUNT } from './types'

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

const reasonBadge = (reason = '') => {
  const colour = reason.includes('จบ')
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    : reason.includes('ออก')
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
      : 'bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-200'
  return `<span class="rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${colour}">${esc(reason || '—')}</span>`
}

function statsHtml(rows: HistoryRow[]) {
  const played = rows.filter((r) => r.level !== undefined)
  const best = Math.max(0, ...played.map((r) => r.level ?? 0))
  const cards = played.reduce((sum, r) => sum + (r.cards ?? 0), 0)
  const seconds = played.reduce((sum, r) => sum + (r.seconds ?? 0), 0)
  const cell = (label: string, value: string) => `
    <div class="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
      <p class="text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">${value}</p>
      <p class="mt-0.5 text-xs text-stone-500 dark:text-stone-400">${label}</p>
    </div>`
  return `<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
    ${cell('เล่นทั้งหมด', `${played.length} ครั้ง`)}
    ${cell('ด่านสูงสุด', `${best} / ${LEVEL_COUNT}`)}
    ${cell('รูปที่อ่านรวม', `${cards}`)}
    ${cell('เวลารวม', mmss(seconds))}
  </div>`
}

function tableHtml(rows: HistoryRow[]) {
  if (rows.length === 0) {
    return `<div class="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
      <p class="text-5xl">📋</p>
      <p class="mt-3 text-stone-500 dark:text-stone-400">ยังไม่มีประวัติ — ลองเล่นแล้วกด Restart ดูครับ</p>
      <a href="#/" class="${btn.primary} mt-5">▶ ไปเล่นเกม</a>
    </div>`
  }

  const head = ['ครั้งที่', 'วันที่', 'เวลา', 'ด่าน', 'จำนวนรูป', 'เวลาที่เล่น', 'จบเพราะ']
  return `
    <div class="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-stone-200 text-left text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
            ${head.map((h) => `<th class="px-4 py-3 font-medium whitespace-nowrap">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              if (r.level === undefined) {
                return `<tr class="border-b border-stone-100 last:border-0 dark:border-stone-700/50">
                  <td class="px-4 py-3 text-stone-400">${rows.length - i}</td>
                  <td class="px-4 py-3 font-mono text-xs" colspan="6">${esc(r.raw)}</td>
                </tr>`
              }
              return `
                <tr class="border-b border-stone-100 transition last:border-0 hover:bg-stone-50 dark:border-stone-700/50 dark:hover:bg-stone-700/40">
                  <td class="px-4 py-3 text-stone-400 tabular-nums dark:text-stone-500">${rows.length - i}</td>
                  <td class="px-4 py-3 whitespace-nowrap tabular-nums">${esc(r.date ?? '')}</td>
                  <td class="px-4 py-3 whitespace-nowrap tabular-nums">${esc(r.time ?? '')}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white">${r.level}/${LEVEL_COUNT}</span>
                  </td>
                  <td class="px-4 py-3 font-medium tabular-nums">${r.cards ?? 0}</td>
                  <td class="px-4 py-3 tabular-nums">${mmss(r.seconds ?? 0)}</td>
                  <td class="px-4 py-3">${reasonBadge(r.reason)}</td>
                </tr>`
            })
            .join('')}
        </tbody>
      </table>
    </div>`
}

export async function mountHistory(root: HTMLElement): Promise<() => void> {
  let rows: HistoryRow[] = await getHistory(200)

  function render() {
    root.innerHTML = `
      <div class="mx-auto flex max-w-5xl flex-col gap-5 pt-2 pb-10">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold">📋 ประวัติการเล่น</h1>
            <p class="mt-0.5 text-sm text-stone-500 dark:text-stone-400">บันทึกทุกครั้งที่กด Restart, เล่นจบ หรือออกจากหน้าเกม</p>
          </div>
          <div class="flex gap-2">
            <button type="button" data-refresh class="${btn.secondary} py-2! text-sm">↻ โหลดใหม่</button>
            ${
              rows.length
                ? `<button type="button" data-clear class="${btn.secondary} py-2! text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40">🗑 ล้างประวัติ</button>`
                : ''
            }
          </div>
        </div>
        ${statsHtml(rows)}
        ${tableHtml(rows)}
      </div>`
  }

  const onClick = async (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-refresh]')) {
      qs<HTMLButtonElement>(root, '[data-refresh]').disabled = true
      rows = await getHistory(200)
      render()
      return
    }
    if (!target.closest('[data-clear]')) return
    if (!confirm(`ล้างประวัติทั้งหมด ${rows.length} รายการ? ข้อมูลในไฟล์จะถูกลบถาวร กู้คืนไม่ได้`)) return
    const button = qs<HTMLButtonElement>(root, '[data-clear]')
    button.disabled = true
    try {
      await clearHistory()
      rows = []
      render()
    } catch (err) {
      console.error(err)
      button.disabled = false
      alert(`ล้างประวัติไม่สำเร็จ: ${(err as Error).message}`)
    }
  }

  render()
  root.addEventListener('click', onClick)
  return () => root.removeEventListener('click', onClick)
}
