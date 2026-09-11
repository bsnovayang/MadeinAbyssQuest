import type { AbcTune, AbcVoice } from './abc'
import { instrumentInfo, SampledInstrument, type SoundSource } from './sampler'

/** 在一輪結束前多久排好下一輪 */
const LOOKAHEAD = 1.5

/**
 * 會隨局勢變化的配樂：同一首曲子，每個聲部接到各自的音量上。
 *
 * 聲部可以個別開關，留給暫緩的設計（企劃書 15-5b）：
 * 一名隊員倒下 → 那個聲部淡出；越潛越深 → 聲部一個一個消失。
 */
export class AdaptiveTrack {
  /** 不經殘響的聲音 */
  private readonly dry: GainNode
  /** 送進殘響的聲音，比例依樂器而定 */
  private readonly send: GainNode
  /** 聲部開關（倒下、恢復） */
  private readonly gains = new Map<string, GainNode>()
  /** 聲部音量（混音比例） */
  private readonly levels = new Map<string, GainNode>()
  private readonly instruments = new Map<string, SampledInstrument>()
  private readonly sources = new Set<AudioBufferSourceNode>()
  private timer: ReturnType<typeof setInterval> | null = null
  private nextLoopAt = 0

  private constructor(
    private readonly ctx: AudioContext,
    readonly tune: AbcTune,
  ) {
    this.dry = ctx.createGain()
    this.send = ctx.createGain()
    for (const voice of tune.voices) {
      const gain = ctx.createGain()
      const level = ctx.createGain()
      const reverb = ctx.createGain()
      level.gain.value = voice.volume
      reverb.gain.value = instrumentInfo(voice.program).reverb
      gain.connect(level)
      level.connect(this.dry)
      level.connect(reverb).connect(this.send)
      this.gains.set(voice.id, gain)
      this.levels.set(voice.id, level)
    }
  }

  connect(bus: MusicBus): void {
    this.dry.connect(bus.input)
    this.send.connect(bus.reverbInput)
  }

  disconnect(): void {
    this.dry.disconnect()
    this.send.disconnect()
  }

  /** 整首淡入淡出（換場景用），不影響聲部各自的開關與音量 */
  fade(level: number, seconds: number): void {
    const now = this.ctx.currentTime
    for (const node of [this.dry, this.send]) {
      const param = node.gain
      param.cancelScheduledValues(now)
      if (seconds <= 0) {
        param.setValueAtTime(level, now)
      } else {
        param.setValueAtTime(param.value, now)
        param.linearRampToValueAtTime(level, now + seconds)
      }
    }
  }

  static async load(
    ctx: AudioContext,
    tune: AbcTune,
    source: SoundSource,
    onVoiceReady?: (voice: AbcVoice, label: string) => void,
  ): Promise<AdaptiveTrack> {
    const track = new AdaptiveTrack(ctx, tune)
    await Promise.all(
      tune.voices.map(async (voice) => {
        const instrument = await SampledInstrument.load(ctx, source, voice.program)
        await instrument.prepare(voice.notes.flatMap((n) => n.midi))
        track.instruments.set(voice.id, instrument)
        onVoiceReady?.(voice, instrument.label)
      }),
    )
    return track
  }

  start(): void {
    this.stop()
    if (this.tune.length <= 0) return
    this.nextLoopAt = this.ctx.currentTime + 0.15
    this.scheduleLoop()
    // 每一輪結束前預先排好下一輪，循環才不會有縫
    this.timer = setInterval(() => {
      if (this.ctx.currentTime > this.nextLoopAt - LOOKAHEAD) this.scheduleLoop()
    }, 200)
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    const now = this.ctx.currentTime
    for (const source of this.sources) source.stop(now)
    this.sources.clear()
  }

  setVoice(voiceId: string, on: boolean, fadeSeconds: number): void {
    const gain = this.gains.get(voiceId)
    if (!gain) return
    const now = this.ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(on ? 1 : 0, now + fadeSeconds)
  }

