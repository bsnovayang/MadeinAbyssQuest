import { describe, expect, it } from 'vitest'
import { advance, layerAt, threatAt, waterCostAt } from '../depth'

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

  it('三層以下水分消耗加倍', () => {
    expect(waterCostAt(0)).toBe(1)
    expect(waterCostAt(2599)).toBe(1)
    expect(waterCostAt(2600)).toBe(2)
    expect(waterCostAt(12000)).toBe(2)
  })

  it('威脅隨層級遞增', () => {
    expect(threatAt(0)).toBeLessThan(threatAt(3000))
    expect(threatAt(3000)).toBeLessThan(threatAt(12500))
  })
})
