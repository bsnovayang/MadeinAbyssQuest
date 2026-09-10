/** 敵人造成的額外效果。威脅是資源，不是血量（企劃書 12-2） */
export type EnemyEffect = 'poison' | 'devour' | 'mimic'

export interface EnemyDef {
  id: string
  name: string
  /** 出現的層級範圍 */
  layers: [number, number]
  hp: number
  speed: number
  power: number
  /** 蓄力一次再打出的重擊倍率。0 = 不蓄力 */
  windup: number
  effect?: EnemyEffect
  desc: string
}

/**
 * 生物名稱與所屬層級待與原作核對（見 角色.md 待辦）。
 */
export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'benikuchinawa',
    name: '緋朱之裂顎',
    layers: [1, 2],
    hp: 26,
    speed: 8,
    power: 6,
    windup: 0,
    desc: '巨大的蛇。動作不快，但咬下去就不鬆口。',
  },
  {
    id: 'tamaugachi',
    name: '多瑪烏加奇',
    layers: [2, 3],
    hp: 18,
    speed: 13,
    power: 4,
    windup: 0,
    effect: 'poison',
    desc: '劇毒。被螫到的人，回程會格外難熬。',
  },
  {
    id: 'orb-turret',
    name: '歐爾多砲台',
    layers: [3, 4],
    hp: 34,
    speed: 7,
    power: 7,
    windup: 2.6,
    desc: '固定在崖壁上的東西。它會先安靜下來，然後才開火。',
  },
  {
    id: 'corpse-weeper',
    name: '屍蠟哭鴉',
    layers: [4, 5],
    hp: 30,
    speed: 12,
    power: 8,
    windup: 0,
    effect: 'mimic',
    desc: '它用隊友的聲音叫你的名字。',
  },
  {
    id: 'ryusazai',
    name: '龍蜥',
    layers: [4, 5],
    hp: 44,
    speed: 15,
    power: 9,
    windup: 0,
    effect: 'devour',
    desc: '什麼都吃。包括你背上的東西。',
  },
  {
    id: 'abyss-shade',
    name: '深淵之影',
    layers: [5, 7],
    hp: 62,
    speed: 14,
    power: 13,
    windup: 3.2,
    effect: 'poison',
    desc: '看不清楚形狀。看得清楚的人都沒有回來。',
  },
]

export function enemiesForLayer(layer: number): EnemyDef[] {
  const pool = ENEMIES.filter((e) => layer >= e.layers[0] && layer <= e.layers[1])
  return pool.length > 0 ? pool : [ENEMIES[0] as EnemyDef]
}

export function enemyById(id: string): EnemyDef | undefined {
  return ENEMIES.find((e) => e.id === id)
}
