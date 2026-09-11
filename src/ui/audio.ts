import { MusicDirector } from '../audio/director'
import type { TrackId } from '../audio/tracks'

/**
 * 遊戲與配樂之間的轉接（企劃書 15-5b）。
 *
 * 預設靜音，玩家自己按開。第一次打開時才建立 AudioContext、下載音色。
 * 靜音期間照樣記住場景與暖度，打開的瞬間直接接上目前的局勢。
 */

let muted = true
let ctx: AudioContext | null = null
let director: MusicDirector | null = null
let scene: TrackId = 'town'
let warmth = 1

/** 音效出任何問題都不該影響遊戲，之後所有呼叫都會安靜地跳過 */
let broken = false

/** 必須由使用者手勢觸發，否則瀏覽器不允許播放 */
export function ensureAudio(): void {
  if (broken || muted) return
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) {
        broken = true
        return
      }
      ctx = new Ctor()
      director = new MusicDirector(ctx)
      director.setWarmth(warmth)
      director.setScene(scene)
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    broken = true
    ctx = null
    director = null
  }
}

export function setScene(next: TrackId): void {
  scene = next
  if (!muted) director?.setScene(next)
}

/** 0 = 悶、冷；1 = 溫暖、開闊 */
export function setWarmth(level: number): void {
  warmth = level
  if (!muted) director?.setWarmth(level)
}

/** 紮營：聲音短暫漲起來 */
export function swell(): void {
  if (!muted) director?.swell()
}

/** 負荷發作與死亡的表現是「靜止」，不是衝擊（企劃書 16-3） */
export function hush(ms: number): void {
  if (!muted) director?.hush(ms)
}

export function toggleMute(): boolean {
  muted = !muted
  if (muted) {
    director?.setMuted(true)
  } else {
    ensureAudio()
    director?.setMuted(false)
    director?.setWarmth(warmth)
    director?.setScene(scene)
  }
  return muted
}

export function isMuted(): boolean {
  return muted
}
