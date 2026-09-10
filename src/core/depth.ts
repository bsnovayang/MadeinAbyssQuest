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

/**
 * 歸途每層最多 3 個節點 —— 路是熟的，走起來比下潛快。
 *
 * 這個常數直接決定「爬回地表要付幾次負荷」，是全遊戲最敏感的平衡旋鈕：
 * 調大會讓深層變成有去無回，調小則會讓上升負荷失去份量。
 */
export const ASCENT_NODES_PER_LAYER = 3

export function ascentStep(depth: number): number {
  const layer = layerAt(depth)
  const span = layer.to === Infinity ? layer.step * 10 : layer.to - layer.from
  return Math.max(1, Math.ceil(span / ASCENT_NODES_PER_LAYER))
}

/** 上升一個節點。跨層時直接落在上一層的頂端，不會卡在邊界 */
export function retreat(depth: number): number {
  const layer = layerAt(depth)
  const next = depth - ascentStep(depth)
  return next <= layer.from ? Math.max(0, layer.from - 1) : next
}

/**
 * 每個節點的水分消耗。
 *
 * 刻意「不」隨深度加倍：每種資源只該限制一條軸線。
 * 補給限制的是「能在深淵裡待多久」（廣度），限制「能下多深」是上升負荷的工作。
 * 兩者重疊的話，玩家會死於口渴而不是死於深淵，遊戲的主題就消失了。
 *
 * 註：企劃書 4 章「二層・補給消耗加倍」屬於上升負荷的症狀效果，不是基礎規則。
 */
export function waterCostAt(_depth: number): number {
  return 1
}

/** 遭遇的基礎威脅值，隨層級成長 */
export function threatAt(depth: number): number {
  return 3 + layerAt(depth).id * 3
}

/**
 * 戰利品價值隨深度成長。
 *
 * 沒有這條，深處的期望收益會低於淺處，理性玩家就永遠不會往下走 ——
 * 押注結構會整個垮掉（企劃書 2-1）。
 */
export function valueMultiplier(depth: number): number {
  return 1 + layerAt(depth).id * 0.7
}

export function formatDepth(depth: number): string {
  return `${Math.round(depth).toLocaleString('en-US')}m`
}
