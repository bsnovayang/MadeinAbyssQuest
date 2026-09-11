import { parseAbc } from './abc'
import { AdaptiveTrack, MusicBus } from './music'
import type { SoundSource } from './sampler'
import { TRACKS, type TrackId } from './tracks'

/** 一般換場景的淡入淡出 */
const FADE = 2.5
/** 打起來要快，不能等音樂慢慢進來 */
const BATTLE_IN = 0.8
const BATTLE_OUT = 0.6

/**
 * 遊戲裡的配樂調度（企劃書 15-5b）：依場景在三首曲子之間淡入淡出。
 *
 * 音色檔用到才下載：城鎮先載；出發下潛時載探索，同時預載戰鬥，
 * 遭遇敵人時才不會等。
 */
export class MusicDirector {
  private readonly bus: MusicBus
  private readonly loading = new Map<TrackId, Promise<AdaptiveTrack | null>>()
  private readonly playing = new Map<TrackId, AdaptiveTrack>()
  private readonly stopTimers = new Map<TrackId, ReturnType<typeof setTimeout>>()
  private scene: TrackId | null = null
  private warmth = 1
  private muted = false
  /** 玩家在設定裡調的音量，0～1 */
  private level = 0.7

  constructor(
    private readonly ctx: AudioContext,
    private readonly source: SoundSource = 'bundled',
  ) {
    this.bus = new MusicBus(ctx)
    this.bus.setVolume(this.level)
    this.bus.setReverb(0.35)
  }

  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level))
    if (!this.muted) this.bus.setVolume(this.level)
  }

  setScene(id: TrackId): void {
    if (this.scene === id) return
    this.scene = id
    void this.enter(id)
    if (id === 'explore') void this.load('battle')
  }

  /** 同樣的值不重設 —— 否則會打斷紮營時正在進行的漲起 */
  setWarmth(level: number): void {
    if (level === this.warmth) return
    this.warmth = level
    this.bus.setWarmth(level)
  }

  swell(): void {
    this.bus.swell()
  }

  hush(ms: number): void {
    this.bus.hush(ms)
  }

  /**
   * 只調音量。AudioContext 還要給音效用，
   * 要不要整個暫停由 ui/audio.ts 決定（音樂與音效都關掉時才暫停）。
   */
  setMuted(muted: boolean): void {
    if (muted === this.muted) return
    this.muted = muted
    this.bus.setVolume(muted ? 0 : this.level)
  }

  private async enter(id: TrackId): Promise<void> {
    const track = await this.load(id)
    // 下載期間場景可能又換了
    if (!track || this.scene !== id) return

    clearTimeout(this.stopTimers.get(id))
    this.stopTimers.delete(id)
    if (!this.playing.has(id)) {
      track.fade(0, 0)
      track.start()
      this.playing.set(id, track)
    }

    const toBattle = id === 'battle'
    track.fade(1, toBattle ? BATTLE_IN : FADE)

    for (const [other, playing] of this.playing) {
      if (other === id) continue
      const out = toBattle ? BATTLE_OUT : FADE
      playing.fade(0, out)
      // 戰鬥時探索曲只是轉成靜音，打完從原處接回來
      if (toBattle && other === 'explore') continue
      this.stopLater(other, playing, out)
    }
  }

  private stopLater(id: TrackId, track: AdaptiveTrack, afterSeconds: number): void {
    clearTimeout(this.stopTimers.get(id))
    this.stopTimers.set(
      id,
      setTimeout(
        () => {
          this.stopTimers.delete(id)
          if (this.scene === id) return
          track.stop()
          this.playing.delete(id)
        },
        (afterSeconds + 0.2) * 1000,
      ),
    )
  }

  private load(id: TrackId): Promise<AdaptiveTrack | null> {
    const cached = this.loading.get(id)
    if (cached) return cached

    const def = TRACKS.find((t) => t.id === id)
    if (!def) return Promise.resolve(null)

    const pending = AdaptiveTrack.load(this.ctx, parseAbc(def.abc), this.source)
      .then((track) => {
        track.connect(this.bus)
        return track
      })
      .catch(() => {
        // 下載失敗就安靜地沒有音樂；下次換到這個場景時再試
        this.loading.delete(id)
        return null
      })
    this.loading.set(id, pending)
    return pending
  }
}
