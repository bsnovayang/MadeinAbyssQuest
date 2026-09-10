import { describe, expect, it } from 'vitest'
import {
  aliveMembers,
  autoResolveBattle,
  beginAscent,
  camp,
  canCamp,
  createRun,
  dropItem,
  dropSupply,
  encumbranceOfRun,
  moveTo,
} from '../run'
import type { RunState, SupplyKey } from '../types'

/** 超重時先丟戰利品，沒得丟就丟補給 —— 玩家永遠有辦法脫離動彈不得 */
function shed(s: RunState): boolean {
  const heaviest = [...s.carried].sort((a, b) => b.weight - a.weight)[0]
  if (heaviest) {
    dropItem(s, heaviest.id)
    return true
  }
  for (const key of ['rope', 'food', 'water', 'medicine'] as SupplyKey[]) {
    if (s.supplies[key] > 0) {
      dropSupply(s, key)
      return true
    }
  }
  return false
}

function step(s: RunState): boolean {
  if (encumbranceOfRun(s) === 'critical') return shed(s)
  const next = s.choices[0]
  if (!next) return false
  moveTo(s, next.id)
  autoResolveBattle(s)
  return true
}

/** 下潛到指定深度就折返，途中會視情況紮營 */
function prudentRun(seed: string, turnAt: number) {
  const s = createRun(seed)
  let guard = 0

  while (!s.over && s.depth < turnAt && guard++ < 300) {
    if (canCamp(s) && aliveMembers(s).some((c) => c.hp < c.maxHp * 0.6)) {
      camp(s)
      continue
    }
    if (!step(s)) break
  }

  if (!s.over) beginAscent(s)

  while (!s.over && guard++ < 500) {
    if (canCamp(s) && aliveMembers(s).some((c) => c.tolerance <= 2)) {
      camp(s)
      continue
    }
    if (!step(s)) break
  }

  return { survived: s.endReason === 'surfaced', home: aliveMembers(s).length }
}

function survivalAt(turnAt: number, n = 60): { rate: number; home: number } {
  const runs = Array.from({ length: n }, (_, i) => prudentRun(`b-${turnAt}-${i}`, turnAt))
  return {
    rate: runs.filter((r) => r.survived).length / runs.length,
    home: runs.reduce((a, r) => a + r.home, 0) / runs.length,
  }
}

/**
 * 這些數字守護的是遊戲的核心張力，不是實作細節。
 * 任何一條失守，「要不要再下一層」就不再是個問題。
 */
describe('balance：折返深度 vs 生還率', () => {
  it('前兩層可以安心來回', () => {
    expect(survivalAt(1600).rate).toBeGreaterThan(0.9)
  })

  it('第三層仍然可控', () => {
    expect(survivalAt(4500).rate).toBeGreaterThan(0.7)
  })

  it('第四層是真正的賭注 —— 既不是穩贏也不是必死', () => {
    const { rate } = survivalAt(9000)
    expect(rate).toBeGreaterThan(0.15)
    expect(rate).toBeLessThan(0.85)
  })

  it('第六層幾乎回不來', () => {
    expect(survivalAt(14000).rate).toBeLessThan(0.05)
  })

  it('越深，就算活著回來也帶不回那麼多人', () => {
    expect(survivalAt(9000).home).toBeLessThan(survivalAt(2800).home)
  })

})
