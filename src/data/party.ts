import type { Character, Supplies } from '../core/types'

/** 角色設定詳見 角色.md */
export function startingParty(): Character[] {
  return [
    {
      id: 'riko',
      name: '莉可',
      hp: 22,
      maxHp: 22,
      tolerance: 10,
      maxTolerance: 10,
      carryCapacity: 18,
      immuneToCurse: false,
      status: 'alive',
    },
    {
      id: 'reg',
      name: '雷格',
      hp: 30,
      maxHp: 30,
      tolerance: 10,
      maxTolerance: 10,
      carryCapacity: 34,
      immuneToCurse: true,
      status: 'alive',
    },
    {
      id: 'urna',
      name: '烏爾娜',
      hp: 20,
      maxHp: 20,
      tolerance: 8,
      maxTolerance: 8,
      carryCapacity: 20,
      immuneToCurse: false,
      status: 'alive',
    },
    {
      id: 'tobi',
      name: '托比',
      hp: 16,
      maxHp: 16,
      tolerance: 6,
      maxTolerance: 6,
      carryCapacity: 14,
      immuneToCurse: false,
      status: 'alive',
    },
  ]
}

export function startingSupplies(): Supplies {
  return { food: 8, water: 10, rope: 3, medicine: 2 }
}
