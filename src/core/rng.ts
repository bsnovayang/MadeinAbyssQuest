/**
 * Seeded RNG（mulberry32）。
 * roguelike 必須可重現：同一個 seed 必須產生同一場探索，
 * 這同時讓 bug 可以被精確重播。
 */

export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

/** 回傳 [0,1) 亂數與新的 state，呼叫端負責保存 state */
export function nextFloat(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0
  let r = t
  r = Math.imul(r ^ (r >>> 15), r | 1)
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t]
}

/** [min, max] 含端點整數 */
export function nextInt(state: number, min: number, max: number): [number, number] {
  const [f, s] = nextFloat(state)
  return [min + Math.floor(f * (max - min + 1)), s]
}

export function pick<T>(state: number, items: readonly T[]): [T, number] {
  if (items.length === 0) throw new Error('pick from empty array')
  const [i, s] = nextInt(state, 0, items.length - 1)
  return [items[i] as T, s]
}

/** 加權挑選。weights 與 items 等長，權重須為非負數 */
export function pickWeighted<T>(
  state: number,
  items: readonly T[],
  weights: readonly number[],
): [T, number] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (items.length === 0 || total <= 0) throw new Error('pickWeighted: invalid input')
  const [f, s] = nextFloat(state)
  let roll = f * total
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i] ?? 0
    if (roll < 0) return [items[i] as T, s]
  }
  return [items[items.length - 1] as T, s]
}
