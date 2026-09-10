export interface RankDef {
  id: string
  name: string
  /** 晉升所需的已完成委託數 */
  quests: number
  /** 晉升所需的最深抵達深度 */
  depth: number
  /** 名冊人數上限 */
  rosterCap: number
  /** 可以接到的委託等級 */
  questTier: number
  desc: string
}

/**
 * 笛階級（見 角色.md）。
 *
 * 階級不限制你能下潛多深 —— 往下走永遠是自由的。
 * 它限制的是**接得到什麼委託**，而委託才是往深處走的理由。
 */
export const RANKS: readonly RankDef[] = [
  {
    id: 'red',
    name: '紅笛',
    quests: 0,
    depth: 0,
    rosterCap: 6,
    questTier: 1,
    desc: '見習探窟家。組合只敢把最淺的差事交給你。',
  },
  {
    id: 'blue',
    name: '蒼笛',
    quests: 3,
    depth: 2600,
    rosterCap: 8,
    questTier: 2,
    desc: '一人前。可以獨自帶隊，也開始有人記得你的名字。',
  },
  {
    id: 'moon',
    name: '月笛',
    quests: 8,
    depth: 7000,
    rosterCap: 10,
    questTier: 3,
    desc: '能在大斷層以下作業的少數人。',
  },
  {
    id: 'black',
    name: '黑笛',
    quests: 16,
    depth: 12000,
    rosterCap: 12,
    questTier: 4,
    desc: '離白笛只差一步。而那一步的代價，沒有人願意先說。',
  },
  {
    id: 'white',
    name: '白笛',
    quests: 28,
    depth: 13000,
    rosterCap: 16,
    questTier: 5,
    desc: '無制限。以摯愛之人的生命鑄成。',
  },
]

export function rankAt(index: number): RankDef {
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, index))] as RankDef
}
