import type { Character, Item, Supplies } from './types'

/**
 * 補給本身也有重量 —— 這是「帶多少補給 vs 留多少空間給戰利品」
 * 這個決策成立的前提（企劃書 8-1）。
 */
export const SUPPLY_WEIGHT: Readonly<Record<keyof Supplies, number>> = {
  food: 1.5,
  water: 1.2,
  rope: 2,
  medicine: 0.4,
}

export type Encumbrance = 'normal' | 'over' | 'critical'

export function capacityOf(party: readonly Character[]): number {
  return party
    .filter((c) => c.status === 'alive')
    .reduce((sum, c) => sum + c.carryCapacity, 0)
}

export function suppliesWeight(supplies: Supplies): number {
  return (
    supplies.food * SUPPLY_WEIGHT.food +
    supplies.water * SUPPLY_WEIGHT.water +
    supplies.rope * SUPPLY_WEIGHT.rope +
    supplies.medicine * SUPPLY_WEIGHT.medicine
  )
}

export function carriedWeight(items: readonly Item[]): number {
  return items.reduce((sum, i) => sum + i.weight, 0)
}

export function totalWeight(supplies: Supplies, items: readonly Item[]): number {
  return suppliesWeight(supplies) + carriedWeight(items)
}

export function encumbranceOf(load: number, capacity: number): Encumbrance {
  if (capacity <= 0) return 'critical'
  const ratio = load / capacity
  if (ratio > 1.2) return 'critical'
  if (ratio > 1) return 'over'
  return 'normal'
}

/** 超重會加速水分消耗；嚴重超重則無法移動 */
export function extraWaterCost(enc: Encumbrance): number {
  return enc === 'normal' ? 0 : 1
}
