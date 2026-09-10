import { layerAt } from './depth'
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
  const bearers = bearersOf(state)
  const out: Record<string, number> = {}
  if (bearers.length === 0) return out

  // 籠子是唯一的授權來源：一旦它被丟掉或燒毀，轉嫁立刻失效
  const target =
    state.burden.mode === 'ward' && hasWardRelic(state)
      ? bearers.find((c) => c.id === state.burden.targetId)
      : undefined

  if (target) {
    out[target.id] = tier.cost * bearers.length
    for (const c of bearers) {
      if (c.id !== target.id) out[c.id] = 0
    }
    return out
  }

  for (const c of bearers) out[c.id] = tier.cost
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

export function hasWardRelic(state: RunState): boolean {
  return state.carried.some((i) => i.relicId === 'ward-basket')
}
