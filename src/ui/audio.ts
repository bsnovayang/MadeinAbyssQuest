import { MusicDirector } from '../audio/director'
import { SfxBank, type SfxName } from '../audio/sfx'
import type { TrackId } from '../audio/tracks'

/**
 * 遊戲與聲音之間的轉接（企劃書 15-5b、16-8）。
 *
 * 音樂與音效是兩個開關：
 * - 音樂預設關閉，玩家自己按開。第一次打開時才下載音色
 * - 音效預設打開。又短又輕、不需要下載，沒有它手感會差很多
 *
 * 兩個設定記在這台裝置的瀏覽器裡。靜音期間照樣記住場景與暖度，打開的瞬間直接接上目前的局勢。
 */

const PREFS_KEY = 'abyss-audio'

function loadPrefs(): { music: boolean; sfx: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { music?: unknown; sfx?: unknown }
      return { music: saved.music === true, sfx: saved.sfx !== false }
    }
  } catch {
    /* 私密模式或封鎖儲存空間時，用預設值 */
  }
  return { music: false, sfx: true }
}

function savePrefs(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ music: !musicMuted, sfx: !sfxMuted }))
  } catch {
    /* 記不住也沒關係 */
  }
}

const prefs = loadPrefs()
let musicMuted = !prefs.music
let sfxMuted = !prefs.sfx

let ctx: AudioContext | null = null
let director: MusicDirector | null = null
let bank: SfxBank | null = null
let scene: TrackId = 'town'
let warmth = 1

/** 聲音出任何問題都不該影響遊戲，之後所有呼叫都會安靜地跳過 */
let broken = false

/** 必須由使用者手勢觸發，否則瀏覽器不允許播放 */
export function ensureAudio(): void {
  if (broken || (musicMuted && sfxMuted)) return
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
    }
    bank ??= new SfxBank(ctx)
    if (!musicMuted && !director) {
      director = new MusicDirector(ctx)
      director.setWarmth(warmth)
      director.setScene(scene)
    }
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    broken = true
    ctx = null
    director = null
    bank = null
  }
}

/** 音樂與音效都關掉時，暫停整個 AudioContext，不在背景白白排程 */
function suspendIfSilent(): void {
  if (!(musicMuted && sfxMuted)) return
  setTimeout(() => {
    if (musicMuted && sfxMuted) void ctx?.suspend()
  }, 400)
}

export function setScene(next: TrackId): void {
  scene = next
  if (!musicMuted) director?.setScene(next)
}

/** 0 = 悶、冷；1 = 溫暖、開闊 */
export function setWarmth(level: number): void {
  warmth = level
  if (!musicMuted) director?.setWarmth(level)
}

/** 紮營：聲音短暫漲起來 */
export function swell(): void {
  if (!musicMuted) director?.swell()
}

/** 負荷發作與死亡的表現是「靜止」，不是衝擊（企劃書 16-3） */
export function hush(ms: number): void {
  if (!musicMuted) director?.hush(ms)
}

export function playSfx(name: SfxName, strength?: number): void {
  if (sfxMuted || broken) return
  ensureAudio()
  bank?.play(name, strength)
}

export function toggleMusic(): boolean {
  musicMuted = !musicMuted
  savePrefs()
  if (musicMuted) {
    director?.setMuted(true)
    suspendIfSilent()
  } else {
    ensureAudio()
    director?.setMuted(false)
    director?.setWarmth(warmth)
    director?.setScene(scene)
  }
  return musicMuted
}

export function toggleSfx(): boolean {
  sfxMuted = !sfxMuted
  savePrefs()
  if (sfxMuted) suspendIfSilent()
  else ensureAudio()
  return sfxMuted
}

export function isMusicMuted(): boolean {
  return musicMuted
}

export function isSfxMuted(): boolean {
  return sfxMuted
}
