export interface RelicDef {
  id: string
  name: string
  weight: number
  value: number
  kind: 'escape' | 'passive'
  /** 未鑑定時看得到的樣子。認得出來是玩家自己的本事 */
  appearance: string
  effect: string
  /** 代價必須是敘事性的，不能只是數值（企劃書 2-2） */
  cost: string
}

export const RELIC_DEFS: readonly RelicDef[] = [
  {
    id: 'immovable-wedge',
    name: '不動之楔',
    weight: 6,
    value: 900,
    kind: 'escape',
    appearance: '鏽色的楔子',
    effect: '全隊立即返回地表',
    cost: '隨機一名隊友被留在原地',
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
  },
  {
    id: 'ward-basket',
    name: '避咒之籠',
    weight: 5,
    value: 1200,
    kind: 'passive',
    appearance: '鳥籠狀的東西',
    effect: '可指定一名隊友承受全部負荷，其餘人完全免疫',
    cost: '可以重複使用',
  },
]

export function relicById(id: string): RelicDef | undefined {
  return RELIC_DEFS.find((r) => r.id === id)
}
