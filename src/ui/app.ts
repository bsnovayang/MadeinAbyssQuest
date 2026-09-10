import { afflictionById } from '../core/affliction'
import {
  abandonQuest,
  activeQuests,
  adjustLoadout,
  advanceDays,
  concludeRun,
  createMeta,
  deployParty,
  hire,
  loadoutCost,
  normalizeMeta,
  PARTY_SIZE,
  replenish,
  takeQuest,
  type MetaState,
  type RunSummary,
} from '../core/meta'
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
} from '../core/run'
import { describeProgress } from '../core/quests'
import type { RunState, SupplyKey } from '../core/types'
import { render, type HpDeltas } from './render'
import type { SaveData } from './storage'
import { renderTown, type TownTab } from './town'

/** 音效與存檔都從外面注入，讓整個 UI 層可以在 jsdom 裡被真的點擊 */
export interface AudioPort {
  ensure(): void
  setVoices(alive: readonly boolean[]): void
  setWarmth(level: number): void
  swell(): void
  hush(ms: number): void
  reset(): void
  toggleMute(): boolean
  isMuted(): boolean
}

export const silentAudio: AudioPort = {
  ensure: () => {},
  setVoices: () => {},
  setWarmth: () => {},
  swell: () => {},
  hush: () => {},
  reset: () => {},
  toggleMute: () => false,
  isMuted: () => false,
}

export interface AppDeps {
  audio?: AudioPort
  save?: (data: SaveData) => void
  load?: () => Promise<SaveData | null>
  clear?: () => void
  seed?: () => string
  /** 回饋停頓的倍率。測試傳 0 就不必等 */
  pace?: number
}

export interface App {
  start(): Promise<void>
  handleClick(ev: Event): void
  snapshot(): {
    view: 'town' | 'run'
    tab: TownTab
    meta: MetaState
    run: RunState | null
    selected: string[]
  }
}

/**
 * 音效與存檔是基礎設施，不是玩法。
 * 它們壞掉時應該安靜地消失，而不是把例外丟進遊戲邏輯裡 ——
 * 沒有聲音還能玩，點下去沒反應則是徹底壞掉。
 */
function shielded(audio: AudioPort): AudioPort {
  const wrap =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      try {
        fn(...args)
      } catch {
        /* 靜音勝過當機 */
      }
    }

  return {
    ensure: wrap(() => audio.ensure()),
    setVoices: wrap((alive: readonly boolean[]) => audio.setVoices(alive)),
    setWarmth: wrap((level: number) => audio.setWarmth(level)),
    swell: wrap(() => audio.swell()),
    hush: wrap((ms: number) => audio.hush(ms)),
    reset: wrap(() => audio.reset()),
    toggleMute: () => {
      try {
        return audio.toggleMute()
      } catch {
        return false
      }
    },
    isMuted: () => {
      try {
        return audio.isMuted()
      } catch {
        return false
      }
    },
  }
}