  /** 0～1，對應譜上的 %%MIDI control 7 */
  setVoiceVolume(voiceId: string, volume: number): void {
    const level = this.levels.get(voiceId)
    if (!level) return
    const now = this.ctx.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.setValueAtTime(level.gain.value, now)
    level.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), now + 0.08)
  }

  private scheduleLoop(): void {
    const loopStart = this.nextLoopAt
    for (const voice of this.tune.voices) {
      const instrument = this.instruments.get(voice.id)
      const destination = this.gains.get(voice.id)
      if (!instrument || !destination) continue

      for (const note of voice.notes) {
        for (const midi of note.midi) {
          const source = instrument.play(midi, loopStart + note.start, note.duration, destination)
          if (!source) continue
          this.sources.add(source)
          source.addEventListener('ended', () => this.sources.delete(source))
        }
      }
    }
    this.nextLoopAt = loopStart + this.tune.length
  }
}

function impulseResponse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
    }
  }
  return buffer
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** 暖度 0～1 → 低通濾波的截止頻率：0 = 500Hz（悶），1 = 18kHz（全開） */
const warmthHz = (level: number) => 500 * 36 ** clamp01(level)

/**
 * 所有配樂最後都經過這裡：暖度（濾波）、殘響、音量、靜止。
 *
 * 殘響是取樣音色聽起來「像音樂而不像 MIDI」的最大差別，所以一開始就放進來。
 */
export class MusicBus {
  readonly input: GainNode
  /** 各聲部依樂器比例送進來的殘響 */
  readonly reverbInput: GainNode
  private readonly wet: GainNode
  private readonly filter: BiquadFilterNode
  private readonly master: GainNode
  private volume = 0.8
  private warmth = 1

  constructor(private readonly ctx: AudioContext) {
    this.input = ctx.createGain()
    this.reverbInput = ctx.createGain()
    const dry = ctx.createGain()
    this.wet = ctx.createGain()
    this.filter = ctx.createBiquadFilter()
    this.master = ctx.createGain()

    const reverb = ctx.createConvolver()
    reverb.buffer = impulseResponse(ctx, 2.8)

    this.filter.type = 'lowpass'
    this.filter.frequency.value = 18000
    this.wet.gain.value = 0.35
    this.master.gain.value = this.volume

    this.input.connect(dry).connect(this.filter)
    this.reverbInput.connect(reverb).connect(this.wet).connect(this.filter)
    this.filter.connect(this.master).connect(ctx.destination)
  }

  /** 0 = 悶、冷；1 = 全開 */
  setWarmth(level: number): void {
    this.warmth = clamp01(level)
    this.ramp(this.filter.frequency, warmthHz(this.warmth), 1.2)
  }

  /** 紮營：聲音短暫變亮、變大，再回到原本的暖度與音量 */
  swell(): void {
    const now = this.ctx.currentTime
    const peak = Math.min(1, this.volume * 1.35)

    const freq = this.filter.frequency
    freq.cancelScheduledValues(now)
    freq.setValueAtTime(freq.value, now)
    freq.linearRampToValueAtTime(warmthHz(1), now + 1.2)
    freq.setValueAtTime(warmthHz(1), now + 3.5)
    freq.linearRampToValueAtTime(warmthHz(this.warmth), now + 6)

    const gain = this.master.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(peak, now + 1.2)
    gain.setValueAtTime(peak, now + 3.5)
    gain.linearRampToValueAtTime(this.volume, now + 6)
  }

  setReverb(amount: number): void {
    this.ramp(this.wet.gain, clamp01(amount), 0.3)
  }

  setVolume(value: number): void {
    this.volume = clamp01(value)
    this.ramp(this.master.gain, this.volume, 0.3)
  }

  /** 負荷發作：音樂完全停住一段時間再回來（企劃書 16-3） */
  hush(ms: number): void {
    const gain = this.master.gain
    const now = this.ctx.currentTime
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + 0.08)
    gain.setValueAtTime(0, now + ms / 1000)
    gain.linearRampToValueAtTime(this.volume, now + ms / 1000 + 1.2)
  }

  private ramp(param: AudioParam, value: number, seconds: number): void {
    const now = this.ctx.currentTime
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(value, now + seconds)
  }
}
