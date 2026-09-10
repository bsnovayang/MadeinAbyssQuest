import { describe, expect, it } from 'vitest'
import { layerAt } from '../depth'
import { createRun, descendTo, dropItem, dropSupply, encumbranceOfRun } from '../run'
import type { RunState, SupplyKey } from '../types'

/** 超重時先丟戰利品，沒得丟就丟補給 —— 玩家永遠有辦法脫離動彈不得 */
function shed(s: RunState): boolean {
  const heaviest = [...s.carried].sort((a, b) => b.weight - a.weight)[0]
  if (heaviest) {
    dropItem(s, heaviest.id)
    return true
  }
  const order: SupplyKey[] = ['rope', 'food', 'water', 'medicine']
  for (const key of order) {
    if (s.supplies[key] > 0) {
      dropSupply(s, key)
      return true
    }
  }
  return false
}

/** 只會往下衝、超重才減重、從不紮營的玩家 —— 難度的上限參照點 */
function greedyRun(seed: string): { depth: number; steps: number; over: boolean } {
  const s = createRun(seed)
  let steps = 0
  while (!s.over && s.choices[0] && steps < 500) {
    if (encumbranceOfRun(s) === 'critical') {
      if (!shed(s)) break
      continue
    }
    descendTo(s, s.choices[0].id)
    steps++
  }
  return { depth: s.maxDepthReached, steps, over: s.over }
}

describe('balance', () => {
  it('魯莽的玩家會死，而且死在合理的深度', () => {
    const results = Array.from({ length: 60 }, (_, i) => greedyRun(`seed-${i}`))
    const depths = results.map((r) => r.depth).sort((a, b) => a - b)
    const median = depths[Math.floor(depths.length / 2)]!
    const deepest = depths[depths.length - 1]!

    // 一路硬衝不該能走到三層以下 —— 否則補給壓力形同虛設
    expect(layerAt(median).id).toBeLessThanOrEqual(3)
    expect(layerAt(deepest).id).toBeLessThanOrEqual(4)

    // 但也不該在一開始就死光，否則玩家沒有做決策的空間
    expect(results.every((r) => r.steps >= 5)).toBe(true)
  })

  it('沒有任何一場會卡在動彈不得的狀態', () => {
    const results = Array.from({ length: 60 }, (_, i) => greedyRun(`stuck-${i}`))
    expect(results.every((r) => r.over)).toBe(true)
  })
})
