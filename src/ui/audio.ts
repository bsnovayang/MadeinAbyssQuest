/**
 * 以 WebAudio 合成的暖色和弦襯底，不需要任何音檔。
 *
 * 一名隊員 = 一個聲部。有人不在了，那個聲部就永遠消失
 * —— 重大事件用「少了什麼」來表達（企劃書 16-2）。
 */

const CHORD = [130.81, 196.0, 261.63, 329.63] // C3 G3 C4 E4

interface Voice {
  osc: OscillatorNode
  gain: GainNode
  silenced: boolean
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let filter: BiquadFilterNode | null = null
let voices: Voice[] = []
let muted = false

function now(): number {
  return ctx?.currentTime ?? 0
}

/** 必須由使用者手勢觸發，否則瀏覽器不允許播放 */
export function ensureAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume()
    return
  }

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return

  ctx = new Ctor()
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.07

  filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  filter.Q.value = 0.6

  filter.connect(master)
  master.connect(ctx.destination)

  voices = CHORD.map((freq, i) => {
    const osc = ctx!.createOscillator()
    osc.type = i === 0 ? 'sine' : 'triangle'
    osc.frequency.value = freq

    const gain = ctx!.createGain()
    gain.gain.value = 0
    osc.connect(gain)
    gain.connect(filter!)
    osc.start()

    // 緩慢淡入，避免像是「遊戲開始了」的提示音
    gain.gain.linearRampToValueAtTime(0.25, ctx!.currentTime + 3)
    return { osc, gain, silenced: false }
  })
}

/**
 * 依隊員存活狀態更新聲部。
 * 一旦某個聲部被靜音，本場探索都不會再回來。
 */
export function setVoices(alive: readonly boolean[]): void {
  if (!ctx) return
  alive.forEach((isAlive, i) => {
    const v = voices[i]
    if (!v || v.silenced) return
    if (!isAlive) {
      v.silenced = true
      v.gain.gain.cancelScheduledValues(now())
      v.gain.gain.setValueAtTime(v.gain.gain.value, now())
      v.gain.gain.linearRampToValueAtTime(0, now() + 2.5)
    }
  })
}

/** 0 = 冷、緊繃；1 = 溫暖、開闊 */
export function setWarmth(level: number): void {
  if (!filter || !ctx) return
  const clamped = Math.max(0, Math.min(1, level))
  filter.frequency.cancelScheduledValues(now())
  filter.frequency.linearRampToValueAtTime(320 + clamped * 1900, now() + 1.6)
}

/** 紮營：讓和弦短暫漲起來 */
export function swell(): void {
  if (!master || !ctx || muted) return
  const g = master.gain
  g.cancelScheduledValues(now())
  g.setValueAtTime(g.value, now())
  g.linearRampToValueAtTime(0.14, now() + 1.2)
  g.linearRampToValueAtTime(0.07, now() + 5)
}

/** 負荷發作與死亡的表現是「靜止」，不是衝擊（企劃書 16-3） */
export function hush(ms: number): void {
  if (!master || !ctx || muted) return
  const g = master.gain
  const t = now()
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  g.linearRampToValueAtTime(0, t + 0.12)
  g.setValueAtTime(0, t + ms / 1000)
  g.linearRampToValueAtTime(0.07, t + ms / 1000 + 1.5)
}

export function resetAudio(): void {
  if (!ctx) return
  for (const v of voices) {
    v.silenced = false
    v.gain.gain.cancelScheduledValues(now())
    v.gain.gain.linearRampToValueAtTime(0.25, now() + 1.5)
  }
  setWarmth(0.5)
}

export function toggleMute(): boolean {
  muted = !muted
  if (master && ctx) {
    master.gain.cancelScheduledValues(now())
    master.gain.linearRampToValueAtTime(muted ? 0 : 0.07, now() + 0.3)
  }
  return muted
}

export function isMuted(): boolean {
  return muted
}
