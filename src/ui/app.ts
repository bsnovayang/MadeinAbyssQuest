import { afflictionById } from '../core/affliction'
import {
  abandonQuest,
  activeQuests,
  adjustLoadout,
  advanceDays,
  clampLoadoutToFunds,
  concludeRun,
  departCost,
  createMeta,
  deployParty,
  hire,
  identifyRelic,
  normalizeMeta,
  PARTY_SIZE,
  replenish,
  sellRelic,
  setDepartDepth,
  takeQuest,
  toggleTakeDown,
  withdrawRelics,
  type MetaState,
  type RunSummary,
} from '../core/meta'
import {
  battleAct,
  battleFlee,
  beginAscent,
  camp,
  createRun,
  dropItem,
  dropSupply,
  moveTo,
  normalizeRun,
  resumeDescent,
  setBurden,
  useAnchor,
  useEscapeRelic,
  useMedicine,
} from '../core/run'
import type { SfxName } from '../audio/sfx'
import type { BattleState } from '../core/battle'
import { layerAt } from '../core/depth'
import { describeProgress } from '../core/quests'
import type { RunState, SupplyKey } from '../core/types'
import { diffBattle, HEAVY_SHARE, snapshotBattle, type BattleFx } from './battle'
import { createPanelState, togglePanel, type PanelId } from './panels'
import { decayOf, render, type HpDeltas } from './render'
import { clearToasts, showToasts, type ToastLine } from './toast'
import type { SaveData } from './storage'
import { renderTown, type TownTab } from './town'

export type MusicScene = 'town' | 'explore' | 'battle'

/** 戰鬥在最後一擊結束時，停在戰鬥畫面多久才回到探索 */
const FINAL_BLOW_MS = 1100

/** 撤離歸途沿用探索曲，但聲音變悶（企劃書 15-5b） */
export const ASCENT_WARMTH = 0.35

/** 音效與存檔都從外面注入，讓整個 UI 層可以在 jsdom 裡被真的點擊 */
export interface AudioPort {
  ensure(): void
  /** 換場景時配樂淡入淡出 */
  setScene(scene: MusicScene): void
  /** 0 = 悶、冷；1 = 溫暖、開闊 */
  setWarmth(level: number): void
  swell(): void
  hush(ms: number): void
  /** 材質音效（企劃書 16-1）。音效關著時什麼也不做 */
  sfx(name: SfxName, strength?: number): void
  /** 回傳切換後是否關著 */
  toggleMusic(): boolean
  isMusicMuted(): boolean
  /** 回傳切換後是否關著 */
  toggleSfx(): boolean
  isSfxMuted(): boolean
}

export const silentAudio: AudioPort = {
  ensure: () => {},
  setScene: () => {},
  setWarmth: () => {},
  swell: () => {},
  hush: () => {},
  sfx: () => {},
  toggleMusic: () => false,
  isMusicMuted: () => false,
  toggleSfx: () => false,
  isSfxMuted: () => false,
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
    setScene: wrap((scene: MusicScene) => audio.setScene(scene)),
    setWarmth: wrap((level: number) => audio.setWarmth(level)),
    swell: wrap(() => audio.swell()),
    hush: wrap((ms: number) => audio.hush(ms)),
    sfx: wrap((name: SfxName, strength?: number) => audio.sfx(name, strength)),
    toggleMusic: flag(() => audio.toggleMusic()),
    isMusicMuted: flag(() => audio.isMusicMuted()),
    toggleSfx: flag(() => audio.toggleSfx()),
    isSfxMuted: flag(() => audio.isSfxMuted()),
  }
}

function flag(fn: () => boolean): () => boolean {
  return () => {
    try {
      return fn()
    } catch {
      return false
    }
  }
}

