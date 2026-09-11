import {
  awaitingActor,
  createBattle,
  flee,
  living,
  skillsOfActor,
  useSkill,
} from './battle'
import { distributeBurden, hasWardRelic, tierFor } from './curse'
import { layerAt, valueMultiplier, waterCostAt } from './depth'
import { generateChoices, makeNode } from './map'
import { phantomChance, PHANTOM_ENTRIES } from './perception'
import { hashSeed, nextInt, pick } from './rng'
import { runBehaviors } from './traits'
import type {
  AbyssNode,
  Aftermath,
  BurdenMode,
  Character,
  Item,
  LogTone,
  LostSoul,
  RunState,
  Supplies,
  SupplyKey,
} from './types'
import {
  capacityOf,
  encumbranceOf,
  extraWaterCost,
  totalWeight,
  type Encumbrance,
} from './weight'
import { BANTER, BANTER_AFTER_LOSS } from '../data/banter'
import { LOOT } from '../data/loot'
import { startingParty, startingSupplies } from '../data/party'
import { RELIC_DEFS, relicById, type RelicCost } from '../data/relics'
import { KNOCKOUT, skillById, type SkillDef } from '../data/skills'

export interface RunOptions {
  party?: Character[]
  echoes?: LostSoul[]
  supplies?: Supplies
  /** 從前線基地出發時的起始深度（企劃書 6-4）。0 = 從地表走下去 */
  startDepth?: number
  /** 從倉庫帶下去的遺物 */
  carried?: Item[]
}

export function createRun(seed: string, options: RunOptions = {}): RunState {
  const rngState = hashSeed(seed)
  const start = Math.max(0, options.startDepth ?? 0)
  const [entrance, s1] = makeNode(rngState, 0, start, 'rest')
  const gen = generateChoices(s1, 1, start, 'down')

  const state: RunState = {
    seed,
    rngState: gen.rngState,
    depth: start,
    // 從基地出發也要從那個深度爬回地表，代價一分不少
    maxDepthReached: start,
    direction: 'down',
    party: options.party ?? startingParty(),
    echoes: options.echoes ?? [],
    battle: null,
    sleepers: {},
    aftermath: [],
    supplies: { ...(options.supplies ?? startingSupplies()) },
    carried: (options.carried ?? []).map((i) => ({ ...i })),
    exhaustion: 0,
    daysElapsed: 0,
    burden: { mode: 'spread', targetId: null },
    ascentSteps: 0,
    current: entrance,
    choices: gen.choices,
    log: [],
    nextLogId: 1,
    nextNodeId: gen.nextNodeId,
    over: false,
    endReason: null,
  }

  push(
    state,
    start > 0
      ? `從前線基地重新出發。上面那幾層已經走過了，但回去的時候一層也少不了。`
      : '深淵之淵的入口。從這裡開始，往下都是自由的。',
    start > 0 ? 'cold' : 'warm',
  )
  return state
}

/**
 * 讀取舊存檔時補齊後來才加上的欄位。
 *
 * RunState 一路長出了 echoes、battle、aftermath —— 每加一個欄位，
 * 舊存檔就多一種炸掉的方式。存檔是系統邊界，補齊要在這裡做，
 * 而不是散在每個讀取它的地方。
 */
export function normalizeRun(run: RunState): RunState {
  run.party ??= []
  run.echoes ??= []
  run.carried ??= []
  run.log ??= []
  run.choices ??= []
  run.aftermath ??= []
  run.battle ??= null
  run.sleepers ??= {}
  run.supplies ??= startingSupplies()
  run.burden ??= { mode: 'spread', targetId: null }
  run.exhaustion ??= 0
  run.daysElapsed ??= 0
  run.ascentSteps ??= 0
  run.maxDepthReached ??= run.depth ?? 0
  run.nextLogId ??= run.log.length + 1
  run.nextNodeId ??= run.choices.length + 1

  for (const c of run.party) {
    c.afflictions ??= []
    c.traits ??= []
    c.bonds ??= {}
    c.bio ??= ''
  }

  return run
}

// ─── 衍生狀態 ────────────────────────────────────────────────

export function aliveMembers(state: RunState): Character[] {
  return state.party.filter((c) => c.status === 'alive')
}

export function hasLoss(state: RunState): boolean {
  return state.party.some((c) => c.status !== 'alive')
}

