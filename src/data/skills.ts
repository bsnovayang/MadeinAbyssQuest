export type SkillTarget = 'enemy' | 'ally' | 'self' | 'allEnemies' | 'allAllies'

export interface SkillDef {
  id: string
  name: string
  desc: string
  target: SkillTarget
  /** 傷害倍率 */
  power?: number
  /** 治療量（相對於施術者的力量） */
  heal?: number
  /** 把目標的下次行動往後推。正數 = 延後，負數 = 提前 */
  delay?: number
  /** 施展後把自己往後推，用於代價極高的招式 */
  recoil?: number
  /** 消耗的藥品 */
  medicine?: number
  /** 每場戰鬥可用次數。未指定 = 無限 */
  uses?: number
}

/**
 * 主動技能。
 *
 * 時間軸讓「推遲／提前行動」成為一整類技能（企劃書 12-1）——
 * 牽制不造成多少傷害，但打斷蓄力比多打幾十點有用得多。
 */
export const SKILLS: readonly SkillDef[] = [
  {
    id: 'strike',
    name: '揮擊',
    desc: '最普通的一擊。',
    target: 'enemy',
    power: 1,
  },
  {
    id: 'harry',
    name: '牽制',
    desc: '傷害不高，但能把對方的下次行動往後推。',
    target: 'enemy',
    power: 0.4,
    delay: 55,
  },
  {
    id: 'reach',
    name: '伸縮臂',
    desc: '從遠處抓住目標。出手極快，打完立刻能再動。',
    target: 'enemy',
    power: 1.1,
    recoil: -35,
  },
  {
    id: 'incinerate',
    name: '火葬砲',
    desc: '燒盡眼前的一切。之後雷格會有很長一段時間動不了。',
    target: 'allEnemies',
    power: 3.4,
    recoil: 260,
    uses: 1,
  },
  {
    id: 'lecture',
    name: '深淵講義',
    desc: '說出對方的來歷與弱點。全隊的下一次行動都會提前。',
    target: 'allAllies',
    delay: -45,
  },
  {
    id: 'firstaid',
    name: '急救',
    desc: '止血、包紮、讓他繼續走下去。',
    target: 'ally',
    heal: 2.2,
    medicine: 1,
  },
  {
    id: 'survey-shot',
    name: '測距射擊',
    desc: '看準了才開槍。穩定而準確。',
    target: 'enemy',
    power: 1.3,
  },
  {
    id: 'brace',
    name: '穩住陣腳',
    desc: '喊住所有人。全隊行動提前，自己則慢下來。',
    target: 'allAllies',
    delay: -30,
    recoil: 40,
  },
]

export function skillById(id: string): SkillDef | undefined {
  return SKILLS.find((s) => s.id === id)
}

/** 具名角色的招牌主動技能。孤兒院的孩子只有揮擊與牽制 */
export const SIGNATURE_SKILLS: Readonly<Record<string, string[]>> = {
  // 莉可的強項是照顧人與情報，不是傷害（見 角色.md）
  riko: ['strike', 'lecture', 'firstaid'],
  reg: ['strike', 'reach', 'incinerate'],
  urna: ['strike', 'survey-shot', 'harry'],
  tobi: ['strike', 'brace'],
}

export const DEFAULT_SKILLS: readonly string[] = ['strike', 'harry']
