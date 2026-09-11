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
  /** 用過的人在戰鬥結束後昏睡，要扶著走（見 KNOCKOUT） */
  knockout?: boolean
  /** 每用一次，回奧斯城要付的檢修費 */
  repairFee?: number
}

/**
 * 放完火葬砲的雷格會昏睡（企劃書 12-1c）。
 *
 * 睡著的人不參戰，還要有人扶著走。代價刻意壓在「戰力」而不是「負重」上 ——
 * 深層的負重本來就很緊，模擬顯示任何稍重的負重代價都會讓隊伍連鎖丟東西，
 * 打贏了還是得回去（見 core/__tests__/knockout.stats.ts）。
 */
export const KNOCKOUT = {
  /** 要扶著走幾步才會醒。紮營可以提早叫醒 */
  steps: 3,
  /** 扶著他走增加的負重 */
  bodyWeight: 6,
}

/**
 * 火葬砲每發的檢修費，回奧斯城結算時扣。
 *
 * 固定金額而不是按收益比例：淺層收益低，放了不划算，玩家會想忍住；
 * 深層收益高，救命時才放得下手。昏睡管的是這一趟裡的取捨，檢修費管的是整趟收益。
 * 模擬顯示 150～400 都能讓淺層不再無腦放，且深層「開場放」仍是最好的打法。
 */
const INCINERATE_REPAIR_FEE = 200

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
    desc: `燒盡眼前的一切。雷格會昏睡過去：這一戰動不了，打完要扶著他走 ${KNOCKOUT.steps} 步（負重 +${KNOCKOUT.bodyWeight}kg，紮營可以叫醒）。回奧斯城要付檢修費 ${INCINERATE_REPAIR_FEE}。`,
    target: 'allEnemies',
    power: 3.4,
    recoil: 260,
    uses: 1,
    knockout: true,
    repairFee: INCINERATE_REPAIR_FEE,
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
