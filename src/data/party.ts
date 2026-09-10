import type { Character, Supplies } from '../core/types'

/** 角色設定詳見 角色.md */
export function startingParty(): Character[] {
  return [
    {
      id: 'riko',
      name: '莉可',
      hp: 22,
      maxHp: 22,
      tolerance: 18,
      maxTolerance: 18,
      carryCapacity: 18,
      immuneToCurse: false,
      status: 'alive',
      afflictions: [],
      bonds: {},
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
      afflictions: [],
      bonds: {},
    },
    {
      id: 'urna',
      name: '烏爾娜',
      hp: 20,
      maxHp: 20,
      tolerance: 16,
      maxTolerance: 16,
      carryCapacity: 20,
      immuneToCurse: false,
      status: 'alive',
      afflictions: [],
      bonds: {},
    },
    {
      id: 'tobi',
      name: '托比',
      hp: 16,
      maxHp: 16,
      tolerance: 12,
      maxTolerance: 12,
      carryCapacity: 14,
      immuneToCurse: false,
      status: 'alive',
      afflictions: [],
      bonds: {},
    },
  ]
}

/**
 * 起始補給刻意接近負重上限的三分之二 —— 剩下的空間就是戰利品的空間。
 * 補給給得太少，「帶多少」就不是決策而是照抄；給得太多，貪婪迴圈就消失了。
 */
export function startingSupplies(): Supplies {
  return { food: 12, water: 24, rope: 4, medicine: 3 }
}