export function createApp(root: HTMLElement, deps: AppDeps = {}): App {
  const audio = shielded(deps.audio ?? silentAudio)
  const pace = deps.pace ?? 1

  // 提示活在重繪之外，因此展開面板不會讓它重播
  const view = document.createElement('div')
  const toasts = document.createElement('div')
  toasts.className = 'toasts'
  root.replaceChildren(view, toasts)

  const panels = createPanelState()
  let shownLogId = 0
  let shownBattleLines = 0
  let battleRef: BattleState | null = null

  let meta: MetaState = createMeta()
  let run: RunState | null = null
  let summary: RunSummary | null = null
  let selected: string[] = []
  let tab: TownTab = 'party'
  let expanded: string | null = null
  let battleTarget: string | null = null
  let wiping = false
  // 只播一次的揭曉：畫過一次就清掉，換分頁不重播
  let revealed: string | null = null
  let freshSummary = false
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

  /** 取出上一次動作之後新增的訊息，交給提示層 */
  function drainToasts(): ToastLine[] {
    const out: ToastLine[] = []
    if (!run) return out

    // 結算時整份戰鬥紀錄會抄進筆記；已經提示過的，不要在戰鬥結束時再跳一次
    let copied = 0
    if (run.battle !== battleRef) {
      if (battleRef && !run.battle) {
        for (const line of battleRef.log.slice(shownBattleLines)) {
          out.push({ text: line, tone: 'plain' })
        }
        copied = battleRef.log.length
      }
      battleRef = run.battle
      shownBattleLines = 0
    }
    if (run.battle) {
      for (const line of run.battle.log.slice(shownBattleLines)) {
        out.push({ text: line, tone: 'plain' })
      }
      shownBattleLines = run.battle.log.length
    }

    for (const e of run.log) {
      if (e.id <= shownLogId) continue
      if (copied > 0) {
        copied -= 1
        continue
      }
      out.push({ text: e.text, tone: e.tone })
    }
    shownLogId = run.log[run.log.length - 1]?.id ?? shownLogId

    return out
  }

  function paint(
    deltas: HpDeltas = {},
    fx: { battleFx?: BattleFx; finalBattle?: BattleState } = {},
  ): void {
    if (run) {
      const quests = activeQuests(meta).map((q) => ({
        title: q.title,
        progress: describeProgress(q, run),
      }))
      // 目標死了或戰鬥結束就別再指著它
      if (!run.battle) battleTarget = null
      view.innerHTML = render(run, {
        deltas,
        muted: audio.isMusicMuted(),
        sfxMuted: audio.isSfxMuted(),
        quests,
        target: battleTarget,
        panels,
        ...fx,
      })
      root.classList.toggle('mood--ascent', run.direction === 'up' && !run.over)
      root.classList.toggle('mood--warm', run.endReason === 'surfaced')
      // 筆記本隨深度劣化（企劃書 15-3）
      root.dataset.decay = String(decayOf(run))
    } else {
      delete root.dataset.decay
      view.innerHTML = renderTown({
        meta,
        selected,
        summary,
        muted: audio.isMusicMuted(),
        sfxMuted: audio.isSfxMuted(),
        wiping,
        tab,
        expanded,
        revealed,
        freshSummary,
      })
      revealed = null
      freshSummary = false
      root.classList.remove('mood--ascent')
      root.classList.toggle('mood--warm', summary?.surfaced ?? false)
    }
  }

  /** 配樂隨局勢改變（企劃書 15-5b、16-4） */
  function syncAudio(): void {
    // 平安回到地表 —— 城鎮曲完整響起
    if (!run || run.endReason === 'surfaced') {
      audio.setScene('town')
      audio.setWarmth(1)
      return
    }
    audio.setScene(run.battle ? 'battle' : 'explore')
    if (run.over) audio.setWarmth(0)
    else if (run.direction === 'up') audio.setWarmth(ASCENT_WARMTH)
    else audio.setWarmth(1)
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
    const beforeLayer = layerAt(current.depth).id
    const beforeNode = current.current.id
    const beforeItems = current.carried.filter((i) => i.kind !== 'corpse').length
    const beforeDays = current.daysElapsed
    await delay(pause * pace)

    const battle = current.battle
    const beforeBattle = battle ? snapshotBattle(battle) : null
    mutate(current)

    const deltas: HpDeltas = {}
    for (const c of current.party) {
      const prev = beforeHp[c.id]
      if (prev !== undefined && prev !== c.hp) deltas[c.id] = prev - c.hp
    }

    const battleFx = battle && beforeBattle ? diffBattle(beforeBattle, battle) : undefined
    const finished = !!battle && !current.battle

    // 戰鬥裡的死亡在倒下的那一刻表現；結算時寫下的「停下了」不再重複靜止一次
    const grim = battle
      ? (battleFx?.downed ?? []).some(
          (id) => battle.combatants.find((c) => c.id === id)?.side === 'party',
        )
      : current.log.slice(beforeLog).some((e) => e.tone === 'grim')

    // 戰鬥在這一擊結束 —— 先停在戰鬥畫面，讓玩家看見最後一擊
    paint(finished ? {} : deltas, { battleFx, finalBattle: finished ? battle : undefined })

    const found = current.carried.filter((i) => i.kind !== 'corpse').length > beforeItems
    const lines = drainToasts()
    const lastLine = lines[lines.length - 1]
    if (found && lastLine && !grim) lastLine.doodle = true
    showToasts(toasts, lines)
    persist()

    const layer = layerAt(current.depth)
    const layerChanged = layer.id !== beforeLayer
    // 進入新的一層是儀式，就算伴隨著壞消息也要寫上標題
    if (layerChanged) showLayerTitle(layer.id, layer.name)

    // 重大事件的表現是靜止，不配音效（企劃書 16-3）
    if (!grim) {
      actionSounds(battle, battleFx, {
        moved: current.current.id !== beforeNode,
        layerChanged,
        found,
        camped: current.daysElapsed > beforeDays,
      })
    }

    if (grim) {
      navigator.vibrate?.(30)
      audio.hush(1400)
    }

    if (finished) {
      await delay(FINAL_BLOW_MS * pace)
      paint(deltas)
    }
    syncAudio()

    if (grim) await delay(Math.max(0, 1400 - (finished ? FINAL_BLOW_MS : 0)) * pace)

    root.classList.remove('app--held')
    busy = false
  }

  /** 一次行動的材質音效：翻頁、鉛筆、扣環、火堆（企劃書 16-8） */
  function actionSounds(
    battle: BattleState | null,
    fx: BattleFx | undefined,
    e: { moved: boolean; layerChanged: boolean; found: boolean; camped: boolean },
  ): void {
    if (battle && fx) {
      const hits = Object.entries(fx.hp).filter(([, d]) => d > 0)
      if (fx.downed.length > 0) {
        audio.sfx('strike')
      } else if (hits.length > 0) {
        const heavy = hits.some(([id, d]) => {
          const unit = battle.combatants.find((c) => c.id === id)
          return !!unit && d >= unit.maxHp * HEAVY_SHARE
        })
        audio.sfx('pencil', heavy ? 1.6 : 1)
      }
    } else if (e.moved) {
      audio.sfx('page', e.layerChanged ? 1.6 : 1)
    }
    if (e.found) audio.sfx('buckle')
    if (e.camped) audio.sfx('fire')
  }

  /** 進入新的一層：跨頁的手寫標題，停留一下再淡掉（企劃書 16-8） */
  function showLayerTitle(id: number, name: string): void {
    const el = document.createElement('div')
    el.className = 'layer-title'
    const no = document.createElement('span')
    no.className = 'layer-title__no'
    no.textContent = `第${id}層`
    const label = document.createElement('span')
    label.className = 'layer-title__name'
    label.textContent = name
    el.append(no, label)
    root.appendChild(el)
    setTimeout(() => el.remove(), 3200)
  }

  /** 資金數字滾動到新的值。系統設定減少動態效果時直接跳到結果 */
  function rollFunds(from: number, to: number): void {
    const el = view.querySelector<HTMLElement>('[data-funds]')
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!el || from === to || pace <= 0 || still) return

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200)
      el.textContent = String(Math.round(from + (to - from) * (1 - (1 - t) ** 3)))
      if (t < 1) requestAnimationFrame(tick)
    }
    el.textContent = String(from)
    requestAnimationFrame(tick)
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

    const cost = departCost(meta)
    if (cost > meta.funds) return
    meta.funds -= cost

    run = createRun(nextSeed(), {
      party,
      echoes: meta.lostSouls,
      supplies: meta.loadout,
      startDepth: meta.departDepth,
      carried: withdrawRelics(meta),
    })
    summary = null
    shownLogId = 0
    shownBattleLines = 0
    battleRef = null
    clearToasts(toasts)
    root.classList.remove('mood--camp')
    paint()
    audio.sfx('page', 1.3)
    syncAudio()
    persist()
  }

  function returnToTown(): void {
    if (!run) return
    const fundsBefore = meta.funds
    const report = concludeRun(meta, run)
    summary = report
    run = null
    replenish(meta)
    selected = selected.filter((id) =>
      meta.roster.some((c) => c.id === id && c.status === 'alive'),
    )
    // 回城後從第一步開始，結算報告就在那一頁
    tab = 'party'
    freshSummary = true
    clearToasts(toasts)
    paint()
    rollFunds(fundsBefore, meta.funds)
    if (report.surfaced) audio.sfx('coin', 1.4)
    // 印章蓋在結算寫完之後
    if (report.promoted) setTimeout(() => audio.sfx('stamp'), 1400 * pace)
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
    paint()
    syncAudio()
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
      if (d.mute === 'sfx') {
        // 打開音效時出個聲，讓玩家知道真的打開了
        if (!audio.toggleSfx()) audio.sfx('pencil')
      } else {
        audio.toggleMusic()
      }
      paint()
      return
    }

    if (d.tab) {
      tab = d.tab as TownTab
      wiping = false
      audio.sfx('page', 0.5)
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

    if (d.identify) {
      if (identifyRelic(meta, d.identify)) {
        revealed = d.identify
        audio.sfx('write')
      }
      paint()
      persist()
      return
    }

    if (d.sell) {
      const before = meta.funds
      if (sellRelic(meta, d.sell)) audio.sfx('coin')
      paint()
      rollFunds(before, meta.funds)
      persist()
      return
    }

    if (d.takeDown) {
      toggleTakeDown(meta, d.takeDown)
      paint()
      persist()
      return
    }

    if (d.hire) {
      if (!hire(meta, d.hire)) return
      audio.sfx('buckle')
      paint()
      persist()
      return
    }

    if (d.departAt) {
      setDepartDepth(meta, Number(d.departAt))
      clampLoadoutToFunds(meta)
      paint()
      persist()
      return
    }

    if (d.buy) {
      const [key, delta] = d.buy.split(':')
      if (!key || !delta) return
      adjustLoadout(meta, key as SupplyKey, Number(delta))
      audio.sfx('coin', 0.4)
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

    // ── 戰鬥 ──
    if (d.panel) {
      const up = run?.direction === 'up'
      togglePanel(panels, d.panel as PanelId, d.panel === 'party' ? !!up : false)
      paint()
      return
    }

    if (d.target) {
      battleTarget = d.target
      paint()
      return
    }

    if (d.skill) {
      return void act((r) => battleAct(r, d.skill as string, battleTarget), 260)
    }

    if (d.flee) {
      return void act((r) => battleFlee(r), 400)
    }

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
        // 漲起之後自己回到原本的暖度，歸途上紮營也不會把悶掉的聲音打開
        audio.swell()
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
      } else {
        audio.sfx('thud')
      }
      return
    }

    if (d.dropSupply) {
      dropSupply(current, d.dropSupply as SupplyKey)
      audio.sfx('thud', 0.6)
      paint()
      persist()
    }
  }

  async function start(): Promise<void> {
    const saved = await deps.load?.()
    if (saved) {
      meta = normalizeMeta(saved.meta)
      run = saved.run ? normalizeRun(saved.run) : null
    }
    if (!run) replenish(meta)
    root.addEventListener('click', handleClick)
    paint()
    syncAudio()
  }

  return {
    start,
    handleClick,
    snapshot: () => ({ view: run ? 'run' : 'town', tab, meta, run, selected }),
  }
}