type RepairBill = Extract<Aftermath, { kind: 'repair' }>

/**
 * 這一趟累積、回奧斯城要付的檢修費（企劃書 12-1c）。
 * 人沒有活著回去就不收，所以只算還活著的人。
 */
export function repairBill(state: RunState): { shots: number; total: number } {
  const bills = state.aftermath.filter(
    (a): a is RepairBill =>
      a.kind === 'repair' && state.party.some((c) => c.id === a.charId && c.status === 'alive'),
  )
  return { shots: bills.length, total: bills.reduce((sum, a) => sum + a.amount, 0) }
}

/** 放完火葬砲昏睡中（規則見 data/skills.ts 的 KNOCKOUT） */
export function isAsleep(state: RunState, id: string): boolean {
  return (state.sleepers[id] ?? 0) > 0
}

/** 醒著、能戰鬥的人 */
export function awakeMembers(state: RunState): Character[] {
  return aliveMembers(state).filter((c) => !isAsleep(state, c.id))
}

function sleepingMembers(state: RunState): Character[] {
  return aliveMembers(state).filter((c) => isAsleep(state, c.id))
}

export function loadOf(state: RunState): number {
  return (
    totalWeight(state.supplies, state.carried) +
    sleepingMembers(state).length * KNOCKOUT.bodyWeight
  )
}

export function capacityOfRun(state: RunState): number {
  const bonus = runBehaviors(state.party, state.carried).carry
  return Math.max(4, capacityOf(state.party) + bonus)
}

export function encumbranceOfRun(state: RunState): Encumbrance {
  return encumbranceOf(loadOf(state), capacityOfRun(state))
}

export function canMove(state: RunState): boolean {
  return !state.over && encumbranceOfRun(state) !== 'critical'
}

export function canCamp(state: RunState): boolean {
  return (
    !state.over &&
    state.current.kind === 'rest' &&
    state.supplies.food >= campFoodCost(state)
  )
}

export function canUseAnchor(state: RunState): boolean {
  return !state.over && state.current.kind === 'anchor' && state.supplies.rope >= 1
}

/**
 * 現場用得掉的遺物。
 *
 * 未鑑定的一律列入 —— 如果只列出脫離型的，等於免費告訴玩家那是什麼。
 * 不知道會發生什麼，才是「現場使用」的賭注所在。
 */
export function usableRelics(state: RunState): Item[] {
  return state.carried.filter((i) => {
    if (i.kind !== 'relic') return false
    if (!i.identified) return true
    const def = i.relicId ? relicById(i.relicId) : undefined
    return def?.kind === 'escape'
  })
}

export function totalValue(state: RunState): number {
  return state.carried.reduce((sum, i) => sum + i.value, 0)
}

// ─── 方向切換 ────────────────────────────────────────────────

/**
 * 宣告返回。撤離途中仍可再往下（企劃書 7-5）—— 已產生的負荷不會消失，
 * 因此不需要額外的防作弊規則：再下去一次，回程只會更痛。
 */
export function beginAscent(state: RunState): void {
  if (state.over || state.direction === 'up') return
  state.direction = 'up'
  state.ascentSteps = 0
  const tier = tierFor(state.depth)
  push(state, `決定回去。從這裡往上，每一步都要付${tier.name}的代價。`, 'cold')
  regenChoices(state)
}

export function resumeDescent(state: RunState): void {
  if (state.over || state.direction === 'down') return
  state.direction = 'down'
  push(state, '又往下看了一眼。已經受的傷不會因此消失。', 'cold')
  regenChoices(state)
}

export function setBurden(state: RunState, mode: BurdenMode, targetId: string | null): void {
  if (mode === 'ward') {
    if (!hasWardRelic(state)) return
    const target = state.party.find((c) => c.id === targetId && c.status === 'alive')
    if (!target || target.immuneToCurse) return
    state.burden = { mode: 'ward', targetId: target.id }
    push(state, `把籠子掛到了${target.name}身上。他沒有問為什麼。`, 'grim')
    return
  }
  state.burden = { mode: 'spread', targetId: null }
}

// ─── 移動 ────────────────────────────────────────────────────

