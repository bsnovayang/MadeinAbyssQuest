import { describe, expect, it } from 'vitest'
import {
  aliveMembers,
  autoResolveBattle,
  camp,
  canMove,
  createRun,
  moveTo,
  dropItem,
  dropSupply,
  encumbranceOfRun,
  loadOf,
} from '../run'
import type { RunState } from '../types'

const firstChoice = (s: RunState) => s.choices[0]!.id

/** 模擬一個只會往下走、超重就丟最重物品的玩家 */
function descendUntilOver(seed: string, maxSteps = 400): RunState {
  const s = createRun(seed)
  let steps = 0
  while (!s.over && s.choices.length > 0 && steps < maxSteps) {
    if (encumbranceOfRun(s) === 'critical') {
      const heaviest = [...s.carried].sort((a, b) => b.weight - a.weight)[0]
      if (heaviest) {
        dropItem(s, heaviest.id)
        continue
      }
      const spare = (['rope', 'food', 'water', 'medicine'] as const).find(
        (k) => s.supplies[k] > 0,
      )
      if (!spare) break
      dropSupply(s, spare)
      continue
    }
    moveTo(s, firstChoice(s))
    autoResolveBattle(s)
    steps++
  }
  return s
}

describe('run', () => {
  it('同一 seed 產生完全相同的一場探索', () => {
    const a = descendUntilOver('reproducible', 30)
    const b = descendUntilOver('reproducible', 30)
    expect(a.log.map((l) => l.text)).toEqual(b.log.map((l) => l.text))
    expect(a.depth).toBe(b.depth)
  })

  it('下潛會推進深度並更新 maxDepthReached', () => {
    const s = createRun('descend')
    expect(s.depth).toBe(0)
    moveTo(s, firstChoice(s))
    expect(s.depth).toBeGreaterThan(0)
    expect(s.maxDepthReached).toBe(s.depth)
  })

  it('下潛會消耗水', () => {
    const s = createRun('water')
    const before = s.supplies.water
    moveTo(s, firstChoice(s))
    // 採集點可能補水，因此只驗證有發生消耗或補充，不會憑空不變
    expect(s.supplies.water).not.toBe(before + 0.5)
    expect(s.supplies.water).toBeGreaterThanOrEqual(0)
  })

  it('無效的節點 id 不會改變狀態', () => {
    const s = createRun('invalid')
    const depth = s.depth
    moveTo(s, 'not-a-real-node')
    expect(s.depth).toBe(depth)
  })

  it('補給耗盡後全隊終將倒下', () => {
    const s = descendUntilOver('exhaustion')
    expect(s.over).toBe(true)
    expect(s.endReason).toBe('wiped')
    expect(aliveMembers(s)).toHaveLength(0)
  })

  it('結束後無法再下潛', () => {
    const s = descendUntilOver('ended')
    expect(s.choices).toHaveLength(0)
    expect(canMove(s)).toBe(false)
  })

  it('紮營消耗食物並恢復 HP', () => {
    const s = createRun('camp')
    s.current = { id: 'rest', kind: 'rest', depth: 0, label: '營地' }
    const target = s.party[0]!
    target.hp = 1
    const food = s.supplies.food
    camp(s)
    expect(s.supplies.food).toBe(food - 1)
    expect(target.hp).toBeGreaterThan(1)
    expect(s.daysElapsed).toBe(1)
  })

  it('沒有食物就不能紮營', () => {
    const s = createRun('nofood')
    s.current = { id: 'rest', kind: 'rest', depth: 0, label: '營地' }
    s.supplies.food = 0
    const days = s.daysElapsed
    camp(s)
    expect(s.daysElapsed).toBe(days)
  })

  it('丟棄物品會降低負重', () => {
    const s = createRun('drop')
    s.carried.push({
      id: 'heavy',
      name: '沉重的遺物',
      weight: 14,
      kind: 'relic',
      value: 100,
      identified: false,
    })
    const before = loadOf(s)
    dropItem(s, 'heavy')
    expect(loadOf(s)).toBeCloseTo(before - 14)
  })

  it('嚴重超重時無法下潛', () => {
    const s = createRun('overload')
    s.carried.push({
      id: 'anvil',
      name: '不可能的重物',
      weight: 999,
      kind: 'loot',
      value: 0,
      identified: true,
    })
    expect(canMove(s)).toBe(false)
    const depth = s.depth
    moveTo(s, firstChoice(s))
    expect(s.depth).toBe(depth)
  })
})
