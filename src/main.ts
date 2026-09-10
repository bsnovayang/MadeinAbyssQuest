import './style.css'
import {
  beginAscent,
  camp,
  createRun,
  dropItem,
  dropSupply,
  moveTo,
  resumeDescent,
  setBurden,
  useAnchor,
  useEscapeRelic,
  useMedicine,
} from './core/run'
import type { RunState, SupplyKey } from './core/types'
import { ensureAudio, hush, isMuted, resetAudio, setVoices, setWarmth, swell, toggleMute } from './ui/audio'
import { render, type HpDeltas } from './ui/render'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app not found')
const root = app

let state: RunState = createRun(newSeed())
let busy = false
let campTimer: number | undefined

function newSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

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
  root.innerHTML = render(state, { deltas, muted: isMuted() })
  root.classList.toggle('mood--ascent', state.direction === 'up' && !state.over)
  root.classList.toggle('mood--warm', state.endReason === 'surfaced')
}

/** 聲部與暖度隨局勢改變（企劃書 16-2、16-4） */
function syncAudio(): void {
  setVoices(state.party.map((c) => c.status === 'alive'))
  if (state.endReason === 'surfaced') setWarmth(1)
  else if (state.over) setWarmth(0)
  else if (state.direction === 'up') setWarmth(0.12)
  else setWarmth(0.5)
}

/**
 * 回饋節奏（企劃書 16-3、16-6）：重要的事情要慢，
 * 重大事件的表現是「靜止」而不是衝擊。
 */
async function act(mutate: () => void, pause: number): Promise<void> {
  if (busy) return
  busy = true
  root.classList.add('app--held')

  const beforeHp = snapshotHp()
  const beforeLog = state.log.length
  await delay(pause)

  mutate()

  const grim = state.log.slice(beforeLog).some((e) => e.tone === 'grim')
  paint(diffHp(beforeHp))
  syncAudio()

  if (grim) {
    navigator.vibrate?.(30)
    hush(1400)
    await delay(1400)
  }

  root.classList.remove('app--held')
  busy = false
}

function flashCamp(): void {
  window.clearTimeout(campTimer)
  root.classList.add('mood--camp')
  campTimer = window.setTimeout(() => root.classList.remove('mood--camp'), 4200)
}

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>(
    '[data-node],[data-camp],[data-drop],[data-drop-supply],[data-restart],' +
      '[data-ascent],[data-descend],[data-anchor],[data-relic],[data-ward],[data-burden],[data-med],[data-mute]',
  )
  if (!el) return

  ensureAudio()
  const d = el.dataset

  if (d.mute) {
    toggleMute()
    paint()
    return
  }

  if (d.node) {
    void act(() => moveTo(state, d.node as string), 400)
    return
  }

  if (d.camp) {
    void act(() => {
      camp(state)
      flashCamp()
      swell()
      setWarmth(1)
    }, 300)
    return
  }

  if (d.ascent) {
    void act(() => beginAscent(state), 700)
    return
  }

  if (d.descend) {
    void act(() => resumeDescent(state), 700)
    return
  }

  if (d.anchor) {
    void act(() => useAnchor(state), 600)
    return
  }

  if (d.relic) {
    // 使用遺物必定伴隨代價，給玩家看完自己做的決定
    void act(() => useEscapeRelic(state, d.relic as string), 900)
    return
  }

  if (d.ward) {
    void act(() => setBurden(state, 'ward', d.ward as string), 600)
    return
  }

  if (d.burden === 'spread') {
    setBurden(state, 'spread', null)
    paint()
    return
  }

  if (d.med) {
    void act(() => useMedicine(state, d.med as string), 250)
    return
  }

  if (d.drop) {
    // 丟東西是即時的 —— 它已經夠痛了，不需要再加停頓
    dropItem(state, d.drop)
    paint()
    return
  }

  if (d.dropSupply) {
    dropSupply(state, d.dropSupply as SupplyKey)
    paint()
    return
  }

  if (d.restart) {
    state = createRun(newSeed())
    resetAudio()
    root.classList.remove('mood--camp')
    paint()
  }
})

paint()