export function moveTo(state: RunState, nodeId: string): void {
  if (state.over) return
  const node = state.choices.find((n) => n.id === nodeId)
  if (!node) return

  const enc = encumbranceOfRun(state)
  if (enc === 'critical') {
    push(state, '背負的重量讓人動彈不得。必須先丟掉一些東西。', 'cold')
    return
  }

  const fromLayer = layerAt(state.depth).id
  state.depth = node.depth
  state.maxDepthReached = Math.max(state.maxDepthReached, node.depth)
  state.current = node

  const toLayer = layerAt(state.depth).id
  if (toLayer !== fromLayer) {
    push(state, `已進入第${toLayer}層　${layerAt(state.depth).name}。`, 'cold')
    // 玩家有權知道自己的儀表開始不可靠，恐怖不該被誤認成 bug
    if (toLayer === 4 && fromLayer < 4) {
      push(state, '筆記上的字開始抖。從這裡開始，數字不一定準。', 'grim')
    }
    if (toLayer === 5 && fromLayer < 5) {
      push(state, '有些條目不是自己寫的。不要相信這本筆記。', 'grim')
    }
  }

  spawnPhantom(state)

  spendWater(state, waterCostAt(state.depth) + extraWaterCost(enc))
  tickSleepers(state)

  if (state.direction === 'up') {
    state.ascentSteps += 1
    applyCurse(state)
  }

  if (!state.over) resolveNode(state, node)

  // 打起來了就停在這裡，等戰鬥收場再繼續這一步
  if (state.battle) return

  completeStep(state)
}

/** 揹著走完一步。睡夠了就醒來 */
function tickSleepers(state: RunState): void {
  for (const [id, steps] of Object.entries(state.sleepers)) {
    if (steps > 1) {
      state.sleepers[id] = steps - 1
      continue
    }
    delete state.sleepers[id]
    const member = state.party.find((c) => c.id === id)
    if (member?.status === 'alive') push(state, `${member.name}醒過來了。`, 'warm')
  }
}

function completeStep(state: RunState): void {
  applyExhaustion(state)
  reapDead(state)

  if (state.direction === 'up' && state.depth <= 0 && !state.over) {
    surface(state, '回到了地表。陽光刺得眼睛發痛。')
    return
  }

  if (!state.over) regenChoices(state)
  else state.choices = []
}

function regenChoices(state: RunState): void {
  const gen = generateChoices(state.rngState, state.nextNodeId, state.depth, state.direction)
  state.rngState = gen.rngState
  state.nextNodeId = gen.nextNodeId
  state.choices = gen.choices
}

// ─── 上升負荷 ────────────────────────────────────────────────

function applyCurse(state: RunState): void {
  const share = distributeBurden(state)
  for (const c of state.party) {
    if (c.status !== 'alive') continue
    const amount = share[c.id] ?? 0
    if (amount <= 0) continue

    const before = c.tolerance
    c.tolerance = Math.max(0, c.tolerance - amount)

    if (before > 0 && c.tolerance === 0) {
      push(state, `${c.name}再也撐不住了。`, 'grim')
    }

    // 耐受度歸零後，負荷直接傷及身體
    const overflow = amount - before
    if (overflow > 0) damage(state, c, overflow * 2)
  }
}

// ─── 撤離手段 ────────────────────────────────────────────────

export function useAnchor(state: RunState): void {
  if (!canUseAnchor(state)) return

  state.supplies.rope -= 1
  state.direction = 'up'

  const layer = layerAt(state.depth)
  const target = Math.max(0, layer.from - 1)

  // 錨點省的是路途，不是代價
  for (let i = 0; i < 3; i++) {
    if (state.over) break
    applyCurse(state)
  }

  state.depth = target
  state.ascentSteps += 3
  push(state, '升降裝置勉強動了。上升了一整層。', 'cold')

  reapDead(state)
  if (state.over) {
    state.choices = []
    return
  }
  if (state.depth <= 0) {
    surface(state, '回到了地表。陽光刺得眼睛發痛。')
    return
  }
  regenChoices(state)
}

