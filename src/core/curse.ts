import { layerAt } from './depth'
import { runBehaviors } from './traits'
import type { Character, RunState } from './types'

export interface CurseTier {
  layer: number
  /** 每個上升節點、每名承受者失去的耐受度 */
  cost: number
  name: string
}

/** 症狀對照見 企劃書 4 章 */
export const CURSE_TIERS: readonly CurseTier[] = [
  { layer: 1, cost: 1, name: '輕微暈眩' },
  { layer: 2, cost: 1, name: '噁心與頭痛' },
  { layer: 3, cost: 2, name: '三半規管失調' },
  { layer: 4, cost: 3, name: '全身激痛' },
  { layer: 5, cost: 5, name: '感覺喪失' },
  { layer: 6, cost: 8, name: '人性喪失' },
  { layer: 7, cost: 12, name: '確定的死亡' },
]

/**
 * 負荷逐層結算：代價取決於「正在穿越的這一層」。
 *
 * 不需要用 maxDepthReached 防規避 —— 深度只有在 direction==='up' 時才會減少，
 * 玩家無法在不付錢的情況下先爬上來。從最深處回到地表，必定得穿越中間每一層，
 * 因此深層的總帳單自然更重，而且痛苦是前重後輕的（跟原作一樣）。
 */
export function tierFor(depth: number): CurseTier {
  const id = layerAt(depth).id
  return CURSE_TIERS.find((t) => t.layer === id) ?? (CURSE_TIERS[0] as CurseTier)
}

export function bearersOf(state: RunState): Character[] {
  return state.party.filter((c) => c.status === 'alive' && !c.immuneToCurse)
}

/**
 * 依承受方式分配本次負荷，回傳每人各承受多少。
 *
 * 預設所有人平均承受；只有持有「避咒之籠」才能指定一人扛下全部
 * —— 這正是波多爾多對孩子做的事（企劃書 5-2）。
 */
export function distributeBurden(state: RunState): Record<string, number> {
  const tier = tierFor(state.depth)
  // 娜娜奇這類角色能讓每一步都輕一點，但永遠不會歸零
  const relief = runBehaviors(state.party, state.carried).curseResist
  const cost = Math.max(1, tier.cost - relief)
  const bearers = bearersOf(state)
  const out: Record<string, number> = {}
  if (bearers.length === 0) return out

  // 籠子是唯一的授權來源：一旦它被丟掉或燒毀，轉嫁立刻失效
  const target =
    state.burden.mode === 'ward' && hasWardRelic(state)
      ? bearers.find((c) => c.id === state.burden.targetId)
      : undefined

  if (target) {
    out[target.id] = cost * bearers.length
    for (const c of bearers) {
      if (c.id !== target.id) out[c.id] = 0
    }
    return out
  }

  for (const c of bearers) out[c.id] = cost
  return out
}

/**
 * 預兆：每名隊員還能撐過幾個上升節點（企劃書 7-2）。
 * 玩家必須提前數步就看見誰會死，否則那不是抉擇，只是通知。
 */
export function forecast(state: RunState): Record<string, number> {
  const share = distributeBurden(state)
  const out: Record<string, number> = {}
  for (const c of state.party) {
    if (c.status !== 'alive') continue
    const per = share[c.id] ?? 0
    out[c.id] = per <= 0 ? Infinity : Math.ceil(c.tolerance / per)
  }
  return out
}

/** 撤離時一名隊員接下來會怎樣 */
export interface Outlook {
  /** 每步失去的耐受度。0 = 不承受負荷（機械之軀，或負荷被別人扛走） */
  perStep: number
  /** 還能走幾步耐受度才歸零。已經歸零為 0 */
  toZero: number
  /** 第幾步會倒下。撐得住就是 Infinity */
  down: number
  /** 耐受歸零之後，每步失去的 HP */
  hpPerStep: number
}

/** 模擬到這麼多步還沒倒下，就當作撐得住 */
const OUTLOOK_HORIZON = 60

/**
 * 預兆的完整版：不只看耐受度什麼時候歸零，也看歸零之後什麼時候倒下。
 *
 * 耐受度歸零不等於死亡 —— 之後每一步改扣 HP（見 run.ts 的 applyCurse）。
 * 只看歸零的話，已經歸零的人會一直顯示「撐不住」，玩家會在不必要的時候犧牲隊友或用掉遺物。
 * 以目前這一層的負荷估算；越往上負荷只會越輕，所以這是偏保守的預估。
 */
export function outlook(state: RunState): Record<string, Outlook> {
  const share = distributeBurden(state)
  const out: Record<string, Outlook> = {}

  for (const c of state.party) {
    if (c.status !== 'alive') continue
    const per = share[c.id] ?? 0
    if (per <= 0) {
      out[c.id] = { perStep: 0, toZero: Infinity, down: Infinity, hpPerStep: 0 }
      continue
    }

    // 和 applyCurse 一樣的算法，一步一步走
    let tolerance = c.tolerance
    let hp = c.hp
    let down = Infinity
    for (let step = 1; step <= OUTLOOK_HORIZON; step++) {
      const before = tolerance
      tolerance = Math.max(0, tolerance - per)
      const overflow = per - before
      if (overflow > 0) hp -= overflow * 2
      if (hp <= 0) {
        down = step
        break
      }
    }

    out[c.id] = {
      perStep: per,
      toZero: Math.ceil(c.tolerance / per),
      down,
      hpPerStep: per * 2,
    }
  }
  return out
}

/** 未鑑定的籠子不生效 —— 你不知道那是什麼，就只是背著一個籠子 */
export function hasWardRelic(state: RunState): boolean {
  return state.carried.some((i) => i.relicId === 'ward-basket' && i.identified)
}
