export interface BaseDef {
  /** 所在層 */
  layer: number
  /** 下潛起點的深度 */
  depth: number
  name: string
  desc: string
}

/**
 * 前線基地（企劃書 6-4）。
 *
 * 監視基地與伊多方特是原作既有的設定，其餘為本作補足。
 * 基地是休息站，不是出口 —— 變現、治療、招募永遠只在奧斯城。
 */
export const BASES: readonly BaseDef[] = [
  {
    layer: 2,
    depth: 1350,
    name: '監視基地',
    desc: '不動卿奧森的地盤。她沒有說歡迎，但也沒有把你趕走。',
  },
  {
    layer: 3,
    depth: 2600,
    name: '大斷層中繼點',
    desc: '嵌在崖壁上的幾個鐵籠。風大得聽不見彼此說話。',
  },
  {
    layer: 4,
    depth: 7000,
    name: '巨人之杯營地',
    desc: '前人留下的帳篷還在，裡面的東西也還在。',
  },
  {
    layer: 5,
    depth: 12000,
    name: '前線基地 伊多方特',
    desc: '黎明卿的設施。這裡的燈永遠亮著，沒有人知道為什麼。',
  },
  {
    layer: 6,
    depth: 13000,
    name: '成之末端之村',
    desc: '它們不叫你探窟家，也不叫你人類。',
  },
]

export function baseAtLayer(layer: number): BaseDef | undefined {
  return BASES.find((b) => b.layer === layer)
}

/**
 * 使用前線基地的維護費。
 * 基地省的是時間，不是代價 —— 省下的路途要用錢換。
 */
export function baseFee(depth: number): number {
  return Math.round(depth * 0.35)
}
