import type { Character, Supplies } from '../core/types'

/** 角色設定詳見 角色.md */
export function startingParty(): Character[] {
  return [
    {
      id: 'riko',
      name: '莉可',
      bio: '殲滅卿萊莎的女兒。相信母親還在深淵的最深處，也相信自己有一天會走到那裡。',
      hp: 22,
      maxHp: 22,
      tolerance: 18,
      maxTolerance: 18,
      carryCapacity: 18,
      immuneToCurse: false,
      status: 'alive',
      afflictions: [],
      traits: ['abyss-lore'],
      bonds: {},
    },
    {
      id: 'reg',
      name: '雷格',
      bio: '在二層被撿到的機械人偶。不記得自己是誰，也不記得自己為什麼在那裡。',
      hp: 30,
      maxHp: 30,
      tolerance: 10,
      maxTolerance: 10,
      carryCapacity: 34,
      immuneToCurse: true,
      status: 'alive',
      afflictions: [],
      traits: ['extend-arm'],
      bonds: {},
    },
    {
      id: 'urna',
      name: '烏爾娜',
      bio: '測繪士。畫的地圖比店裡賣的還準，但她從來不說自己是怎麼學會的。',
      hp: 20,
      maxHp: 20,
      tolerance: 16,
      maxTolerance: 16,
      carryCapacity: 20,
      immuneToCurse: false,
      status: 'alive',
      afflictions: [],
      traits: ['survey'],
      bonds: {},
    },
    {
      id: 'tobi',
      name: '托比',
      bio: '最年輕的紅笛。什麼都還不會，但每次回來都比上次強一點。',
      hp: 16,
      maxHp: 16,
      tolerance: 12,
      maxTolerance: 12,
      carryCapacity: 14,
      immuneToCurse: false,
      status: 'alive',
      afflictions: [],
      traits: ['apprentice'],
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
