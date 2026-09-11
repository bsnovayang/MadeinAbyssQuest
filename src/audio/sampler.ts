/**
 * 真實樂器的取樣音色。
 *
 * 音色檔來自 MIDI.js soundfont：每個樂器一個約 3MB 的 JS 檔，
 * 裡面是每個音高各一段 base64 的 mp3。只解碼曲子實際用到的音。
 *
 * 遊戲裡用 'bundled'：npm run soundfonts 只抽出配樂用到的音，放在 public/soundfonts 隨遊戲部署。
 * 音樂實驗室可以直接從 CDN 讀完整的音色庫，方便試新的譜。
 */

export type SoundfontName = 'FluidR3_GM' | 'MusyngKite'
export type SoundSource = SoundfontName | 'bundled'

export const SOUNDFONTS: readonly { id: SoundSource; label: string }[] = [
  { id: 'MusyngKite', label: 'MusyngKite（完整，從網路讀）' },
  { id: 'bundled', label: '遊戲內（瘦身版，只含配樂用到的音）' },
  { id: 'FluidR3_GM', label: 'FluidR3（較輕，從網路讀）' },
]

const BASE_URL = 'https://gleitz.github.io/midi-js-soundfonts'

/**
 * 音色檔裡每個音的取樣長度（秒），所有樂器都一樣。
 * 音符時值加上釋音超過這個長度，尾巴會被切掉。
 */
export const SAMPLE_SECONDS = 3.19

interface InstrumentDef {
  file: string
  label: string
  /** 起音秒數。弦樂、合唱要慢，否則每個音都像被敲出來 */
  attack?: number
  /** 放開後的餘音秒數 */
  release?: number
  /** 送進殘響的比例。低音進太多殘響會糊 */
  reverb?: number
}

const DEFAULT_ENVELOPE = { attack: 0.012, release: 0.35, reverb: 1 }

/** General MIDI 音色編號（0 起算）→ MIDI.js 檔名。寫譜時用 %%MIDI program 指定 */
export const GM_INSTRUMENTS: Readonly<Record<number, InstrumentDef>> = {
  0: { file: 'acoustic_grand_piano', label: '鋼琴' },
  8: { file: 'celesta', label: '鋼片琴' },
  10: { file: 'music_box', label: '音樂盒' },
  24: { file: 'acoustic_guitar_nylon', label: '古典吉他' },
  40: { file: 'violin', label: '小提琴', attack: 0.06, release: 0.5 },
  42: { file: 'cello', label: '大提琴', attack: 0.06, release: 0.5, reverb: 0.4 },
  43: { file: 'contrabass', label: '低音提琴', attack: 0.06, release: 0.5, reverb: 0.3 },
  44: { file: 'tremolo_strings', label: '顫弓弦樂', attack: 0.1, release: 0.6 },
  45: { file: 'pizzicato_strings', label: '撥弦', attack: 0.005, release: 0.25 },
  46: { file: 'orchestral_harp', label: '豎琴' },
  47: { file: 'timpani', label: '定音鼓', attack: 0.005, release: 0.6, reverb: 0.5 },
  48: { file: 'string_ensemble_1', label: '弦樂', attack: 0.15, release: 0.6 },
  52: { file: 'choir_aahs', label: '合唱', attack: 0.12, release: 0.5 },
  53: { file: 'voice_oohs', label: '人聲', attack: 0.12, release: 0.5 },
  68: { file: 'oboe', label: '雙簧管', attack: 0.03 },
  71: { file: 'clarinet', label: '單簧管', attack: 0.03 },
  73: { file: 'flute', label: '長笛', attack: 0.03 },
  74: { file: 'recorder', label: '直笛', attack: 0.03 },
  89: { file: 'pad_2_warm', label: '溫暖合成墊', attack: 0.2, release: 0.8 },
}

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** MIDI 編號 → 音色檔裡的音名。音色檔一律用降記號，C4 = 60 */
export function noteName(midi: number): string {
  const pitch = NOTE_NAMES[((midi % 12) + 12) % 12] ?? 'C'
  return `${pitch}${Math.floor(midi / 12) - 1}`
}