export function useEscapeRelic(state: RunState, itemId: string): void {
  if (state.over) return
  const idx = state.carried.findIndex((i) => i.id === itemId)
  const item = state.carried[idx]
  if (!item?.relicId) return
  const def = relicById(item.relicId)
  if (!def) return

  // 用了就知道它是什麼了 —— 這正是現場使用的代價與收穫
  if (!item.identified) {
    item.identified = true
    item.name = def.name
    push(state, `原來是${def.name}。${def.effect}。`, 'cold')
  }

  if (def.kind !== 'escape') {
    push(state, `${def.name}沒辦法用來離開這裡。它只是掛在身上。`, 'plain')
    return
  }

  state.carried.splice(idx, 1)
  payRelicCost(state, def.escapeCost ?? { kind: 'none' })

  if (aliveMembers(state).length === 0) {
    state.over = true
    state.endReason = 'wiped'
    state.choices = []
    return
  }

  surface(state, `${def.name}生效了。回到了地表。`)
}

/**
 * 代價一定會發生。
 * 超出這一趟範圍的（十年、資金、永久損傷）留給城鎮結算。
 */
function payRelicCost(state: RunState, cost: RelicCost): void {
  switch (cost.kind) {
    case 'none':
      return

    case 'loseMember': {
      const alive = aliveMembers(state)
      if (alive.length === 0) return
      const victim =
        cost.pick === 'weakest'
          ? alive.reduce((a, c) => (c.hp < a.hp ? c : a), alive[0] as Character)
          : (() => {
              const [i, s] = nextInt(state.rngState, 0, alive.length - 1)
              state.rngState = s
              return alive[i] as Character
            })()
      victim.status = 'lost'
      push(state, `${victim.name}被留在原地。他沒有掙扎。`, 'grim')
      return
    }

    case 'burn': {
      const keep = (i: Item) =>
        cost.what === 'loot' ? i.kind !== 'loot' : cost.what === 'relics' ? i.kind !== 'relic' : false
      const before = state.carried.length
      state.carried = state.carried.filter(keep)
      push(state, `${before - state.carried.length} 件東西化成了灰。`, 'grim')
      return
    }

    case 'funds':
      state.aftermath.push({ kind: 'fundsRatio', ratio: cost.ratio })
      push(state, '這筆帳要回到地表才付得完。', 'grim')
      return

    case 'days':
      state.aftermath.push({ kind: 'days', amount: cost.amount })
      push(state, '外面的世界不會等你。', 'grim')
      return

    case 'afflict': {
      const alive = aliveMembers(state)
      const victims =
        cost.who === 'all'
          ? alive
          : alive.length === 0
            ? []
            : [alive.reduce((a, c) => (c.tolerance < a.tolerance ? c : a), alive[0] as Character)]
      for (const v of victims) state.aftermath.push({ kind: 'affliction', charId: v.id })
      if (victims.length) {
        push(state, `${victims.map((v) => v.name).join('、')}身上留下了不會消失的東西。`, 'grim')
      }
      return
    }

    case 'questsFail':
      state.aftermath.push({ kind: 'questsFail' })
      push(state, '回去以後沒有人會相信你們走過那裡。', 'grim')
      return
  }
}

export function useMedicine(state: RunState, memberId: string): void {
  if (state.over || state.supplies.medicine <= 0) return
  const target = state.party.find((c) => c.id === memberId && c.status === 'alive')
  if (!target) return

  state.supplies.medicine -= 1
  target.tolerance = Math.min(target.maxTolerance, target.tolerance + 6)
  push(state, `給${target.name}用了藥。臉色好了一些，只是好了一些。`, 'plain')
}

function surface(state: RunState, text: string): void {
  state.depth = 0
  state.over = true
  state.endReason = 'surfaced'
  state.choices = []
  push(state, text, 'warm')
}

// ─── 其他動作 ────────────────────────────────────────────────

export function campFoodCost(state: RunState): number {
  return 1 + runBehaviors(state.party, state.carried).appetite
}

