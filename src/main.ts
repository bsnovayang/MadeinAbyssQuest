import './style.css'
import { camp, createRun, descendTo, dropItem, dropSupply } from './core/run'
import type { RunState, SupplyKey } from './core/types'
import { render, type HpDeltas } from './ui/render'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app not found')
const root = app

let state: RunState = createRun(newSeed())
let busy = false

function newSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function snapshotHp(): Record<string, number> {
  return Object.fromEntries(state.party.map((c) => [c.id, c.hp]))
}

function diffHp(before: Record<string, number>): HpDeltas {
  const out: HpDeltas = {}
  for (const c of state.party) {
    const prev = before[c.id]
    if (prev !== undefined && prev !== c.hp) out[c.id] = prev - c.hp
  }
  return out
}

function paint(deltas: HpDeltas = {}): void {
  root.innerHTML = render(state, deltas)
}

/**
 * 回饋節奏（企劃書 16-3、16-6）：
 * 重要的事情要慢，且重大事件的表現是「靜止」而不是震動。
 */
async function act(mutate: () => void, pause: number): Promise<void> {
  if (busy) return
  busy = true
  root.classList.add('app--held')

  const beforeHp = snapshotHp()
  const beforeLog = state.log.length
  await delay(pause)

  mutate()

  const newEntries = state.log.slice(beforeLog)
  const grim = newEntries.some((e) => e.tone === 'grim')

  paint(diffHp(beforeHp))

  if (grim) {
    navigator.vibrate?.(30)
    await delay(1400)
  }

  root.classList.remove('app--held')
  busy = false
}

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>(
    '[data-node],[data-camp],[data-drop],[data-drop-supply],[data-restart]',
  )
  if (!el) return

  const node = el.dataset.node
  if (node) {
    void act(() => descendTo(state, node), 400)
    return
  }

  if (el.dataset.camp) {
    void act(() => camp(state), 400)
    return
  }

  const drop = el.dataset.drop
  if (drop) {
    // 丟東西是即時的 —— 它已經夠痛了，不需要再加停頓
    dropItem(state, drop)
    paint()
    return
  }

  const supply = el.dataset.dropSupply
  if (supply) {
    dropSupply(state, supply as SupplyKey)
    paint()
    return
  }

  if (el.dataset.restart) {
    state = createRun(newSeed())
    paint()
  }
})

paint()
