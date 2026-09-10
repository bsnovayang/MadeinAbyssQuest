import { distributeBurden, hasWardRelic, tierFor } from './curse'
import { layerAt, threatAt, valueMultiplier, waterCostAt } from './depth'
import { generateChoices, makeNode } from './map'
import { hashSeed, nextInt, pick } from './rng'
import { partyBehaviors } from './traits'
import type {
  AbyssNode,
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
import { RELIC_DEFS, relicById } from '../data/relics'

export interface RunOptions {
  party?: Character[]
  echoes?: LostSoul[]
  supplies?: Supplies
}

export function createRun(seed: string, options: RunOptions = {}): RunState {
  const rngState = hashSeed(seed)
  const [entrance, s1] = makeNode(rngState, 0, 0, 'rest')
  const gen = generateChoices(s1, 1, 0, 'down')

  const state: RunState = {
    seed,
    rngState: gen.rngState,
    depth: 0,
    maxDepthReached: 0,
    direction: 'down',
    party: options.party ?? startingParty(),
    echoes: options.echoes ?? [],
    supplies: { ...(options.supplies ?? startingSupplies()) },
    carried: [],
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

  push(state, '深淵之淵的入口。從這裡開始，往下都是自由的。', 'warm')
  return state
}

// ─── 衍生狀態 ────────────────────────────────────────────────

export function aliveMembers(state: RunState): Character[] {
  return state.party.filter((c) => c.status === 'alive')
}

export function hasLoss(state: RunState): boolean {
  return state.party.some((c) => c.status !== 'alive')
}

export function loadOf(state: RunState): number {
  return totalWeight(state.supplies, state.carried)
}

export function encumbranceOfRun(state: RunState): Encumbrance {
  return encumbranceOf(loadOf(state), capacityOf(state.party))
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

export function escapeRelics(state: RunState): Item[] {
  return state.carried.filter((i) => {
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
  }

  spendWater(state, waterCostAt(state.depth) + extraWaterCost(enc))

  if (state.direction === 'up') {
    state.ascentSteps += 1
    applyCurse(state)
  }

  if (!state.over) resolveNode(state, node)
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
  if (def?.kind !== 'escape') return

  state.carried.splice(idx, 1)

  if (def.id === 'immovable-wedge') {
    const alive = aliveMembers(state)
    const [i, s] = nextInt(state.rngState, 0, Math.max(0, alive.length - 1))
    state.rngState = s
    const victim = alive[i]
    if (victim) {
      victim.status = 'lost'
      push(state, `${victim.name}被留在原地。他沒有掙扎。`, 'grim')
    }
  }

  if (def.id === 'pyre-cloth') {
    const burned = state.carried.length
    state.carried = []
    push(state, `火葬布燒盡了帶著的一切。${burned} 件東西，全部沒了。`, 'grim')
  }

  if (aliveMembers(state).length === 0) {
    state.over = true
    state.endReason = 'wiped'
    state.choices = []
    return
  }

  surface(state, `${def.name}生效了。回到了地表。`)
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
  return 1 + partyBehaviors(state.party).appetite
}

export function camp(state: RunState): void {
  if (!canCamp(state)) return

  const behaviors = partyBehaviors(state.party)
  state.supplies.food = Math.max(0, state.supplies.food - campFoodCost(state))
  state.daysElapsed += 1

  for (const c of aliveMembers(state)) {
    c.hp = Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * 0.3))
    c.tolerance = Math.min(c.maxTolerance, c.tolerance + 4 + behaviors.camp)
  }

  if (state.exhaustion > 0) state.exhaustion = Math.max(0, state.exhaustion - 1)

  const lines = hasLoss(state) ? BANTER_AFTER_LOSS : BANTER
  const [line, s] = pick(state.rngState, lines)
  state.rngState = s
  push(state, line, 'warm')
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
      const bonus = partyBehaviors(state.party).forage
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
      if (partyBehaviors(state.party).ropeless) {
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
      addItem(state, {
        name: def.name,
        weight: def.weight,
        value: def.value,
        kind: 'relic',
        identified: true,
        relicId: def.id,
      })
      push(state, `${node.label}。是遺物 —— ${def.name}，${def.weight}kg。`, 'warm')
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

  const threat = threatAt(state.maxDepthReached)
  const alive = aliveMembers(state)
  if (alive.length === 0) return

  const [targetIdx, s1] = nextInt(state.rngState, 0, alive.length - 1)
  const [roll, s2] = nextInt(s1, 1, 6)
  state.rngState = s2

  const target = alive[targetIdx]
  if (!target) return

  // M1/M2 以擲骰佔位，M5 換成 ATB 戰鬥
  if (roll >= 5) {
    push(state, `${node.label}。及時避開了。`, 'plain')
    return
  }

  const dmg = Math.max(1, Math.round(threat * (roll / 4)))
  push(state, `${node.label}。${target.name}受了傷。`, 'cold')
  damage(state, target, dmg)

  if (roll <= 2 && state.direction === 'down') {
    const [tpl, s3] = pick(state.rngState, LOOT)
    state.rngState = s3
    addItem(state, { ...tpl, kind: 'loot', identified: true })
    push(state, `擊退之後，從殘骸裡取得了${tpl.name}。`, 'plain')
  }
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

  c.status = 'dead'
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

function push(state: RunState, text: string, tone: LogTone): void {
  state.log.push({ id: state.nextLogId++, text, tone, depth: state.depth })
}
