/**
 * 材質音效（企劃書 16-1、16-8）。
 *
 * 紙張翻動、鉛筆摩擦、皮革與金屬扣、硬幣 —— 不使用電子音。
 * 全部用濾波過的雜訊與短促的音高即時合成，不需要任何音檔，也不增加下載量。
 * 每次播放都帶一點隨機變化，同一個聲音聽起來才不會像機器。
 */

export type SfxName =
  /** 翻頁：往前走一步、換分頁 */
  | 'page'
  /** 鉛筆一筆：受傷、改寫數字 */
  | 'pencil'
  /** 一筆劃掉：擊倒敵人 */
  | 'strike'
  /** 寫字：鑑定 */
  | 'write'
  /** 背包扣環：撿到東西、招募 */
  | 'buckle'
  /** 放下重物：丟掉東西 */
  | 'thud'
  /** 硬幣：變賣、結算 */
  | 'coin'
  /** 蓋章：晉升 */
  | 'stamp'
  /** 火堆：紮營 */
  | 'fire'

/** 音樂實驗室試聽用的名稱 */
export const SFX_LABELS: Readonly<Record<SfxName, string>> = {
  page: '翻頁（往前走、換分頁）',
  pencil: '鉛筆一筆（受傷、編進隊伍）',
  strike: '一筆劃掉（擊倒、移出隊伍、放棄委託）',
  write: '寫字（鑑定）',
  buckle: '背包扣環（撿到東西）',
  thud: '放下重物（丟東西）',
  coin: '硬幣（變賣、結算）',
  stamp: '蓋章（晉升、承接委託）',
  fire: '火堆（紮營）',
}

export const SFX_NAMES = Object.keys(SFX_LABELS) as SfxName[]

const jitter = (base: number, spread: number) => base * (1 + (Math.random() * 2 - 1) * spread)

interface Burst {
  at?: number
  duration: number
  type: BiquadFilterType
  from: number
  to?: number
  q?: number
  gain: number
  attack?: number
}

export class SfxBank {
  private readonly out: GainNode
  private readonly noise: AudioBuffer

  constructor(private readonly ctx: AudioContext) {
    this.out = ctx.createGain()
    this.setVolume(0.7)
    this.out.connect(ctx.destination)

    const length = ctx.sampleRate
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }

  /** 玩家在設定裡調的音量，0～1 */
  setVolume(level: number): void {
    this.out.gain.value = 0.8 * Math.max(0, Math.min(1, level))
  }

  /** strength：1 為一般，重擊之類可以給到 1.5 */
  play(name: SfxName, strength = 1): void {
    const s = Math.max(0.2, Math.min(2, strength))
    switch (name) {
      // 最常出現的聲音，刻意壓低，聽久了才不會煩
      case 'page':
        this.burst({ duration: 0.26, type: 'bandpass', from: jitter(1900, 0.1), to: 650, q: 0.7, gain: 0.18 * s, attack: 0.05 })
        this.burst({ at: 0.07, duration: 0.09, type: 'highpass', from: 3200, gain: 0.05 * s })
        break

      case 'pencil':
        this.stroke(0, 0.11, s)
        break

      case 'strike':
        this.burst({ duration: 0.3, type: 'bandpass', from: 2600, to: jitter(5200, 0.08), q: 1.6, gain: 0.2 * s, attack: 0.02 })
        break

      case 'write': {
        let t = 0
        for (let i = 0; i < 6; i++) {
          this.stroke(t, jitter(0.07, 0.3), 0.7 * s)
          t += jitter(0.13, 0.35)
        }
        break
      }

      case 'buckle':
        this.click(0, s)
        this.click(jitter(0.09, 0.15), 0.7 * s)
        break

      case 'thud':
        this.burst({ duration: 0.2, type: 'lowpass', from: 320, q: 0.8, gain: 0.5 * s })
        this.tone({ freq: 85, to: 55, duration: 0.18, gain: 0.35 * s })
        break

      case 'coin': {
        const count = Math.round(Math.min(3, Math.max(1, s * 1.5)))
        for (let i = 0; i < count; i++) {
          const at = i * jitter(0.08, 0.2)
          this.tone({ at, freq: jitter(2700, 0.04), duration: 0.35, gain: 0.07, type: 'sine' })
          this.tone({ at, freq: jitter(4150, 0.04), duration: 0.22, gain: 0.04, type: 'sine' })
        }
        break
      }

      case 'stamp':
        this.burst({ duration: 0.12, type: 'lowpass', from: 600, gain: 0.45 * s })
        this.tone({ freq: 130, to: 60, duration: 0.22, gain: 0.4 * s })
        break

      case 'fire':
        this.burst({ duration: 1.2, type: 'lowpass', from: 420, q: 0.5, gain: 0.12 * s, attack: 0.3 })
        for (let i = 0; i < 9; i++) {
          this.burst({ at: Math.random() * 1.1, duration: jitter(0.02, 0.4), type: 'highpass', from: jitter(2600, 0.3), gain: 0.14 * s })
        }
        break
    }
  }

  /** 鉛筆在紙上劃一下：高頻的沙沙聲，中間有一點起伏 */
  private stroke(at: number, duration: number, strength: number): void {
    this.burst({ at, duration, type: 'bandpass', from: jitter(4200, 0.15), to: jitter(3600, 0.15), q: 1.8, gain: 0.16 * strength, attack: 0.012 })
  }

  /** 金屬扣環：短促的雜訊加兩個不和諧的高音 */
  private click(at: number, strength: number): void {
    this.burst({ at, duration: 0.025, type: 'highpass', from: 4500, gain: 0.25 * strength })
    this.tone({ at, freq: jitter(2300, 0.05), duration: 0.07, gain: 0.05 * strength, type: 'triangle' })
    this.tone({ at, freq: jitter(3350, 0.05), duration: 0.05, gain: 0.035 * strength, type: 'triangle' })
  }

  private burst(b: Burst): void {
    const start = this.ctx.currentTime + (b.at ?? 0)
    const end = start + b.duration

    const source = this.ctx.createBufferSource()
    source.buffer = this.noise
    const offset = Math.random() * Math.max(0, this.noise.duration - b.duration - 0.05)

    const filter = this.ctx.createBiquadFilter()
    filter.type = b.type
    filter.frequency.setValueAtTime(b.from, start)
    if (b.to) filter.frequency.exponentialRampToValueAtTime(b.to, end)
    filter.Q.value = b.q ?? 0.7

    const env = this.ctx.createGain()
    const attack = Math.min(b.attack ?? 0.004, b.duration / 2)
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, b.gain), start + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, end)

    source.connect(filter).connect(env).connect(this.out)
    source.start(start, offset, b.duration + 0.02)
    source.onended = () => env.disconnect()
  }

  private tone(t: {
    at?: number
    freq: number
    to?: number
    duration: number
    gain: number
    type?: OscillatorType
  }): void {
    const start = this.ctx.currentTime + (t.at ?? 0)
    const end = start + t.duration

    const osc = this.ctx.createOscillator()
    osc.type = t.type ?? 'sine'
    osc.frequency.setValueAtTime(t.freq, start)
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, end)

    const env = this.ctx.createGain()
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, t.gain), start + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, end)

    osc.connect(env).connect(this.out)
    osc.start(start)
    osc.stop(end + 0.02)
    osc.onended = () => env.disconnect()
  }
}
