import { describe, expect, it } from 'vitest'
import { parseAbc, parseAbcBook, parseKey } from '../abc'
import { instrumentInfo, SAMPLE_SECONDS } from '../sampler'
import { TRACKS } from '../tracks'

// 每分鐘 120 個四分音符 → 全音符 2 秒，八分音符 0.25 秒
const HEADER = 'X:1\nM:4/4\nL:1/8\nQ:1/4=120\nK:C\n'

const one = (body: string, header = HEADER) => parseAbc(header + body).voices[0]!
const pitches = (body: string, header = HEADER) => one(body, header).notes.map((n) => n.midi)

describe('音高', () => {
  it('大寫是中央 C 那一個八度，小寫高一個八度', () => {
    expect(pitches('C D E F G A B c')).toEqual([[60], [62], [64], [65], [67], [69], [71], [72]])
  })

  it('逗號降八度、撇號升八度', () => {
    expect(pitches("C, C,, c' c''")).toEqual([[48], [36], [84], [96]])
  })

  it('臨時記號', () => {
    expect(pitches('^C _B =B ^^C __E')).toEqual([[61], [70], [71], [62], [62]])
  })

  it('臨時記號持續到小節結束', () => {
    expect(pitches('_E E | E')).toEqual([[63], [63], [64]])
  })
})

describe('調號', () => {
  it('F 大調的 B 自動降半音', () => {
    expect(pitches('B', 'X:1\nL:1/8\nK:F\n')).toEqual([[70]])
  })

  it('小調換算成關係大調', () => {
    expect(parseKey('Dmin')).toEqual({ B: -1 })
    expect(parseKey('Gmin')).toEqual({ B: -1, E: -1 })
    expect(parseKey('Emin')).toEqual({ F: 1 })
    expect(parseKey('Amin')).toEqual({})
    expect(parseKey('Cmaj')).toEqual({})
  })

  it('臨時記號可以蓋過調號，並持續到小節結束', () => {
    expect(pitches('=B B', 'X:1\nL:1/8\nK:F\n')).toEqual([[71], [71]])
  })
})

describe('時值', () => {
  it('以 L 為單位，換算成秒', () => {
    const notes = one('A A2 A/2 A3/2 A//').notes
    expect(notes.map((n) => n.duration)).toEqual([0.25, 0.5, 0.125, 0.375, 0.0625])
    expect(notes.map((n) => n.start)).toEqual([0, 0.25, 0.75, 0.875, 1.25])
  })

  it('休止符只推進時間', () => {
    const notes = one('A z2 A').notes
    expect(notes).toHaveLength(2)
    expect(notes[1]!.start).toBeCloseTo(0.75)
  })

  it('沒寫 Q 時用每分鐘 120 個四分音符', () => {
    expect(one('A2', 'X:1\nL:1/8\nK:C\n').notes[0]!.duration).toBeCloseTo(0.5)
  })

  it('沒寫 L 時依拍號決定：小於 3/4 用十六分音符', () => {
    expect(one('A', 'X:1\nM:2/4\nQ:1/4=120\nK:C\n').notes[0]!.duration).toBeCloseTo(0.125)
  })

  it('連結線把同一個音接起來', () => {
    const notes = one('C2-C2 D').notes
    expect(notes).toHaveLength(2)
    expect(notes[0]!.duration).toBeCloseTo(1)
  })

  it('三連音：三個音佔兩個的時間', () => {
    const notes = one('(3CDE F').notes
    expect(notes[0]!.duration).toBeCloseTo((0.25 * 2) / 3)
    expect(notes[3]!.start).toBeCloseTo(0.5)
  })

  it('附點節奏 >', () => {
    const [a, b] = one('A>B').notes
    expect(a!.duration).toBeCloseTo(0.375)
    expect(b!.duration).toBeCloseTo(0.125)
    expect(b!.start).toBeCloseTo(0.375)
  })
})

