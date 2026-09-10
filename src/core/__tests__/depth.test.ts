import { describe, expect, it } from 'vitest'
import { advance, layerAt, retreat, threatAt, valueMultiplier, waterCostAt } from '../depth'

describe('depth', () => {
  it('層級邊界正確', () => {
    expect(layerAt(0).id).toBe(1)
    expect(layerAt(1349).id).toBe(1)
    expect(layerAt(1350).id).toBe(2)
    expect(layerAt(6999).id).toBe(3)
    expect(layerAt(7000).id).toBe(4)
    expect(layerAt(99999).id).toBe(7)
  })

  it('advance 一定往下', () => {
    let d = 0
    for (let i = 0; i < 100; i++) {
      const next = advance(d)
      expect(next).toBeGreaterThan(d)
      d = next
    }
  })

  it('水分消耗不隨深度改變 —— 限制深度是上升負荷的工作', () => {
    expect(waterCostAt(0)).toBe(1)
    expect(waterCostAt(2600)).toBe(1)
    expect(waterCostAt(12000)).toBe(1)
  })

  it('威脅隨層級遞增', () => {
    expect(threatAt(0)).toBeLessThan(threatAt(3000))
    expect(threatAt(3000)).toBeLessThan(threatAt(12500))
  })

  it('戰利品價值隨深度成長 —— 否則沒有人會想往下走', () => {
    expect(valueMultiplier(500)).toBeLessThan(valueMultiplier(3000))
    expect(valueMultiplier(3000)).toBeLessThan(valueMultiplier(12500))
    expect(valueMultiplier(500)).toBeGreaterThan(1)
  })

  it('歸途每層最多 3 個節點', () => {
    let d = 12900 // 五層深處
    let steps = 0
    while (d > 0 && steps < 100) {
      d = retreat(d)
      steps++
    }
    // 五層到地表共 5 層，每層至多 3 步
    expect(steps).toBeLessThanOrEqual(15)
    expect(steps).toBeGreaterThan(8)
  })
})