export function createApp(root: HTMLElement, deps: AppDeps = {}): App {
  const audio = shielded(deps.audio ?? silentAudio)
  const pace = deps.pace ?? 1

  let meta: MetaState = createMeta()
  let run: RunState | null = null
  let summary: RunSummary | null = null
  let selected: string[] = []
  let tab: TownTab = 'party'
  let expanded: string | null = null
  let wiping = false
  let busy = false
  let campTimer: ReturnType<typeof setTimeout> | undefined

  const delay = (ms: number) =>
    ms <= 0 ? Promise.resolve() : new Promise<void>((r) => setTimeout(r, ms))

  const nextSeed = deps.seed ?? (() => Math.random().toString(36).slice(2, 8))

  function persist(): void {
    try {
      deps.save?.({ version: 1, meta, run })
    } catch {
      /* 存不了檔也要能繼續玩 */
    }
  }

  function paint(deltas: HpDeltas = {}): void {
    if (run) {
      const quests = activeQuests(meta).map((q) => ({
        title: q.title,
        progress: describeProgress(q, run),
      }))
      root.innerHTML = render(run, { deltas, muted: audio.isMuted(), quests })
      root.classList.toggle('mood--ascent', run.direction === 'up' && !run.over)
      root.classList.toggle('mood--warm', run.endReason === 'surfaced')
    } else {
      root.innerHTML = renderTown({
        meta,
        selected,
        summary,
        muted: audio.isMuted(),
        wiping,
        tab,
        expanded,
      })
      root.classList.remove('mood--ascent')
      root.classList.toggle('mood--warm', summary?.surfaced ?? false)
    }
  }

  /** 聲部與暖度隨局勢改變（企劃書 16-2、16-4） */
  function syncAudio(): void {
    if (!run) {
      audio.setWarmth(0.85)
      return
    }
    audio.setVoices(run.party.map((c) => c.status === 'alive'))
    if (run.endReason === 'surfaced') audio.setWarmth(1)
    else if (run.over) audio.setWarmth(0)
    else if (run.direction === 'up') audio.setWarmth(0.12)
    else audio.setWarmth(0.5)
  }

  /**
   * 回饋節奏（企劃書 16-3、16-6）：重要的事情要慢，
   * 重大事件的表現是「靜止」而不是衝擊。
   */
  async function act(mutate: (r: RunState) => void, pause: number): Promise<void> {
    const current = run
    if (busy || !current) return
    busy = true
    root.classList.add('app--held')

    const beforeHp = Object.fromEntries(current.party.map((c) => [c.id, c.hp]))
    const beforeLog = current.log.length
    await delay(pause * pace)

    mutate(current)

    const deltas: HpDeltas = {}
    for (const c of current.party) {
      const prev = beforeHp[c.id]
      if (prev !== undefined && prev !== c.hp) deltas[c.id] = prev - c.hp
    }

    const grim = current.log.slice(beforeLog).some((e) => e.tone === 'grim')
    paint(deltas)
    syncAudio()
    persist()

    if (grim) {
      navigator.vibrate?.(30)
      audio.hush(1400)
      await delay(1400 * pace)
    }

    root.classList.remove('app--held')
    busy = false
  }

  function flashCamp(): void {
    clearTimeout(campTimer)
    root.classList.add('mood--camp')
    campTimer = setTimeout(() => root.classList.remove('mood--camp'), 4200)
  }

  // ─── 城鎮動作 ──────────────────────────────────────────────

  function depart(): void {
    const party = deployParty(meta, selected)
    if (party.length === 0) return

    const cost = loadoutCost(meta.loadout)
    if (cost > meta.funds) return
    meta.funds -= cost

    run = createRun(nextSeed(), {
      party,
      echoes: meta.lostSouls,
      supplies: meta.loadout,
    })
    summary = null
    audio.reset()
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
    selected = selected.filter((id) =>
      meta.roster.some((c) => c.id === id && c.status === 'alive'),
    )
    // 回城後從第一步開始，結算報告就在那一頁
    tab = 'party'
    audio.reset()
    paint()
    syncAudio()
    persist()
  }

  function togglePick(id: string): void {
    if (selected.includes(id)) selected = selected.filter((x) => x !== id)
    else if (selected.length < PARTY_SIZE) selected = [...selected, id]
    paint()
  }

  function wipe(): void {
    try {
      deps.clear?.()
    } catch {
      /* 清不掉舊檔也要能重來 */
    }
    meta = createMeta()
    run = null
    summary = null
    selected = []
    tab = 'party'
    wiping = false
    audio.reset()
    paint()
    persist()
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

  // ─── 事件 ──────────────────────────────────────────────────

  function handleClick(ev: Event): void {
    const target = ev.target as HTMLElement | null
    const el = target?.closest<HTMLElement>('button')
    if (!el || el.hasAttribute('disabled')) return

    audio.ensure()
    const d = el.dataset

    if (d.mute) {
      audio.toggleMute()
      paint()
      return
    }

    if (d.tab) {
      tab = d.tab as TownTab
      wiping = false
      paint()
      return
    }

    if (d.take) {
      takeQuest(meta, d.take)
      paint()
      persist()
      return
    }

    if (d.abandon) {
      abandonQuest(meta, d.abandon)
      paint()
      persist()
      return
    }

    if (d.rest) {
      advanceDays(meta, 1)
      paint()
      persist()
      return
    }

    if (d.detail) {
      expanded = expanded === d.detail ? null : d.detail
      paint()
      return
    }

    if (d.pick) return togglePick(d.pick)
    if (d.depart) return depart()
    if (d.cure) return cure(d.cure)
    if (d.return) return returnToTown()

    if (d.hire) {
      if (!hire(meta, d.hire)) return
      paint()
      persist()
      return
    }

    if (d.buy) {
      const [key, delta] = d.buy.split(':')
      if (!key || !delta) return
      adjustLoadout(meta, key as SupplyKey, Number(delta))
      paint()
      persist()
      return
    }

    // 清除是不可逆的，因此拆成兩步，而不是彈一個對話框
    if (d.wipe) {
      wiping = true
      paint()
      return
    }
    if (d.wipeCancel) {
      wiping = false
      paint()
      return
    }
    if (d.wipeConfirm) return wipe()

    const current = run
    if (!current) return

    if (d.node) return void act((r) => moveTo(r, d.node as string), 400)
    if (d.ascent) return void act((r) => beginAscent(r), 700)
    if (d.descend) return void act((r) => resumeDescent(r), 700)
    if (d.anchor) return void act((r) => useAnchor(r), 600)
    if (d.med) return void act((r) => useMedicine(r, d.med as string), 250)
    if (d.ward) return void act((r) => setBurden(r, 'ward', d.ward as string), 600)

    if (d.camp) {
      return void act((r) => {
        camp(r)
        flashCamp()
        audio.swell()
        audio.setWarmth(1)
      }, 300)
    }

    if (d.relic) {
      // 使用遺物必定伴隨代價，給玩家看完自己做的決定
      return void act((r) => useEscapeRelic(r, d.relic as string), 900)
    }

    if (d.burden === 'spread') {
      setBurden(current, 'spread', null)
      paint()
      return
    }

    if (d.drop) {
      // 丟東西是即時的 —— 它已經夠痛了，不需要再加停頓
      const corpse = current.carried.find((i) => i.id === d.drop)?.kind === 'corpse'
      dropItem(current, d.drop)
      paint()
      persist()
      if (corpse) {
        navigator.vibrate?.(30)
        audio.hush(1400)
      }
      return
    }

    if (d.dropSupply) {
      dropSupply(current, d.dropSupply as SupplyKey)
      paint()
      persist()
    }
  }

  async function start(): Promise<void> {
    const saved = await deps.load?.()
    if (saved) {
      meta = normalizeMeta(saved.meta)
      run = saved.run
    }
    if (!run) replenish(meta)
    root.addEventListener('click', handleClick)
    paint()
  }

  return {
    start,
    handleClick,
    snapshot: () => ({ view: run ? 'run' : 'town', tab, meta, run, selected }),
  }
}