export function camp(state: RunState): void {
  if (!canCamp(state)) return

  const behaviors = runBehaviors(state.party, state.carried)
  state.supplies.food = Math.max(0, state.supplies.food - campFoodCost(state))
  state.daysElapsed += 1

  // 上升負荷不是疲勞，睡一覺治不好它。
  // 歸途上紮營只能養傷，耐受度只有藥品與娜娜奇那類能力救得回來。
  const restoresTolerance = state.direction === 'down'

  for (const c of aliveMembers(state)) {
    c.hp = Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * 0.3))
    if (restoresTolerance) {
      c.tolerance = Math.min(c.maxTolerance, c.tolerance + 4 + behaviors.camp)
    }
  }

  if (state.exhaustion > 0) state.exhaustion = Math.max(0, state.exhaustion - 1)

  // 紮營可以把睡著的人叫醒 —— 花一天和一份食物，換掉揹人的重量
  for (const id of Object.keys(state.sleepers)) {
    delete state.sleepers[id]
    const member = state.party.find((c) => c.id === id)
    if (member?.status === 'alive') push(state, `${member.name}被火堆的聲音吵醒了。`, 'warm')
  }

  const lines = hasLoss(state) ? BANTER_AFTER_LOSS : BANTER
  const [line, s] = pick(state.rngState, lines)
  state.rngState = s
  push(state, line, 'warm')

  if (!restoresTolerance) {
    push(state, '傷口好了一些。但那份沉重不會因為睡一覺就消失。', 'cold')
  }
}

export function dropItem(state: RunState, itemId: string): void {
  const idx = state.carried.findIndex((i) => i.id === itemId)
  const item = state.carried[idx]
  if (!item) return
  state.carried.splice(idx, 1)

  if (state.burden.mode === 'ward' && !hasWardRelic(state)) {
    state.burden = { mode: 'spread', targetId: null }
  }

  if (item.kind === 'corpse') {
    const owner = state.party.find((c) => c.id === item.ownerId)
    if (owner) owner.status = 'lost'
    push(state, `把${item.name}留下了。深淵會留住他。`, 'grim')
    return
  }

  push(state, `丟下了${item.name}。走了這麼遠才拿到的。`, 'cold')
}

/**
 * 補給也必須可以丟棄，否則隊伍減員導致容量暴跌時會卡死
 * —— 補給本身就有重量（企劃書 8-1）。
 */
export function dropSupply(state: RunState, key: SupplyKey): void {
  if (state.supplies[key] <= 0) return
  state.supplies[key] -= 1
  push(state, '減輕了一些負擔。丟掉的東西之後大概會需要。', 'cold')
}

// ─── 節點結算 ────────────────────────────────────────────────

function resolveNode(state: RunState, node: AbyssNode): void {
  switch (node.kind) {
    case 'empty':
      push(state, `${node.label}。什麼也沒有發生。`, 'plain')
      break

    case 'forage': {
      const bonus = runBehaviors(state.party, state.carried).forage
      const [rawFood, s1] = nextInt(state.rngState, 0, 2)
      const [rawWater, s2] = nextInt(s1, 1, 3)
      state.rngState = s2
      const gainFood = Math.max(0, rawFood + bonus)
      const gainWater = Math.max(0, rawWater + bonus)
      state.supplies.food += gainFood
      state.supplies.water += gainWater
      push(state, `${node.label}。補充了食物 ${gainFood}、水 ${gainWater}。`, 'warm')
      break
    }

    case 'rest':
      push(state, `${node.label}。可以在這裡紮營。`, 'warm')
      break

    case 'obstacle':
      if (runBehaviors(state.party, state.carried).ropeless) {
        push(state, `${node.label}。雷格伸長手臂，把所有人送了過去。`, 'plain')
      } else if (state.supplies.rope > 0) {
        state.supplies.rope -= 1
        push(state, `${node.label}。架設繩索通過了。`, 'plain')
      } else {
        push(state, `${node.label}。沒有繩索，只能徒手攀爬。`, 'cold')
        for (const c of aliveMembers(state)) damage(state, c, 3)
      }
      break

    case 'encounter':
      resolveEncounter(state, node)
      break

    case 'relic': {
      const [def, s1] = pick(state.rngState, RELIC_DEFS)
      state.rngState = s1
      // 深淵裡撿到的東西沒有標籤（企劃書 10-5）
      addItem(state, {
        name: def.appearance,
        weight: def.weight,
        value: def.value,
        kind: 'relic',
        identified: false,
        relicId: def.id,
      })
      push(state, `${node.label}。是遺物 —— ${def.appearance}，${def.weight}kg。`, 'warm')
      push(state, '沒有人知道它是什麼。帶回去鑑定，或者現在就試試看。', 'cold')
      break
    }

    case 'anchor':
      push(state, `${node.label}。看起來還能動。`, 'plain')
      break
  }
}

/**
 * 被留在深淵的人會回來。M5 會讓他們成為真正的敵人，
 * 現在先讓玩家聽見自己留下的名字。
 */
