import './style.css'
import { afflictionById } from './core/affliction'
import {
  concludeRun,
  createMeta,
  deployParty,
  PARTY_SIZE,
  RECRUIT_COST,
  recruit,
  replenish,
  type MetaState,
  type RunSummary,
} from './core/meta'
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
import {
  ensureAudio,
  hush,
  isMuted,
  resetAudio,
  setVoices,
  setWarmth,
  swell,
  toggleMute,
} from './ui/audio'
import { loadGame, saveGame } from './ui/storage'
import { render, type HpDeltas } from './ui/render'
import { renderTown } from './ui/town'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app not found')
const root = app

let meta: MetaState = createMeta()
let run: RunState | null = null
let summary: RunSummary | null = null
let selected: string[] = []
let busy = false
let campTimer: number | undefined

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function newSeed(): string {
  return Math.random().toString(36).slice(2, 8)
}

function persist(): void {
  void saveGame({ version: 1, meta, run })
}

// ─── 繪製 ────────────────────────────────────────────────────

function paint(deltas: HpDeltas = {}): void {
  if (run) {
    root.innerHTML = render(run, { deltas, muted: isMuted() })
    root.classList.toggle('mood--ascent', run.direction === 'up' && !run.over)
    root.classList.toggle('mood--warm', run.endReason === 'surfaced')
  } else {
    root.innerHTML = renderTown(meta, selected, summary, isMuted())
    root.classList.remove('mood--ascent')
    root.classList.toggle('mood--warm', summary?.surfaced ?? false)
  }
}

/** 聲部與暖度隨局勢改變（企劃書 16-2、16-4） */
function syncAudio(): void {
  if (!run) {
    setVoices([true, true, true, true])
    setWarmth(0.85)
    return
  }
  setVoices(run.party.map((c) => c.status === 'alive'))
  if (run.endReason === 'surfaced') setWarmth(1)
  else if (run.over) setWarmth(0)
  else if (run.direction === 'up') setWarmth(0.12)
  else setWarmth(0.5)
}

/**
 * 回饋節奏（企劃書 16-3、16-6）：重要的事情要慢，
 * 重大事件的表現是「靜止」而不是衝擊。
 */
async function act(mutate: () => void, pause: number): Promise<void> {
  if (busy || !run) return
  busy = true
  root.classList.add('app--held')

  const beforeHp = Object.fromEntries(run.party.map((c) => [c.id, c.hp]))
  const beforeLog = run.log.length
  await delay(pause)

  mutate()

  const deltas: HpDeltas = {}
  for (const c of run.party) {
    const prev = beforeHp[c.id]
    if (prev !== undefined && prev !== c.hp) deltas[c.id] = prev - c.hp
  }

  const grim = run.log.slice(beforeLog).some((e) => e.tone === 'grim')
  paint(deltas)
  syncAudio()
  persist()

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

// ─── 城鎮動作 ────────────────────────────────────────────────

function depart(): void {
  const party = deployParty(meta, selected)
  if (party.length === 0) return
  run = createRun(newSeed(), { party, echoes: meta.lostSouls })
  summary = null
  resetAudio()
  root.classList.remove('mood--camp')
  paint()
  syncAudio()
  persist()
}

function returnToTown(): void {
  if (!run) return
  summary = concludeRun(meta, run)
  run = null
  replenish(meta)
  // 名冊變動後，先前的選擇可能已經不成立
  selected = selected.filter((id) =>
    meta.roster.some((c) => c.id === id && c.status === 'alive'),
  )
  resetAudio()
  paint()
  syncAudio()
  persist()
}

function togglePick(id: string): void {
  if (selected.includes(id)) selected = selected.filter((x) => x !== id)
  else if (selected.length < PARTY_SIZE) selected = [...selected, id]
  paint()
}

function cure(payload: string): void {
  const [memberId, afflictionId] = payload.split(':')
  const member = meta.roster.find((c) => c.id === memberId)
  const def = afflictionId ? afflictionById(afflictionId) : undefined
  if (!member || !def || def.cureCost <= 0 || meta.funds < def.cureCost) return

  const idx = member.afflictions.indexOf(def.id)
  if (idx < 0) return

  member.afflictions.splice(idx, 1)
  meta.funds -= def.cureCost
  paint()
  persist()
}

// ─── 事件 ────────────────────────────────────────────────────

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action], button')
  if (!el) return

  ensureAudio()
  const d = el.dataset

  if (d.mute) {
    toggleMute()
    paint()
    return
  }

  // 城鎮
  if (d.pick) return togglePick(d.pick)
  if (d.depart) return depart()
  if (d.cure) return cure(d.cure)
  if (d.recruit) {
    if (meta.funds < RECRUIT_COST) return
    meta.funds -= RECRUIT_COST
    recruit(meta)
    paint()
    persist()
    return
  }
  if (d.return) return returnToTown()

  if (!run) return

  // 探索
  if (d.node) return void act(() => moveTo(run as RunState, d.node as string), 400)
  if (d.ascent) return void act(() => beginAscent(run as RunState), 700)
  if (d.descend) return void act(() => resumeDescent(run as RunState), 700)
  if (d.anchor) return void act(() => useAnchor(run as RunState), 600)
  if (d.med) return void act(() => useMedicine(run as RunState, d.med as string), 250)
  if (d.ward) return void act(() => setBurden(run as RunState, 'ward', d.ward as string), 600)

  if (d.camp) {
    return void act(() => {
      camp(run as RunState)
      flashCamp()
      swell()
      setWarmth(1)
    }, 300)
  }

  if (d.relic) {
    // 使用遺物必定伴隨代價，給玩家看完自己做的決定
    return void act(() => useEscapeRelic(run as RunState, d.relic as string), 900)
  }

  if (d.burden === 'spread') {
    setBurden(run, 'spread', null)
    paint()
    return
  }

  if (d.drop) {
    // 丟東西是即時的 —— 它已經夠痛了，不需要再加停頓
    const corpse = run.carried.find((i) => i.id === d.drop)?.kind === 'corpse'
    dropItem(run, d.drop)
    paint()
    persist()
    if (corpse) {
      navigator.vibrate?.(30)
      hush(1400)
    }
    return
  }

  if (d.dropSupply) {
    dropSupply(run, d.dropSupply as SupplyKey)
    paint()
    persist()
  }
})

// ─── 啟動 ────────────────────────────────────────────────────

void (async () => {
  const saved = await loadGame()
  if (saved) {
    meta = saved.meta
    run = saved.run
  }
  if (!run) replenish(meta)
  paint()
})()