describe('結構', () => {
  it('和弦', () => {
    const notes = one('[CEG]2').notes
    expect(notes).toHaveLength(1)
    expect(notes[0]!.midi).toEqual([60, 64, 67])
    expect(notes[0]!.duration).toBeCloseTo(0.5)
  })

  it('反覆記號會把段落播兩次', () => {
    const notes = one('|: C D :|').notes
    expect(notes.map((n) => n.midi[0])).toEqual([60, 62, 60, 62])
    expect(notes[2]!.start).toBeCloseTo(0.5)
  })

  it('和弦名稱與註解會被略過', () => {
    expect(pitches('"Am" A % 這是註解 B')).toEqual([[69]])
  })

  it('多聲部與 %%MIDI program', () => {
    const tune = parseAbc(
      `${HEADER}V:1 name="旋律"\n%%MIDI program 73\nC D\nV:2 name="低音"\n%%MIDI program 48\nC,4\n`,
    )
    expect(tune.voices.map((v) => v.name)).toEqual(['旋律', '低音'])
    expect(tune.voices.map((v) => v.program)).toEqual([73, 48])
    expect(tune.voices[1]!.notes[0]!.midi).toEqual([48])
  })

  it('%%MIDI control 7 設定聲部音量，沒寫就是全音量', () => {
    const tune = parseAbc(`${HEADER}V:1\n%%MIDI control 7 64\nC\nV:2\nD\n`)
    expect(tune.voices[0]!.volume).toBeCloseTo(64 / 127)
    expect(tune.voices[1]!.volume).toBe(1)
  })

  it('行內可以切換聲部', () => {
    const tune = parseAbc(`${HEADER}[V:1] C D [V:2] E F\n`)
    expect(tune.voices).toHaveLength(2)
    expect(tune.voices[1]!.notes.map((n) => n.midi[0])).toEqual([64, 65])
  })

  it('一份檔案裡的多首曲子', () => {
    const book = parseAbcBook(`${HEADER}T:一\nC\n\n說明文字\n${HEADER}T:二\nD\n`)
    expect(book.map((t) => t.title)).toEqual(['一', '二'])
  })
})

describe('配樂曲目', () => {
  it('城鎮、探索、戰鬥三首都在', () => {
    expect(TRACKS.map((t) => t.id)).toEqual(['town', 'explore', 'battle'])
  })

  for (const track of TRACKS) {
    describe(track.label, () => {
      const tune = parseAbc(track.abc)

      it('最多 4 個聲部，旋律在第 1 聲部，每個聲部都有音符', () => {
        expect(tune.voices.length).toBeGreaterThan(0)
        expect(tune.voices.length).toBeLessThanOrEqual(4)
        expect(tune.voices[0]!.name).toBe('旋律')
        for (const v of tune.voices) expect(v.notes.length, v.name).toBeGreaterThan(0)
      })

      it('各聲部長度一致 —— 否則循環會錯位', () => {
        for (const v of tune.voices) expect(v.length, v.name).toBeCloseTo(tune.length, 6)
      })

      it('用到的樂器都有對應的音色', () => {
        for (const v of tune.voices) {
          expect(instrumentInfo(v.program).known, `${v.name} 的音色 ${v.program}`).toBe(true)
        }
      })

      it('音符加上餘音不超過取樣長度 —— 否則尾巴會被切掉', () => {
        for (const v of tune.voices) {
          const longest = Math.max(...v.notes.map((n) => n.duration))
          expect(longest + instrumentInfo(v.program).release, v.name).toBeLessThanOrEqual(
            SAMPLE_SECONDS,
          )
        }
      })

      it('低於 D3 的音只交給一個聲部 —— 兩個樂器搶低音會糊', () => {
        const low = tune.voices.filter((v) => v.notes.some((n) => n.midi.some((m) => m < 50)))
        expect(low.map((v) => v.name).length).toBeLessThanOrEqual(1)
      })
    })
  }

  it('長度符合規劃：城鎮約 36 秒、探索約 63 秒、戰鬥約 29 秒', () => {
    const len = (id: string) => parseAbc(TRACKS.find((t) => t.id === id)!.abc).length
    expect(len('town')).toBeCloseTo(16 * 3 * (60 / 80), 6)
    expect(len('explore')).toBeCloseTo(24 * 4 * (60 / 92), 6)
    expect(len('battle')).toBeCloseTo(16 * 4 * (60 / 132), 6)
  })

  it('三首合計最多 10 種樂器，控制下載量', () => {
    const programs = new Set(TRACKS.flatMap((t) => parseAbc(t.abc).voices.map((v) => v.program)))
    expect(programs.size).toBeLessThanOrEqual(10)
  })
})
