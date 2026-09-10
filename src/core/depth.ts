export interface Layer {
  id: number
  name: string
  from: number
  to: number
  /** 每個節點推進的深度（公尺） */
  step: number
}

/** 深度數值待與原作核對（見 角色.md 待辦） */
export const LAYERS: readonly Layer[] = [
  { id: 1, name: '深淵之淵', from: 0, to: 1350, step: 170 },
  { id: 2, name: '誘惑之森', from: 1350, to: 2600, step: 160 },
  { id: 3, name: '大斷層', from: 2600, to: 7000, step: 440 },
  { id: 4, name: '巨人之杯', from: 7000, to: 12000, step: 500 },
  { id: 5, name: '屍骸之海', from: 12000, to: 13000, step: 170 },
  { id: 6, name: '歸返禁地', from: 13000, to: 15500, step: 310 },
  { id: 7, name: '奈落之底', from: 15500, to: Infinity, step: 500 },
]

export function layerAt(depth: number): Layer {
  for (const layer of LAYERS) {
    if (depth < layer.to) return layer
  }
  return LAYERS[LAYERS.length - 1] as Layer
}

export function advance(depth: number): number {
  return depth + layerAt(depth).step
}

/** 三層以下水分消耗加倍（企劃書 8-2） */
export function waterCostAt(depth: number): number {
  return layerAt(depth).id >= 3 ? 2 : 1
}

/** 遭遇的基礎威脅值，隨層級成長 */
export function threatAt(depth: number): number {
  return 3 + layerAt(depth).id * 3
}

export function formatDepth(depth: number): string {
  return `${Math.round(depth).toLocaleString('en-US')}m`
}
