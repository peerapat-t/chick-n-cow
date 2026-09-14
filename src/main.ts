import './style.css'
import { stopCardSound } from './audio'
import { mountGame } from './game'
import { applyTheme } from './settings'
import { mountSettings } from './settingsPage'

applyTheme()

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="flex min-h-dvh flex-col px-3 sm:px-4">
    <header class="flex h-14 shrink-0 items-center justify-between">
      <a href="#/" class="flex items-center gap-2 text-xl font-bold">
        <span class="text-3xl" aria-hidden="true">🐔</span>
        Chick n Cow
      </a>
      <nav class="flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700">
        <a href="#/" data-nav="game" class="rounded-full px-4 py-1.5 text-sm font-medium transition">🎮 เกม</a>
        <a href="#/settings" data-nav="settings" class="rounded-full px-4 py-1.5 text-sm font-medium transition">⚙️ ตั้งค่า</a>
      </nav>
    </header>
    <main id="view" class="flex-1"></main>
  </div>`

const view = document.querySelector<HTMLElement>('#view')!
let cleanup: (() => void) | undefined
let navId = 0

async function route() {
  const id = ++navId
  cleanup?.()
  cleanup = undefined
  stopCardSound()

  const page = location.hash === '#/settings' ? 'settings' : 'game'
  app.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
    const active = a.dataset.nav === page
    a.classList.toggle('bg-emerald-500', active)
    a.classList.toggle('text-white', active)
  })

  let dispose: () => void
  try {
    dispose = await (page === 'settings' ? mountSettings(view) : mountGame(view))
  } catch (err) {
    console.error(err)
    if (id !== navId) return
    view.innerHTML = `<p class="py-20 text-center text-rose-500">โหลดการ์ดไม่สำเร็จ — เซิร์ฟเวอร์ทำงานอยู่หรือเปล่า?</p>`
    return
  }
  // A newer navigation happened while this page was loading
  if (id !== navId) return dispose()
  cleanup = dispose
}

window.addEventListener('hashchange', route)
route()
