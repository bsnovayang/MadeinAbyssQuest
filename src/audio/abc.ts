/**
 * ABC 記譜的最小解析器。
 *
 * 只支援配樂用得到的子集：音高、臨時記號、調號、時值、休止、和弦、連結線、
 * 三連音、附點節奏（> <）、反覆記號、多聲部、%%MIDI program、%%MIDI control 7（音量）。
 * 不支援：房角（[1 [2）、裝飾音的實際發聲、曲中變速。
 *
 * 每個聲部輸出一條獨立的音符清單 —— 這是「一名隊員一個聲部」
 * 能在執行時個別淡出的前提（企劃書 16-2）。
 */

export interface AbcNote {
  /** 從曲子開頭算起的秒數 */
  start: number
  duration: number
  /** 和弦會有多個音 */
  midi: number[]
}

export interface AbcVoice {
  id: string
  name: string
  /** General MIDI 音色（0 起算），由 %%MIDI program 指定 */
  program: number
  /** 0～1，由 %%MIDI control 7 指定（0～127），沒寫就是 1 */
  volume: number
  notes: AbcNote[]
  /** 這個聲部寫到哪裡（秒）。和其他聲部不一致，代表小節數寫錯了 */
  length: number
}

export interface AbcTune {
  title: string
  bpm: number
  /** 一拍是幾分之幾的全音符，例如 1/4 */
  beat: number
  meter: [number, number]
  voices: AbcVoice[]
  /** 一輪的長度（秒），取最長的聲部 */
  length: number
}

const LETTER_BASE: Readonly<Record<string, number>> = {
  C: 60,
  D: 62,
  E: 64,
  F: 65,
  G: 67,
  A: 69,
  B: 71,
}

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

const MAJOR_FIFTHS: Readonly<Record<string, number>> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  'C#': 7,
  'G#': 8,
  'D#': 9,
  'A#': 10,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
  Cb: -7,
}

/** 調式相對於同主音大調，在五度圈上差幾格 */
const MODE_SHIFT: Readonly<Record<string, number>> = {
  '': 0,
  maj: 0,
  major: 0,
  ion: 0,
  ionian: 0,
  m: -3,
  min: -3,
  minor: -3,
  aeo: -3,
  aeolian: -3,
  dor: -2,
  dorian: -2,
  phr: -4,
  phrygian: -4,
  lyd: 1,
  lydian: 1,
  mix: -1,
  mixolydian: -1,
  loc: -5,
  locrian: -5,
}

function keySignature(fifths: number): Record<string, number> {
  const sig: Record<string, number> = {}
  const count = Math.min(7, Math.abs(fifths))
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER
  for (const letter of order.slice(0, count)) sig[letter] = fifths > 0 ? 1 : -1
  return sig
}

