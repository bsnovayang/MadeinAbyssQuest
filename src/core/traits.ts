import type { Character, Item } from './types'
import { relicById } from '../data/relics'

/**
 * 探索用的被動能力。
 *
 * 具名角色的「技能」與孤兒院孩子的「特質」在機制上是同一件事 ——
 * 都是掛在隊伍上的被動效果，所以共用一套定義。
 * 戰鬥用的主動技能是另一個概念，等 M5 的 ATB 才會出現。
 */
export interface TraitDef {
  id: string
  name: string
  desc: string
  /** 只有具名角色才有招牌能力，孤兒院的孩子只會拿到 common */
  signature?: boolean

  // 能力值修正
  maxHp?: number
  maxTolerance?: number
  carryCapacity?: number

  // 行為修正（整隊共享，取隊伍中的最佳值）
  /** 每步負荷減免 */
  curseResist?: number
  /** 採集點的額外產出 */
  forage?: number
  /** 紮營額外恢復的耐受度 */
  camp?: number
  /** 紮營消耗的額外食物 */
  appetite?: number
  /** 地形障礙不需要繩索 */
  ropeless?: boolean
  /** 看得出前方節點是什麼（企劃書 14 章） */
  survey?: boolean
}

export const TRAITS: readonly TraitDef[] = [
  // ── 具名角色的招牌能力 ────────────────────────────────
  {
    id: 'abyss-lore',
    name: '深淵知識',
    desc: '知道哪裡找得到東西，也知道怎麼照顧人。',
    signature: true,
    forage: 1,
    camp: 2,
  },
  {
    id: 'survey',
    name: '測繪',
    desc: '看得出前方的路通往什麼。',
    signature: true,
    survey: true,
  },
  {
    id: 'extend-arm',
    name: '伸縮臂',
    desc: '再陡的地形也不需要繩索。',
    signature: true,
    ropeless: true,
  },
  {
    id: 'curse-ward',
    name: '詛咒緩和',
    desc: '知道怎麼讓上升的痛苦輕一點。',
    signature: true,
    curseResist: 1,
  },
  {
    id: 'apprentice',
    name: '學徒',
    desc: '什麼都還不會，但學得很快。',
    signature: true,
    maxHp: -1,
  },

  // ── 孤兒院的孩子 ──────────────────────────────────────
  { id: 'sturdy', name: '好體格', desc: '背得比別人多。', carryCapacity: 4 },
  { id: 'stubborn', name: '硬骨頭', desc: '比別人撐得久。', maxTolerance: 3 },
  { id: 'cheerful', name: '樂天', desc: '再糟的情況也笑得出來。', maxTolerance: 2 },
  { id: 'sharp-eyed', name: '眼尖', desc: '總能發現別人漏掉的東西。', forage: 1 },
  { id: 'veteran', name: '老手', desc: '已經活下來過幾次了。', maxHp: 3 },
  { id: 'cook', name: '會做飯', desc: '同樣的乾糧，他弄得比較好吃。', camp: 1 },

  { id: 'afraid-dark', name: '怕黑', desc: '越深越安靜，話也越少。', maxTolerance: -3 },
  { id: 'frail', name: '體弱', desc: '從小就沒什麼力氣。', maxHp: -4 },
  { id: 'clumsy', name: '笨手笨腳', desc: '東西總是拿不穩。', carryCapacity: -4 },
  { id: 'big-eater', name: '食量大', desc: '每次紮營都吃得比別人多。', appetite: 1 },
  { id: 'distracted', name: '容易分心', desc: '找東西的時候會想別的事。', forage: -1 },
]

export const COMMON_TRAITS = TRAITS.filter((t) => !t.signature)

export function traitById(id: string): TraitDef | undefined {
  return TRAITS.find((t) => t.id === id)
}

export function traitsOf(c: Character): TraitDef[] {
  return c.traits.map(traitById).filter((t): t is TraitDef => !!t)
}

/** 整隊共享的行為修正。同一種能力只要有一個人具備就生效 */
export interface PartyBehaviors {
  curseResist: number
  forage: number
  camp: number
  appetite: number
  ropeless: boolean
  survey: boolean
  /** 遺物帶來的負重增減 */
  carry: number
  /** 深層的額外幻覺機率 */
  phantom: number
}

export function partyBehaviors(party: readonly Character[]): PartyBehaviors {
  const out: PartyBehaviors = {
    curseResist: 0,
    forage: 0,
    camp: 0,
    appetite: 0,
    ropeless: false,
    survey: false,
    carry: 0,
    phantom: 0,
  }

  for (const c of party) {
    if (c.status !== 'alive') continue
    for (const t of traitsOf(c)) {
      // 好處取最佳值，壞處會累加 —— 一隊三個食量大的孩子確實吃得比較多
      out.curseResist = Math.max(out.curseResist, t.curseResist ?? 0)
      out.forage += t.forage ?? 0
      out.camp = Math.max(out.camp, t.camp ?? 0)
      out.appetite += t.appetite ?? 0
      out.ropeless = out.ropeless || !!t.ropeless
      out.survey = out.survey || !!t.survey
    }
  }

  return out
}

/**
 * 隊伍能力 = 特質 + 帶在身上的常駐型遺物。
 *
 * 未鑑定的遺物不生效 —— 你不知道那是什麼，就只是背著一塊金屬。
 * 這也讓「鑑定」多了一個具體的理由。
 */
export function runBehaviors(
  party: readonly Character[],
  carried: readonly Item[],
): PartyBehaviors {
  const out = partyBehaviors(party)

  for (const item of carried) {
    if (item.kind !== 'relic' || !item.identified || !item.relicId) continue
    const passive = relicById(item.relicId)?.passive
    if (!passive) continue

    out.curseResist = Math.max(out.curseResist, passive.curseResist ?? 0)
    out.curseResist -= passive.curseBurden ?? 0
    out.forage += passive.forage ?? 0
    out.camp += passive.camp ?? 0
    out.appetite += passive.appetite ?? 0
    out.carry += passive.carry ?? 0
    out.phantom += passive.phantom ?? 0
    out.ropeless = out.ropeless || !!passive.ropeless
    out.survey = out.survey || !!passive.survey
  }

  out.camp = Math.max(0, out.camp)
  out.forage = Math.max(-2, out.forage)
  return out
}
