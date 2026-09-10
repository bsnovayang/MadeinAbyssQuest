import { layerAt, threatAt, waterCostAt } from './depth'
import { generateChoices, makeNode } from './map'
import { hashSeed, nextInt, pick } from './rng'
import type { AbyssNode, Character, Item, LogTone, RunState, SupplyKey } from './types'
import {
  capacityOf,
  encumbranceOf,
  extraWaterCost,
  totalWeight,
  type Encumbrance,
} from './weight'
import { LOOT, RELICS } from '../data/loot'
import { startingParty, startingSupplies } from '../data/party'

export function createRun(seed: string): RunState {
  const rngState = hashSeed(seed)
  const [entrance, s1] = makeNode(rngState, 0, 0, 'rest')
  const gen = generateChoices(s1, 1, 0)

  const state: RunState = {
    seed,
    rngState: gen.rngState,
    depth: 0,
    maxDepthReached: 0,
    direction: 'down',
    party: startingParty(),
    supplies: startingSupplies(),
    carried: [],
    exhaustion: 0,
    daysElapsed: 0,
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

export function loadOf(state: RunState): number {
  return totalWeight(state.supplies, state.carried)
}

export function encumbranceOfRun(state: RunState): Encumbrance {
  return encumbranceOf(loadOf(state), capacityOf(state.party))
}

export function canDescend(state: RunState): boolean {
  return !state.over && encumbranceOfRun(state) !== 'critical'
}

export function canCamp(state: RunState): boolean {
  return !state.over && state.current.kind === 'rest' && state.supplies.food >= 1
}

// ─── 動作 ────────────────────────────────────────────────────

export function descendTo(state: RunState, nodeId: string): void {
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
  resolveNode(state, node)
  applyExhaustion(state)
  reapDead(state)

  if (!state.over) {
    const gen = generateChoices(state.rngState, state.nextNodeId, state.depth)
    state.rngState = gen.rngState
    state.nextNodeId = gen.nextNodeId
    state.choices = gen.choices
  } else {
    state.choices = []
  }
}

export function camp(state: RunState): void {
  if (!canCamp(state)) return

  state.supplies.food -= 1
  state.daysElapsed += 1

  for (const c of aliveMembers(state)) {
    c.hp = Math.min(c.maxHp, c.hp + Math.ceil(c.maxHp * 0.3))
    c.tolerance = Math.min(c.maxTolerance, c.tolerance + 2)
  }

  if (state.exhaustion > 0) state.exhaustion = Math.max(0, state.exhaustion - 1)
  push(state, '生了火。有人說了個無聊的笑話，大家都笑了。', 'warm')
}

export function dropItem(state: RunState, itemId: string): void {
  const idx = state.carried.findIndex((i) => i.id === itemId)
  const item = state.carried[idx]
  if (!item) return
  state.carried.splice(idx, 1)
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
      const [gainFood, s1] = nextInt(state.rngState, 0, 2)
      const [gainWater, s2] = nextInt(s1, 1, 3)
      state.rngState = s2
      state.supplies.food += gainFood
      state.supplies.water += gainWater
      push(state, `${node.label}。補充了食物 ${gainFood}、水 ${gainWater}。`, 'warm')
      break
    }

    case 'rest':
      push(state, `${node.label}。可以在這裡紮營。`, 'warm')
      break

    case 'obstacle':
      if (state.supplies.rope > 0) {
        state.supplies.rope -= 1
        push(state, `${node.label}。架設繩索通過了。`, 'plain')
      } else {
        push(state, `${node.label}。沒有繩索，只能徒手攀爬。`, 'cold')
        for (const c of aliveMembers(state)) {
          damage(state, c, 3)
        }
      }
      break

    case 'encounter':
      resolveEncounter(state, node)
      break

    case 'relic': {
      const [tpl, s1] = pick(state.rngState, RELICS)
      state.rngState = s1
      addItem(state, tpl.name, tpl.weight, tpl.value, 'relic', false)
      push(state, `${node.label}。是遺物 —— ${tpl.name}，${tpl.weight}kg。`, 'warm')
      break
    }

    case 'anchor':
      push(state, `${node.label}。可以從這裡上升一層。（M2 實作）`, 'plain')
      break
  }
}

function resolveEncounter(state: RunState, node: AbyssNode): void {
  const threat = threatAt(state.depth)
  const alive = aliveMembers(state)
  if (alive.length === 0) return

  const [targetIdx, s1] = nextInt(state.rngState, 0, alive.length - 1)
  const [roll, s2] = nextInt(s1, 1, 6)
  state.rngState = s2

  const target = alive[targetIdx]
  if (!target) return

  // M1 以擲骰佔位，M5 換成 ATB 戰鬥
  if (roll >= 5) {
    push(state, `${node.label}。及時避開了。`, 'plain')
    return
  }

  const dmg = Math.max(1, Math.round(threat * (roll / 4)))
  push(state, `${node.label}。${target.name}受了傷。`, 'cold')
  damage(state, target, dmg)

  if (roll <= 2) {
    const [tpl, s3] = pick(state.rngState, LOOT)
    state.rngState = s3
    addItem(state, tpl.name, tpl.weight, tpl.value, 'loot', true)
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

  for (const c of aliveMembers(state)) {
    c.maxHp = Math.max(1, c.maxHp - 1)
    damage(state, c, state.exhaustion)
  }
}

function damage(state: RunState, c: Character, amount: number): void {
  c.hp = Math.max(0, c.hp - amount)
  if (c.hp === 0 && c.status === 'alive') {
    c.status = 'dead'
    // 死亡回饋刻意克制：名字安靜地變灰（企劃書 16-1）
    push(state, `${c.name}停下了。`, 'grim')
  }
}

function reapDead(state: RunState): void {
  if (aliveMembers(state).length > 0) return
  state.over = true
  state.endReason = 'wiped'
  push(state, '沒有人再站起來。深淵並不在意。', 'grim')
}

function addItem(
  state: RunState,
  name: string,
  weight: number,
  value: number,
  kind: Item['kind'],
  identified: boolean,
): void {
  state.carried.push({
    id: `i${state.carried.length}-${Math.round(state.depth)}`,
    name,
    weight,
    value,
    kind,
    identified,
  })
}

function push(state: RunState, text: string, tone: LogTone): void {
  state.log.push({ id: state.nextLogId++, text, tone, depth: state.depth })
}