/** K: 欄位 → 每個音名的升降。例如 Dmin → { B: -1 } */
export function parseKey(value: string): Record<string, number> {
  const m = /^\s*([A-Ga-g])([#b]?)\s*([A-Za-z]*)/.exec(value)
  if (!m) return {}
  const tonic = (m[1] ?? 'C').toUpperCase() + (m[2] ?? '')
  const mode = (m[3] ?? '').toLowerCase()
  const shift = MODE_SHIFT[mode] ?? MODE_SHIFT[mode.slice(0, 3)] ?? 0
  return keySignature((MAJOR_FIFTHS[tonic] ?? 0) + shift)
}

interface VoiceCursor {
  voice: AbcVoice
  /** 以全音符為單位，最後才換算成秒 */
  time: number
  barAccidentals: Map<string, number>
  repeatNote: number
  repeatTime: number
  tieOpen: boolean
  lastLength: number
}

function sameNotes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((m, k) => m === b[k])
}

function markRepeat(v: VoiceCursor): void {
  v.repeatNote = v.voice.notes.length
  v.repeatTime = v.time
}

function repeatSection(v: VoiceCursor): void {
  const span = v.time - v.repeatTime
  if (span <= 1e-9) return
  const section = v.voice.notes
    .slice(v.repeatNote)
    .filter((n) => n.start >= v.repeatTime - 1e-9)
  for (const n of section) {
    v.voice.notes.push({ start: n.start + span, duration: n.duration, midi: [...n.midi] })
  }
  v.time += span
  markRepeat(v)
}

export function parseAbc(text: string): AbcTune {
  // 狀態包在物件裡：閉包內的賦值不會讓 TypeScript 把外層讀取誤判成 null
  const st = {
    title: '',
    meter: [4, 4] as [number, number],
    unit: null as number | null,
    tempo: null as { beat: number; bpm: number } | null,
    key: {} as Record<string, number>,
    pendingProgram: 0,
    pendingVolume: 1,
    cur: null as VoiceCursor | null,
  }
  const cursors = new Map<string, VoiceCursor>()

  // ABC 規定：沒寫 L 時，拍號小於 3/4 用十六分音符，否則用八分音符
  const unitLength = () => st.unit ?? (st.meter[0] / st.meter[1] < 0.75 ? 1 / 16 : 1 / 8)

  const voiceById = (id: string, name?: string): VoiceCursor => {
    const existing = cursors.get(id)
    if (existing) {
      if (name) existing.voice.name = name
      return existing
    }
    const created: VoiceCursor = {
      voice: {
        id,
        name: name ?? id,
        program: st.pendingProgram,
        volume: st.pendingVolume,
        notes: [],
        length: 0,
      },
      time: 0,
      barAccidentals: new Map(),
      repeatNote: 0,
      repeatTime: 0,
      tieOpen: false,
      lastLength: 0,
    }
    cursors.set(id, created)
    return created
  }

  const active = (): VoiceCursor => (st.cur ??= voiceById('1'))

  const applyField = (field: string, value: string) => {
    switch (field) {
      case 'T':
        st.title ||= value.trim()
        break
      case 'M': {
        const v = value.trim()
        if (v === 'C') st.meter = [4, 4]
        else if (v === 'C|') st.meter = [2, 2]
        else {
          const m = /(\d+)\s*\/\s*(\d+)/.exec(v)
          if (m) st.meter = [Number(m[1]), Number(m[2])]
        }
        break
      }
      case 'L': {
        const m = /(\d+)\s*\/\s*(\d+)/.exec(value)
        if (m) st.unit = Number(m[1]) / Number(m[2])
        break
      }
      case 'Q': {
        const m = /(\d+)\s*\/\s*(\d+)\s*=\s*(\d+)/.exec(value)
        if (m) st.tempo = { beat: Number(m[1]) / Number(m[2]), bpm: Number(m[3]) }
        else if (/^\s*\d+\s*$/.test(value)) st.tempo = { beat: unitLength(), bpm: Number(value) }
        break
      }
      case 'K':
        st.key = parseKey(value)
        break
      case 'V': {
        const id = value.trim().split(/\s+/)[0] || '1'
        const name = /name\s*=\s*"([^"]*)"/.exec(value)?.[1]
        st.cur = voiceById(id, name)
        break
      }
    }
  }

  const parseMusic = (line: string) => {
    let i = 0
    const local = {
      tuplet: null as { remaining: number; ratio: number } | null,
      /** 附點節奏留給下一個音的倍率 */
      broken: 1,
    }

    const rest = () => line.slice(i)

    const readDuration = (): number => {
      const m = /^(\d*)(\/*)(\d*)/.exec(rest())
      if (!m) return 1
      i += m[0].length
      const num = m[1] ? Number(m[1]) : 1
      const slashes = (m[2] ?? '').length
      if (slashes === 0) return num
      return num / (m[3] ? Number(m[3]) : 2 ** slashes)
    }

    const readPitch = (): number | null => {
      const m = /^(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)/.exec(rest())
      if (!m) return null
      i += m[0].length

      const letter = m[2] ?? 'C'
      const upper = letter.toUpperCase()
      let octave = letter === upper ? 0 : 1
      for (const mark of m[3] ?? '') octave += mark === "'" ? 1 : -1

      // 臨時記號只影響同一小節、同一八度的同名音
      const v = active()
      const barKey = `${upper}${octave}`
      let offset: number
      if (m[1]) {
        const acc = m[1]
        offset = acc === '^^' ? 2 : acc === '^' ? 1 : acc === '__' ? -2 : acc === '_' ? -1 : 0
        v.barAccidentals.set(barKey, offset)
      } else {
        offset = v.barAccidentals.get(barKey) ?? st.key[upper] ?? 0
      }

      return (LETTER_BASE[upper] ?? 60) + 12 * octave + offset
    }

    const addNote = (midi: number[], units: number) => {
      const v = active()
      let len = units * unitLength() * local.broken
      local.broken = 1

      if (local.tuplet) {
        len *= local.tuplet.ratio
        local.tuplet.remaining -= 1
        if (local.tuplet.remaining <= 0) local.tuplet = null
      }

      const notes = v.voice.notes
      const last = notes[notes.length - 1]
      const touching = !!last && Math.abs(last.start + last.duration - v.time) < 1e-9

      if (midi.length > 0) {
        if (v.tieOpen && last && touching && sameNotes(last.midi, midi)) last.duration += len
        else notes.push({ start: v.time, duration: len, midi })
      }

      v.tieOpen = false
      v.time += len
      v.lastLength = len
    }

    while (i < line.length) {
      const ch = line[i] ?? ''

      if (ch === '%') break

      // 和弦名稱、裝飾記號、倚音：不發聲，整段略過
      if (ch === '"' || ch === '!' || ch === '+' || ch === '{') {
        const end = line.indexOf(ch === '{' ? '}' : ch, i + 1)
        i = end < 0 ? line.length : end + 1
        continue
      }

      if (ch === '[') {
        const inline = /^\[([A-Za-z]):([^\]]*)\]/.exec(rest())
        if (inline) {
          applyField(inline[1] ?? '', inline[2] ?? '')
          i += inline[0].length
          continue
        }
        const next = line[i + 1] ?? ''
        if (next === '|') {
          active().barAccidentals.clear()
          i += 2
          continue
        }
        if (/\d/.test(next)) {
          i += 2
          continue
        }

        i += 1
        const pitches: number[] = []
        let inner: number | null = null
        while (i < line.length && line[i] !== ']') {
          const p = readPitch()
          if (p === null) {
            i += 1
            continue
          }
          const d = readDuration()
          inner ??= d
          pitches.push(p)
        }
        i += 1
        addNote(pitches, (inner ?? 1) * readDuration())
        continue
      }

      if (ch === '|' || ch === ':' || ch === ']') {
        const run = /^[|:\]]+/.exec(rest())?.[0] ?? ch
        i += run.length
        const v = active()
        v.barAccidentals.clear()
        // 開頭是冒號代表反覆結束，結尾是冒號代表反覆開始
        if (run.startsWith(':')) repeatSection(v)
        if (run.endsWith(':')) markRepeat(v)
        continue
      }

      if (ch === '(') {
        const m = /^\((\d)/.exec(rest())
        if (m) {
          const p = Number(m[1])
          const q = p === 2 ? 3 : p === 3 ? 2 : p === 4 ? 3 : p === 6 ? 2 : p - 1
          local.tuplet = { remaining: p, ratio: q / p }
          i += m[0].length
        } else {
          i += 1
        }
        continue
      }

      if (ch === '-') {
        active().tieOpen = true
        i += 1
        continue
      }

      if (ch === '>' || ch === '<') {
        let count = 0
        while (line[i] === ch) {
          count += 1
          i += 1
        }
        const factor = 1 - 0.5 ** count
        const sign = ch === '>' ? 1 : -1
        const v = active()
        const shift = v.lastLength * factor * sign
        const last = v.voice.notes[v.voice.notes.length - 1]
        if (last && Math.abs(last.start + last.duration - v.time) < 1e-9) last.duration += shift
        v.time += shift
        local.broken = 1 - factor * sign
        continue
      }

      if (ch === 'z' || ch === 'x' || ch === 'Z' || ch === 'X') {
        i += 1
        const units = readDuration()
        const bar = st.meter[0] / st.meter[1] / unitLength()
        addNote([], ch === 'Z' || ch === 'X' ? units * bar : units)
        continue
      }

      const pitch = readPitch()
      if (pitch !== null) {
        addNote([pitch], readDuration())
        continue
      }

      i += 1
    }
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const program = /^%%MIDI\s+program\s+(\d+)/i.exec(line)
    if (program) {
      const p = Number(program[1])
      if (st.cur) st.cur.voice.program = p
      else st.pendingProgram = p
      continue
    }
    const control = /^%%MIDI\s+control\s+7\s+(\d+)/i.exec(line)
    if (control) {
      const volume = Math.min(127, Number(control[1])) / 127
      if (st.cur) st.cur.voice.volume = volume
      else st.pendingVolume = volume
      continue
    }
    if (line.startsWith('%')) continue

    const field = /^([A-Za-z]):(.*)$/.exec(line)
    if (field) {
      applyField(field[1] ?? '', field[2] ?? '')
      continue
    }

    parseMusic(line)
  }

  const beat = st.tempo?.beat ?? 1 / 4
  const bpm = st.tempo?.bpm ?? 120
  const secondsPerWhole = 60 / bpm / beat

  const voices = [...cursors.values()]
    .map(
      (c): AbcVoice => ({
        ...c.voice,
        length: c.time * secondsPerWhole,
        notes: c.voice.notes.map((n) => ({
          start: n.start * secondsPerWhole,
          duration: n.duration * secondsPerWhole,
          midi: n.midi,
        })),
      }),
    )
    .filter((v) => v.notes.length > 0 || v.length > 0)

  return {
    title: st.title,
    bpm,
    beat,
    meter: st.meter,
    voices,
    length: Math.max(0, ...voices.map((v) => v.length)),
  }
}

/** 一份檔案裡的多首曲子，以 X: 分開 */
export function parseAbcBook(text: string): AbcTune[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/^(?=X:)/m)
    .filter((chunk) => chunk.startsWith('X:'))
    .map(parseAbc)
}
