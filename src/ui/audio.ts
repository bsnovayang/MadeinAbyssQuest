import { MusicDirector } from '../audio/director'
import { SfxBank, type SfxName } from '../audio/sfx'
import type { TrackId } from '../audio/tracks'

/**
 * 遊戲與聲音之間的轉接（企劃書 15-5b、16-8）。
 *
 * 音樂與音效是兩個開關，預設都打開。
 * 瀏覽器要使用者互動過一次才允許播放，所以第一次點畫面（任何地方）時才建立音訊、下載音色。
 *
 * 兩個設定記在這台裝置的瀏覽器裡；玩家關掉過就保持關閉。
 * 靜音期間照樣記住場景與暖度，打開的瞬間直接接上目前的局勢。
 */

const PREFS_KEY = 'abyss-audio'
const DEFAULT_VOLUME = 0.7

interface Prefs {
  music: boolean
  sfx: boolean
  musicVolume: number
  sfxVolume: number
}

const clamp01 = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>
      return {
        music: saved.music !== false,
        sfx: saved.sfx !== false,
        musicVolume: clamp01(saved.musicVolume, DEFAULT_VOLUME),
        sfxVolume: clamp01(saved.sfxVolume, DEFAULT_VOLUME),
      }
    }
  } catch {
    /* 私密模式或封鎖儲存空間時，用預設值 */
  }
  return { music: true, sfx: true, musicVolume: DEFAULT_VOLUME, sfxVolume: DEFAULT_VOLUME }
}

function savePrefs(): void {
  try {
    const prefs: Prefs = { music: !musicMuted, sfx: !sfxMuted, musicVolume, sfxVolume }
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* 記不住也沒關係 */
  }
}

const prefs = loadPrefs()
let musicMuted = !prefs.music
let sfxMuted = !prefs.sfx
let musicVolume = prefs.musicVolume
let sfxVolume = prefs.sfxVolume

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
    if (!bank) {
      bank = new SfxBank(ctx)
      bank.setVolume(sfxVolume)
    }
    if (!musicMuted && !director) {
      director = new MusicDirector(ctx)
      director.setLevel(musicVolume)
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

/** 0～1 */
export function setMusicVolume(level: number): void {
  musicVolume = clamp01(level, musicVolume)
  savePrefs()
  director?.setLevel(musicVolume)
}

/** 0～1 */
export function setSfxVolume(level: number): void {
  sfxVolume = clamp01(level, sfxVolume)
  savePrefs()
  bank?.setVolume(sfxVolume)
}

export function getMusicVolume(): number {
  return musicVolume
}

export function getSfxVolume(): number {
  return sfxVolume
}

export function isMusicMuted(): boolean {
  return musicMuted
}

export function isSfxMuted(): boolean {
  return sfxMuted
}
