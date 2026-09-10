/**
 * 代價必須符合至少一項（企劃書 10-2）：
 * 拿走一個有名字的人、拿走這趟的全部成果、留下不可逆的東西、改變外面的世界。
 */
export type RelicCost =
  | { kind: 'loseMember'; pick: 'random' | 'weakest' }
  | { kind: 'burn'; what: 'loot' | 'relics' | 'all' }
  | { kind: 'funds'; ratio: number }
  | { kind: 'days'; amount: number }
  | { kind: 'afflict'; who: 'random' | 'all' }
  | { kind: 'questsFail' }
  | { kind: 'none' }

/** 常駐型遺物掛在隊伍上的效果。好處與壞處寫在同一個地方 */
export interface RelicPassive {
  /** 負重上限增減 */
  carry?: number
  /** 每步負荷減免 */
  curseResist?: number
  /** 每步額外負荷 */
  curseBurden?: number
  forage?: number
  camp?: number
  appetite?: number
  ropeless?: boolean
  survey?: boolean
  /** 深層額外的幻覺 */
  phantom?: number
}

export interface RelicDef {
  id: string
  name: string
  weight: number
  value: number
  kind: 'escape' | 'passive'
  /** 未鑑定時看得到的樣子。認得出來是玩家自己的本事 */
  appearance: string
  effect: string
  cost: string
  escapeCost?: RelicCost
  passive?: RelicPassive
}

