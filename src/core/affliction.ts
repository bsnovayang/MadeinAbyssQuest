import { traitsOf } from './traits'
import type { Character } from './types'

export interface AfflictionDef {
  id: string
  name: string
  desc: string
  maxHp?: number
  maxTolerance?: number
  carryCapacity?: number
  /** 戰鬥中出手落空的機率，0～1 */
  miss?: number
  /** 治療費用。0 = 永遠不可逆（企劃書 11-6） */
  cureCost: number
}

/**
 * 永久損傷跨場次保留，讓老隊員逐漸殘破 ——
 * 這正是原作中探窟家的下場（見 角色.md 的「戈爾德」）。
 */
export const AFFLICTIONS: readonly AfflictionDef[] = [
  {
    id: 'tremor',
    name: '顫抖',
    desc: '手不再穩了。背得動的東西變少。',
    carryCapacity: -4,
    cureCost: 400,
  },
  {
    id: 'bleeding',
    name: '慢性出血',
    desc: '傷口不再完全癒合。',
    maxHp: -4,
    cureCost: 700,
  },
  {
    id: 'deaf',
    name: '失聰',
    desc: '聽不見隊友的呼喚了。',
    maxTolerance: -2,
    cureCost: 1200,
  },
  {
    // 不是單純的數字變差，而是真的「看不見」：揹不動太多、出手會落空。
    // 沒治好也還能上場，只是不可靠 —— 失明的隊員不該變成只能丟掉的消耗品
    id: 'blind',
    name: '失明',
    desc: '再也看不見了。揹不動太多，戰鬥中出手有四分之一會落空。',
    carryCapacity: -3,
    miss: 0.25,
    cureCost: 0,
  },
  {
    id: 'nightmare',
    name: '惡夢',
    desc: '閉上眼睛就會回到那裡。',
    maxTolerance: -3,
    cureCost: 900,
  },
  {
    id: 'grief',
    name: '失去',
    desc: '有個人沒有回來。',
    maxTolerance: -2,
    cureCost: 0,
  },
]

/** 上升負荷造成的損傷。層級越深，抽到的越嚴重 */
export const CURSE_AFFLICTIONS: readonly string[][] = [
  [],
  ['tremor'],
  ['tremor', 'bleeding'],
  ['bleeding', 'deaf', 'nightmare'],
  ['deaf', 'nightmare', 'blind'],
  ['blind', 'nightmare'],
  ['blind'],
]

export function afflictionById(id: string): AfflictionDef | undefined {
  return AFFLICTIONS.find((a) => a.id === id)
}

export interface EffectiveStats {
  maxHp: number
  maxTolerance: number
  carryCapacity: number
}

/**
 * 把特質與永久損傷換算成實際能力值。
 * 基礎值本身永遠不變，因此治療只要移除項目即可。
 */
export function effectiveStats(c: Character): EffectiveStats {
  const stats: EffectiveStats = {
    maxHp: c.maxHp,
    maxTolerance: c.maxTolerance,
    carryCapacity: c.carryCapacity,
  }

  const mods = [
    ...traitsOf(c),
    ...c.afflictions.map(afflictionById).filter((d): d is AfflictionDef => !!d),
  ]

  for (const def of mods) {
    stats.maxHp += def.maxHp ?? 0
    stats.maxTolerance += def.maxTolerance ?? 0
    stats.carryCapacity += def.carryCapacity ?? 0
  }

  return {
    maxHp: Math.max(4, stats.maxHp),
    maxTolerance: Math.max(2, stats.maxTolerance),
    carryCapacity: Math.max(4, stats.carryCapacity),
  }
}

/** 戰鬥中出手落空的機率。多種損傷疊加，但最多六成 —— 總要打得中一點 */
export function missChance(c: Character): number {
  const total = c.afflictions
    .map(afflictionById)
    .reduce((sum, def) => sum + (def?.miss ?? 0), 0)
  return Math.min(0.6, total)
}

export function describeAfflictions(c: Character): string[] {
  const counts = new Map<string, number>()
  for (const id of c.afflictions) counts.set(id, (counts.get(id) ?? 0) + 1)

  return [...counts.entries()].map(([id, n]) => {
    const def = afflictionById(id)
    const name = def?.name ?? id
    return n > 1 ? `${name}×${n}` : name
  })
}
