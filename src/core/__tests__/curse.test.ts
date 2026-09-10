import { describe, expect, it } from 'vitest'
import { bearersOf, distributeBurden, forecast, tierFor } from '../curse'
import { createRun } from '../run'
import type { RunState } from '../types'

function atDepth(seed: string, maxDepth: number): RunState {
  const s = createRun(seed)
  s.maxDepthReached = maxDepth
  s.depth = maxDepth
  s.direction = 'up'
  return s
}

describe('curse', () => {
  it('負荷逐層結算：代價取決於正在穿越的那一層', () => {
    const deep = atDepth('deep', 12500)
    expect(tierFor(deep.depth).layer).toBe(5)
    expect(distributeBurden(deep)['riko']).toBe(tierFor(12500).cost)

    // 爬回一層之後，每一步就便宜了 —— 痛苦是前重後輕的
    const shallow = atDepth('shallow', 12500)
    shallow.depth = 500
    expect(distributeBurden(shallow)['riko']).toBe(tierFor(500).cost)
    expect(distributeBurden(shallow)['riko']!).toBeLessThan(distributeBurden(deep)['riko']!)
  })

  it('雷格不承受負荷', () => {
    const s = atDepth('reg', 8000)
    expect(bearersOf(s).some((c) => c.id === 'reg')).toBe(false)
    expect(distributeBurden(s)['reg']).toBeUndefined()
  })

  it('預設由所有非免疫成員平均承受', () => {
    const s = atDepth('spread', 3000)
    const share = distributeBurden(s)
    const cost = tierFor(3000).cost
    expect(share['riko']).toBe(cost)
    expect(share['urna']).toBe(cost)
    expect(share['tobi']).toBe(cost)
  })

  it('沒有避咒之籠就無法指定承受者', () => {
    const s = atDepth('noward', 3000)
    s.burden = { mode: 'ward', targetId: 'tobi' }
    const share = distributeBurden(s)
    // 沒有籠子，退回平均分攤
    expect(share['riko']).toBeGreaterThan(0)
  })

  it('避咒之籠讓一人扛下全部，其餘人歸零', () => {
    const s = atDepth('ward', 3000)
    s.carried.push({
      id: 'w',
      name: '避咒之籠',
      weight: 5,
      kind: 'relic',
      value: 0,
      identified: true,
      relicId: 'ward-basket',
    })
    s.burden = { mode: 'ward', targetId: 'tobi' }
    const share = distributeBurden(s)
    const bearers = bearersOf(s).length
    expect(share['tobi']).toBe(tierFor(3000).cost * bearers)
    expect(share['riko']).toBe(0)
    expect(share['urna']).toBe(0)
  })

  it('預兆算得出還能撐幾個節點', () => {
    const s = atDepth('forecast', 3000)
    const tobi = s.party.find((c) => c.id === 'tobi')!
    tobi.tolerance = 2
    const fc = forecast(s)
    expect(fc['tobi']).toBe(1) // cost 2、耐受度 2 → 下一步就撐不住
    expect(fc['reg']).toBe(Infinity)
  })
})
