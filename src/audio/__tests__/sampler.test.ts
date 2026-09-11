import { describe, expect, it } from 'vitest'
import { parseAbc } from '../abc'
import { instrumentInfo, noteName } from '../sampler'
import { BUNDLED_NOTES } from '../soundfont-manifest'
import { TRACKS } from '../tracks'

describe('遊戲內的瘦身音色', () => {
  it('配樂用到的每個音都有打包 —— 改過譜忘了重跑 npm run soundfonts 會在這裡抓到', () => {
    for (const track of TRACKS) {
      for (const voice of parseAbc(track.abc).voices) {
        const { file } = instrumentInfo(voice.program)
        const bundled = BUNDLED_NOTES[file]
        expect(bundled, `${track.label}・${voice.name} 的樂器 ${file} 沒有打包`).toBeDefined()
        for (const note of voice.notes) {
          for (const midi of note.midi) {
            expect(bundled, `${track.label}・${voice.name}`).toContain(noteName(midi))
          }
        }
      }
    }
  })
})

describe('取樣音色', () => {
  it('MIDI 編號換算成音色檔的音名（一律用降記號）', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(61)).toBe('Db4')
    expect(noteName(70)).toBe('Bb4')
    expect(noteName(21)).toBe('A0')
    expect(noteName(108)).toBe('C8')
  })

  it('實驗曲用到的樂器都有對應', () => {
    for (const program of [0, 44, 45, 48, 52, 73]) expect(instrumentInfo(program).known).toBe(true)
  })

  it('起音依樂器而定：弦樂、合唱慢，撥弦快', () => {
    expect(instrumentInfo(48).attack).toBeGreaterThan(instrumentInfo(46).attack)
    expect(instrumentInfo(52).attack).toBeGreaterThan(instrumentInfo(46).attack)
    expect(instrumentInfo(45).attack).toBeLessThan(0.012)
  })

  it('低音樂器送進殘響的比例較少', () => {
    expect(instrumentInfo(42).reverb).toBeLessThan(instrumentInfo(73).reverb)
  })

  it('沒特別設定的樂器用預設包絡', () => {
    expect(instrumentInfo(46)).toMatchObject({ attack: 0.012, release: 0.35, reverb: 1 })
  })

  it('沒對應的音色暫用鋼琴，並說明原因', () => {
    const info = instrumentInfo(999)
    expect(info.known).toBe(false)
    expect(info.file).toBe('acoustic_grand_piano')
  })
})
