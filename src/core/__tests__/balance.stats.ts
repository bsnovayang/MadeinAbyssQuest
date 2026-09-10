import { formatDepth, layerAt } from '../depth'
import { createRun, descendTo, dropItem, dropSupply, encumbranceOfRun } from '../run'
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

function greedyRun(seed: string) {
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

const runs = Array.from({ length: 200 }, (_, i) => greedyRun(`seed-${i}`))
const depths = runs.map((r) => r.depth).sort((a, b) => a - b)
const at = (p: number) => depths[Math.floor(depths.length * p)] ?? 0
const layerCount = new Map<number, number>()
for (const d of depths) layerCount.set(layerAt(d).id, (layerCount.get(layerAt(d).id) ?? 0) + 1)

console.log('樣本', runs.length, '　全滅率', runs.filter((r) => r.over).length / runs.length)
console.log('步數 中位數', runs.map((r) => r.steps).sort((a, b) => a - b)[100])
console.log('深度 p10', formatDepth(at(0.1)), '　p50', formatDepth(at(0.5)), '　p90', formatDepth(at(0.9)), '　max', formatDepth(depths[depths.length - 1] ?? 0))
console.log('死亡層級分布', [...layerCount.entries()].sort((a, b) => a[0] - b[0]))