function echoOfTheLost(state: RunState, node: AbyssNode): boolean {
  const near = state.echoes.filter((e) => Math.abs(e.depth - state.depth) < 2500)
  if (near.length === 0) return false

  const [roll, s1] = nextInt(state.rngState, 1, 100)
  state.rngState = s1
  if (roll > 20) return false

  const [soul, s2] = pick(state.rngState, near)
  state.rngState = s2
  push(state, `${node.label}。有什麼東西在叫著「${soul.name}」。沒有人回答。`, 'grim')
  return true
}

function resolveEncounter(state: RunState, node: AbyssNode): void {
  if (echoOfTheLost(state, node)) return
  if (aliveMembers(state).length === 0) return

  const fighters = awakeMembers(state)
  if (fighters.length === 0) {
    push(state, `${node.label}。醒著的人一個也沒有。那東西嗅了嗅，走開了。`, 'cold')
    return
  }

  push(state, `${node.label}。`, 'cold')
  state.battle = createBattle(state.rngState, fighters, layerAt(state.depth).id)
  state.rngState = state.battle.rngState
}

// ─── 戰鬥 ────────────────────────────────────────────────────

export function battleAct(state: RunState, skillId: string, targetId: string | null): void {
  if (!state.battle || state.battle.over) return
  useSkill(state.battle, skillId, targetId, state.supplies.medicine)

  const def = skillById(skillId)
  if (def?.medicine) state.supplies.medicine = Math.max(0, state.supplies.medicine - def.medicine)

  if (state.battle.over) settleBattle(state)
}

/**
 * 讓隊伍自己把這場打完：挑傷害最高的技能，打最虛弱的敵人。
 * 給模擬與（日後的）自動戰鬥使用。
 */
export function autoResolveBattle(state: RunState): void {
  let guard = 0
  while (state.battle && !state.battle.over && guard++ < 300) {
    const actor = awaitingActor(state.battle)
    if (!actor) break

    const options = skillsOfActor(actor)

    // 有人快撐不住就先救人
    const hurt = living(state.battle, 'party')
      .filter((c) => c.hp < c.maxHp * 0.4)
      .sort((a, b) => a.hp - b.hp)[0]
    const heal = options.find((s) => s.heal && (s.medicine ?? 0) <= state.supplies.medicine)
    if (hurt && heal) {
      battleAct(state, heal.id, hurt.id)
      continue
    }

    const best = options.filter((s) => s.power).sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0]
    const foe = living(state.battle, 'enemy').sort((a, b) => a.hp - b.hp)[0]
    if (!best || !foe) {
      battleFlee(state)
      return
    }

    battleAct(state, best.id, foe.id)
  }
  if (state.battle) battleFlee(state)
}

export function battleFlee(state: RunState): void {
  if (!state.battle || state.battle.over) return
  flee(state.battle)
  settleBattle(state)
}

/** 把戰鬥的結果寫回探索層，然後把被中斷的那一步走完 */
function settleBattle(state: RunState): void {
  const battle = state.battle
  if (!battle) return

  state.rngState = battle.rngState

  for (const line of battle.log) push(state, line, 'plain')

  // 傷勢與陣亡
  for (const unit of battle.combatants) {
    if (unit.side !== 'party') continue
    const member = state.party.find((c) => c.id === unit.id)
    if (!member || member.status !== 'alive') continue
    member.hp = unit.hp
    if (member.hp <= 0) killMember(state, member)
  }

  // 放了火葬砲的人：記下回城的檢修費，撐完這一戰就昏睡過去
  for (const unit of battle.combatants) {
    const member = state.party.find((c) => c.id === unit.id)
    if (unit.side !== 'party' || member?.status !== 'alive') continue

    const spent = unit.skills
      .map(skillById)
      .filter((def): def is SkillDef => !!def?.uses && (unit.uses[def.id] ?? def.uses) < def.uses)

    for (const def of spent) {
      if (!def.repairFee) continue
      const times = (def.uses ?? 0) - (unit.uses[def.id] ?? 0)
      for (let i = 0; i < times; i++) {
        state.aftermath.push({
          kind: 'repair',
          charId: member.id,
          skillId: def.id,
          amount: def.repairFee,
        })
      }
    }

    if (KNOCKOUT.steps > 0 && spent.some((def) => def.knockout)) {
      state.sleepers[member.id] = KNOCKOUT.steps
      push(state, `${member.name}倒下去睡著了。接下來 ${KNOCKOUT.steps} 步要扶著他走。`, 'cold')
    }
  }

  // 威脅是資源，不是血量（企劃書 12-2）
  for (const effect of battle.effects) {
    if (effect.kind === 'poison') {
      const member = state.party.find((c) => c.id === effect.charId)
      if (member) member.tolerance = Math.max(0, member.tolerance - effect.amount)
    }
    if (effect.kind === 'devour') {
      const keys: SupplyKey[] = ['food', 'water', 'rope', 'medicine']
      const owned = keys.filter((k) => state.supplies[k] > 0)
      if (owned.length > 0) {
        const [k, s] = pick(state.rngState, owned)
        state.rngState = s
        state.supplies[k] -= 1
        push(state, '背包破了，掉了一些東西。', 'cold')
      }
    }
  }

  if (battle.over === 'win' && state.direction === 'down') {
    const [tpl, s] = pick(state.rngState, LOOT)
    state.rngState = s
    addItem(state, { ...tpl, kind: 'loot', identified: true })
    push(state, `從殘骸裡取得了${tpl.name}。`, 'plain')
  }

  state.battle = null
  completeStep(state)
}