export interface InstrumentInfo {
  file: string
  label: string
  known: boolean
  attack: number
  release: number
  reverb: number
}

export function instrumentInfo(program: number): InstrumentInfo {
  const info = GM_INSTRUMENTS[program]
  if (info) return { ...DEFAULT_ENVELOPE, ...info, known: true }
  return {
    ...DEFAULT_ENVELOPE,
    file: 'acoustic_grand_piano',
    label: `音色 ${program}（未對應，暫用鋼琴）`,
    known: false,
  }
}

const tables = new Map<string, Promise<Map<string, string>>>()

function loadTable(source: SoundSource, file: string): Promise<Map<string, string>> {
  // 相對路徑：GitHub Pages 的專案頁不在網域根目錄
  const url =
    source === 'bundled' ? `soundfonts/${file}.json` : `${BASE_URL}/${source}/${file}-mp3.js`
  const cached = tables.get(url)
  if (cached) return cached

  const pending = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`讀不到音色檔 ${file}（${res.status}）`)
      if (source === 'bundled') {
        return new Map(Object.entries((await res.json()) as Record<string, string>))
      }
      const text = await res.text()
      const table = new Map<string, string>()
      for (const m of text.matchAll(/"([A-G]b?-?\d)"\s*:\s*"data:audio\/mp3;base64,([^"]+)"/g)) {
        if (m[1] && m[2]) table.set(m[1], m[2])
      }
      return table
    })
    .catch((err: unknown) => {
      // 網路失敗不要永久快取，下次按播放可以重試
      tables.delete(url)
      throw err
    })

  tables.set(url, pending)
  return pending
}

export class SampledInstrument {
  private readonly decoding = new Map<number, Promise<void>>()
  private readonly buffers = new Map<number, AudioBuffer>()

  private constructor(
    private readonly ctx: BaseAudioContext,
    private readonly table: Map<string, string>,
    private readonly info: InstrumentInfo,
  ) {}

  get label(): string {
    return this.info.label
  }

  static async load(
    ctx: BaseAudioContext,
    source: SoundSource,
    program: number,
  ): Promise<SampledInstrument> {
    const info = instrumentInfo(program)
    const table = await loadTable(source, info.file)
    return new SampledInstrument(ctx, table, info)
  }

  /** 先把用得到的音解碼好，播放時才不會卡 */
  async prepare(midis: Iterable<number>): Promise<void> {
    await Promise.all([...new Set(midis)].map((m) => this.decode(m)))
  }

  private decode(midi: number): Promise<void> {
    const cached = this.decoding.get(midi)
    if (cached) return cached

    const pending = (async () => {
      const b64 = this.table.get(noteName(midi))
      if (!b64) return
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      this.buffers.set(midi, await this.ctx.decodeAudioData(bytes.buffer))
    })()

    this.decoding.set(midi, pending)
    return pending
  }

  /** 沒有預先解碼的音會被略過 */
  play(
    midi: number,
    when: number,
    duration: number,
    destination: AudioNode,
    velocity = 0.7,
  ): AudioBufferSourceNode | null {
    const buffer = this.buffers.get(midi)
    if (!buffer) return null

    const source = this.ctx.createBufferSource()
    source.buffer = buffer

    // 起音與釋音依樂器而定：撥弦要快、弦樂和合唱要慢
    const envelope = this.ctx.createGain()
    const end = when + Math.max(0.05, duration)
    const { attack, release } = this.info
    const peak = Math.min(when + attack, end)
    envelope.gain.setValueAtTime(0, when)
    envelope.gain.linearRampToValueAtTime(velocity, peak)
    envelope.gain.setValueAtTime(velocity, end)
    envelope.gain.linearRampToValueAtTime(0, end + release)

    source.connect(envelope).connect(destination)
    source.start(when)
    source.stop(end + release + 0.05)
    source.onended = () => envelope.disconnect()
    return source
  }
}
