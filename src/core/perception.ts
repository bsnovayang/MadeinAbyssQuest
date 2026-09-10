import { layerAt } from './depth'
import { hashSeed } from './rng'

/**
 * 感知的可靠度（企劃書 16-5）。
 *
 * 深層的恐怖不是「敵人變強了」，而是「你的感知壞掉了」。
 * 真實狀態永遠是正確的 —— 說謊的只有顯示。
 */
export function reliabilityAt(depth: number): number {
  const layer = layerAt(depth).id
  if (layer <= 3) return 1
  return Math.max(0, 1 - (layer - 3) * 0.3)
}

/** 筆記本的劣化階段，直接對應 CSS class（企劃書 15-3） */
export function decayStage(depth: number): number {
  return Math.min(6, Math.max(0, layerAt(depth).id))
}

/**
 * 讓一個數字變得不可信，但保持穩定 ——
 * 同樣的輸入永遠得到同樣的謊，不會每次重繪都在跳。
 */
export function distort(value: number, reliability: number, salt: string): number {
  if (reliability >= 1 || value <= 0) return value

  const spread = Math.ceil(value * (1 - reliability) * 0.45)
  if (spread <= 0) return value

  const offset = (hashSeed(salt) % (spread * 2 + 1)) - spread
  return Math.max(0, value + offset)
}

/**
 * 五層以下，筆記本上會出現不是自己寫的條目。
 * 這些是純粹的顯示，不影響任何狀態。
 */
export const PHANTOM_ENTRIES: readonly string[] = [
  '（這一頁有一行字，筆跡不是莉可的。看不懂寫了什麼。）',
  '（有人在邊緣畫了一個記號。沒有人記得畫過。）',
  '（前面幾行被劃掉了。劃掉的力道很重。）',
  '（這裡記著一個名字。隊伍裡沒有這個人。）',
  '（同一句話重複了四次。字越寫越小。）',
  '（頁角有一個潮濕的指印。不是任何人的尺寸。）',
]

/** 這一步會不會冒出幻覺條目 */
export function phantomChance(depth: number): number {
  const layer = layerAt(depth).id
  if (layer < 5) return 0
  return layer === 5 ? 12 : 22
}
