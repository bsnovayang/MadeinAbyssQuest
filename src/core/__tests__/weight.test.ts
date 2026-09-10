import { describe, expect, it } from 'vitest'
import { capacityOf, encumbranceOf, suppliesWeight, totalWeight } from '../weight'
import type { Character, Item } from '../types'

const member = (id: string, cap: number, status: Character['status'] = 'alive'): Character => ({
  id,
  name: id,
  bio: '',
  hp: 10,
  maxHp: 10,
  tolerance: 5,
  maxTolerance: 5,
  carryCapacity: cap,
  immuneToCurse: false,
  status,
  afflictions: [],
  traits: [],
  bonds: {},
})

describe('weight', () => {
  it('死亡的隊員不再提供負重容量', () => {
    const party = [member('a', 20), member('b', 20, 'dead')]
    expect(capacityOf(party)).toBe(20)
  })

  it('補給本身有重量', () => {
    expect(suppliesWeight({ food: 2, water: 2, rope: 0, medicine: 0 })).toBeCloseTo(5.4)
  })

  it('總重包含補給與戰利品', () => {
    const items: Item[] = [
      { id: 'x', name: 'x', weight: 4, kind: 'loot', value: 1, identified: true },
    ]
    const w = totalWeight({ food: 0, water: 0, rope: 1, medicine: 0 }, items)
    expect(w).toBeCloseTo(6)
  })

  it('負重狀態分級', () => {
    expect(encumbranceOf(50, 100)).toBe('normal')
    expect(encumbranceOf(110, 100)).toBe('over')
    expect(encumbranceOf(130, 100)).toBe('critical')
  })

  it('沒有活人時視為無法移動', () => {
    expect(encumbranceOf(0, 0)).toBe('critical')
  })
})