export const RELIC_DEFS: readonly RelicDef[] = [
  // ── 脫離型：用一次，換一條回家的路 ──────────────────────
  {
    id: 'immovable-wedge',
    name: '不動之楔',
    weight: 6,
    value: 900,
    kind: 'escape',
    appearance: '鏽色的楔子',
    effect: '全隊立即返回地表',
    cost: '隨機一名隊友被留在原地',
    escapeCost: { kind: 'loseMember', pick: 'random' },
  },
  {
    id: 'pyre-cloth',
    name: '火葬布',
    weight: 3,
    value: 600,
    kind: 'escape',
    appearance: '摺起來的布',
    effect: '立即返回地表，完全無視上升負荷',
    cost: '燒毀帶著的所有戰利品',
    escapeCost: { kind: 'burn', what: 'loot' },
  },
  {
    id: 'retrograde-meteor',
    name: '逆行流星',
    weight: 4,
    value: 1100,
    kind: 'escape',
    appearance: '溫熱的石核',
    effect: '瞬間上升，全員返回地表',
    cost: '最撐不住的那個人扛下全部，留下永久損傷',
    escapeCost: { kind: 'afflict', who: 'random' },
  },
  {
    id: 'thousand-wedge',
    name: '千人楔',
    weight: 9,
    value: 1500,
    kind: 'escape',
    appearance: '一束細長的釘',
    effect: '全員必定存活地返回地表',
    cost: '這一趟帶著的東西全部消失，戰利品與遺物都是',
    escapeCost: { kind: 'burn', what: 'all' },
  },
  {
    id: 'primal-seal',
    name: '原初印章',
    weight: 7,
    value: 2400,
    kind: 'escape',
    appearance: '沒有刻痕的圓章',
    effect: '完美返回，不留任何痕跡',
    cost: '外界流逝十年。委託、市場、名冊全部改變',
    escapeCost: { kind: 'days', amount: 3650 },
  },
  {
    id: 'debt-bell',
    name: '負債之鈴',
    weight: 2,
    value: 700,
    kind: 'escape',
    appearance: '不會響的鈴',
    effect: '有人會來把你們接走',
    cost: '欠下的人情用錢還。資金歸零',
    escapeCost: { kind: 'funds', ratio: 1 },
  },
  {
    id: 'inverted-sun',
    name: '逆吊之陽',
    weight: 8,
    value: 1800,
    kind: 'escape',
    appearance: '朝下發亮的球',
    effect: '重力反轉，全隊被推回地表',
    cost: '每一個人都留下永久損傷',
    escapeCost: { kind: 'afflict', who: 'all' },
  },
  {
    id: 'hollow-whistle',
    name: '仿製的白笛',
    weight: 1,
    value: 1300,
    kind: 'escape',
    appearance: '骨色的笛子',
    effect: '吹響它，深淵讓你通過',
    cost: '帶著的遺物全部碎裂',
    escapeCost: { kind: 'burn', what: 'relics' },
  },
  {
    id: 'stillbox',
    name: '靜止之匣',
    weight: 5,
    value: 1000,
    kind: 'escape',
    appearance: '關不緊的匣子',
    effect: '時間停住，你們走了出來',
    cost: '這一趟承接的委託全部交不了差',
    escapeCost: { kind: 'questsFail' },
  },
  {
    id: 'weakest-link',
    name: '選別之秤',
    weight: 4,
    value: 1400,
    kind: 'escape',
    appearance: '一副小秤',
    effect: '秤會決定誰該回去。其餘人立即返回地表',
    cost: '最虛弱的那個人被留下',
    escapeCost: { kind: 'loseMember', pick: 'weakest' },
  },

  // ── 常駐型：帶著它走，好處與壞處一起帶 ──────────────────
  {
    id: 'ward-basket',
    name: '避咒之籠',
    weight: 5,
    value: 1200,
    kind: 'passive',
    appearance: '鳥籠狀的東西',
    effect: '可指定一名隊友承受全部負荷，其餘人完全免疫',
    cost: '可以重複使用',
    passive: {},
  },
  {
    id: 'star-compass',
    name: '星之羅盤',
    weight: 3,
    value: 1600,
    kind: 'passive',
    appearance: '會轉的圓盤',
    effect: '看得出前方的節點是什麼',
    cost: '很重，而且指針的聲音讓人睡不好（紮營效果變差）',
    passive: { survey: true, camp: -2 },
  },
  {
    id: 'bubble-cage',
    name: '氣泡籠',
    weight: 11,
    value: 900,
    kind: 'passive',
    appearance: '半透明的薄膜',
    effect: '地形障礙不再需要繩索',
    cost: '極重',
    passive: { ropeless: true },
  },
  {
    id: 'whisper-ear',
    name: '囁之耳',
    weight: 2,
    value: 1100,
    kind: 'passive',
    appearance: '一片乾掉的耳廓',
    effect: '聽得出前方有什麼',
    cost: '深層它會開始對你說謊',
    passive: { survey: true, phantom: 8 },
  },
  {
    id: 'thousand-hands',
    name: '千手',
    weight: 6,
    value: 1300,
    kind: 'passive',
    appearance: '成束的細管',
    effect: '全隊負重上限大幅提升',
    cost: '背著它的人睡不安穩，每一步的負荷更重',
    passive: { carry: 14, curseBurden: 1 },
  },
  {
    id: 'quiet-bell',
    name: '靜謐之鐘',
    weight: 4,
    value: 1700,
    kind: 'passive',
    appearance: '悶聲的鐘',
    effect: '上升時每一步的負荷都輕一點',
    cost: '它蓋住了周圍的聲音，比較難找到東西',
    passive: { curseResist: 1, forage: -1 },
  },
  {
    id: 'ember-vessel',
    name: '火葉之器',
    weight: 3,
    value: 800,
    kind: 'passive',
    appearance: '有餘溫的小罐',
    effect: '紮營時恢復得更多',
    cost: '它要吃東西。每次紮營多消耗一份食物',
    passive: { camp: 3, appetite: 1 },
  },
  {
    id: 'empty-flask',
    name: '空之瓶',
    weight: 2,
    value: 600,
    kind: 'passive',
    appearance: '裝不滿的瓶',
    effect: '採集時總能多拿一些',
    cost: '它會把背包裡的空間吃掉',
    passive: { forage: 2, carry: -8 },
  },
  {
    id: 'memory-shard',
    name: '記憶的碎片',
    weight: 1,
    value: 2000,
    kind: 'passive',
    appearance: '會反光的薄片',
    effect: '看得出前方是什麼，也比較容易找到東西',
    cost: '深處的幻覺會變得非常頻繁',
    passive: { survey: true, forage: 1, phantom: 20 },
  },
  {
    id: 'iron-yoke',
    name: '鐵軛',
    weight: 9,
    value: 700,
    kind: 'passive',
    appearance: '彎折的鐵條',
    effect: '扛得更多，也比較不容易累',
    cost: '穿戴它的人得一直低著頭走路（採集與紮營都變差）',
    passive: { carry: 10, curseResist: 1, forage: -1, camp: -2 },
  },
]

export function relicById(id: string): RelicDef | undefined {
  return RELIC_DEFS.find((r) => r.id === id)
}

export const ESCAPE_RELICS = RELIC_DEFS.filter((r) => r.kind === 'escape')
export const PASSIVE_RELICS = RELIC_DEFS.filter((r) => r.kind === 'passive')
