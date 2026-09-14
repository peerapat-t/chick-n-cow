export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

export const btn = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-emerald-600 active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 font-medium text-stone-700 shadow-sm ring-1 ring-stone-200 transition hover:bg-stone-50 active:scale-95 disabled:opacity-40 disabled:pointer-events-none dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-700 dark:hover:bg-stone-700',
}

/** Accessible on/off switch markup; `data-switch` carries the setting key. */
export function switchHtml(key: string, on: boolean, label: string) {
  return `<button type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-switch="${key}"
    class="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-600'}">
    <span class="inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-7' : 'translate-x-1'}"></span>
  </button>`
}