// ─── 內部工具 ────────────────────────────────────────────────

function spendWater(state: RunState, amount: number): void {
  state.supplies.water = Math.max(0, state.supplies.water - amount)
}

/** 補給歸零後進入力竭：不會立刻死，但持續惡化（企劃書 8-3） */
function applyExhaustion(state: RunState): void {
  const starving = state.supplies.food <= 0
  const dehydrated = state.supplies.water <= 0
  if (!starving && !dehydrated) return

  state.exhaustion += 1
  if (state.exhaustion === 1) {
    push(state, dehydrated ? '水沒了。' : '食物沒了。', 'grim')
  }

  // 逐步惡化而非斷崖。永久性的損耗屬於 M3 的永久損傷系統
  for (const c of aliveMembers(state)) {
    damage(state, c, state.exhaustion)
  }
}

/** 遺體的重量。帶回去就等於放棄同等重量的戰利品（企劃書 11-5） */
export const CORPSE_WEIGHT = 22

function damage(state: RunState, c: Character, amount: number): void {
  c.hp = Math.max(0, c.hp - amount)
  if (c.hp !== 0 || c.status !== 'alive') return
  killMember(state, c)
}

function killMember(state: RunState, c: Character): void {
  if (c.status !== 'alive') return
  c.hp = 0
  c.status = 'dead'
  delete state.sleepers[c.id]
  // 死亡回饋刻意克制：名字安靜地變灰（企劃書 16-1）
  push(state, `${c.name}停下了。`, 'grim')

  // 遺體直接進入負重。要不要帶回去，是玩家接下來每一步都要重新回答的問題
  state.carried.push({
    id: `corpse-${c.id}`,
    name: `${c.name}的遺體`,
    weight: CORPSE_WEIGHT,
    kind: 'corpse',
    value: 0,
    identified: true,
    ownerId: c.id,
  })
}

function reapDead(state: RunState): void {
  if (aliveMembers(state).length > 0) return
  state.over = true
  state.endReason = 'wiped'
  push(state, '沒有人再站起來。深淵並不在意。', 'grim')
}

function addItem(state: RunState, item: Omit<Item, 'id'>): void {
  state.carried.push({
    ...item,
    value: Math.round(item.value * valueMultiplier(state.depth)),
    id: `i${state.nextNodeId}-${state.carried.length}`,
  })
}

/** 五層以下，筆記本上會出現不是自己寫的條目（企劃書 15-3） */
function spawnPhantom(state: RunState): void {
  const base = phantomChance(state.depth)
  if (base <= 0) return
  const chance = base + runBehaviors(state.party, state.carried).phantom

  const [r, s1] = nextInt(state.rngState, 1, 100)
  state.rngState = s1
  if (r > chance) return

  const [line, s2] = pick(state.rngState, PHANTOM_ENTRIES)
  state.rngState = s2
  push(state, line, 'grim')
}

function push(state: RunState, text: string, tone: LogTone): void {
  state.log.push({ id: state.nextLogId++, text, tone, depth: state.depth })
}
