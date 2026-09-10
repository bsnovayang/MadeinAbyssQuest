/**
 * 難度曲線的觀測工具（非測試）。
 *   npx vite-node src/core/__tests__/balance.stats.ts
 */
import { formatDepth, layerAt } from '../depth'
import {
  aliveMembers,
  beginAscent,
  camp,
  canCamp,
  createRun,
  dropItem,
  dropSupply,
  encumbranceOfRun,
  moveTo,
  totalValue,
} from '../run'
import type { RunState, SupplyKey } from '../types'

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

function step(s: RunState): boolean {
  if (encumbranceOfRun(s) === 'critical') return shed(s)
  const next = s.choices[0]
  if (!next) return false
  moveTo(s, next.id)
  return true
}

/** 只會往下衝、從不紮營、從不回頭 */
function greedyRun(seed: string) {
  const s = createRun(seed)
  let guard = 0
  while (!s.over && guard++ < 500) {
    if (!step(s)) break
  }
  return { depth: s.maxDepthReached, over: s.over }
}

/** 下潛到指定深度就折返，途中會紮營 */
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

  return {
    survived: s.endReason === 'surfaced',
    home: s.party.filter((c) => c.status === 'alive').length,
    value: s.endReason === 'surfaced' ? totalValue(s) : 0,
  }
}

const N = 200

console.log('── 只往下衝、從不回頭 ──')
const greedy = Array.from({ length: N }, (_, i) => greedyRun(`g-${i}`))
const gd = greedy.map((r) => r.depth).sort((a, b) => a - b)
const at = (p: number) => gd[Math.floor(gd.length * p)] ?? 0
console.log(
  '死亡深度  p10', formatDepth(at(0.1)),
  '　p50', formatDepth(at(0.5)),
  '　p90', formatDepth(at(0.9)),
)

console.log('\n── 折返深度 vs 生還率（M2 的核心抉擇）──')
console.log('折返深度      層  生還率  平均帶回人數  平均收益   期望收益')
for (const turnAt of [800, 1600, 2800, 4500, 7500, 10000, 12500, 14000]) {
  const runs = Array.from({ length: N }, (_, i) => prudentRun(`p-${turnAt}-${i}`, turnAt))
  const survived = runs.filter((r) => r.survived)
  const rate = survived.length / runs.length
  const home = runs.reduce((a, r) => a + r.home, 0) / runs.length
  const value = survived.reduce((a, r) => a + r.value, 0) / Math.max(1, survived.length)
  console.log(
    `${formatDepth(turnAt).padStart(8)}  ${String(layerAt(turnAt).id).padStart(4)}  ` +
      `${(rate * 100).toFixed(0).padStart(5)}%  ${home.toFixed(2).padStart(12)}  ` +
      `${value.toFixed(0).padStart(8)}  ${(rate * value).toFixed(0).padStart(9)}`,
  )
}
