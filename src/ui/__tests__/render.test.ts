import { describe, expect, it } from 'vitest'
import { beginAscent, createRun, moveTo } from '../../core/run'
import type { HpDeltas } from '../render'
import { render } from '../render'
import type { PanelState } from '../panels'

/** 面板預設收合，測試需要看內容就全部展開 */
const allOpen = (): PanelState => ({
  explicit: { relics: true, party: true, supply: true, quests: true, notes: true },
})

const ui = (deltas: HpDeltas = {}) => ({ deltas, muted: false, panels: allOpen() })

describe('render', () => {
  it('起始畫面包含深度計、隊伍與抉擇', () => {
    const s = createRun('render')
    const html = render(s, ui())
    expect(html).toContain('depth-bar__depth')
    expect(html).toContain('莉可')
    expect(html).toContain('class="choice"')
    expect(html).toContain('探窟筆記')
    expect(html).toContain('開始撤離')
  })

  it('HP 變化以手寫修正呈現，而非飄字', () => {
    const s = createRun('delta')
    const riko = s.party[0]!
    riko.hp = 14
    const html = render(s, ui({ [riko.id]: 8 }))
    expect(html).toContain('<s>22</s>')
    expect(html).toContain('>14</span>')
  })

  it('死亡的隊員被劃掉', () => {
    const s = createRun('death')
    const tobi = s.party[3]!
    tobi.hp = 0
    tobi.status = 'dead'
    expect(render(s, ui())).toContain('member--gone')
  })

  it('撤離時顯示耐受度與預兆', () => {
    const s = createRun('ascent')
    s.depth = 8000
    s.maxDepthReached = 8000
    beginAscent(s)
    const tobi = s.party[3]!
    tobi.tolerance = 1

    const html = render(s, ui())
    expect(html).toContain('歸途')
    expect(html).toContain('member__fill--tol')
    expect(html).toContain('撐不住') // 預兆必須看得見
    expect(html).toContain('/步') // 每步的代價也要看得見
  })

  it('行李裡看得到戰利品值多少 —— 否則沒辦法決定該丟什麼', () => {
    const s = createRun('value')
    s.carried.push({
      id: 'l1',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 250,
      identified: true,
    })
    const html = render(s, ui())
    expect(html).toContain('獸骨結晶')
    expect(html).toContain('帶回地表可換 250')
  })

  it('持有脫離型遺物時顯示效果與代價', () => {
    const s = createRun('relic')
    s.carried.push({
      id: 'r1',
      name: '不動之楔',
      weight: 6,
      kind: 'relic',
      value: 900,
      identified: true,
      relicId: 'immovable-wedge',
    })
    const html = render(s, ui())
    expect(html).toContain('不動之楔')
    // 只寫代價不寫效果，等於叫玩家別按
    expect(html).toContain('全隊立即返回地表')
    expect(html).toContain('隨機一名隊友被留在原地')
  })

  it('持有常駐型遺物時說明怎麼用', () => {
    const s = createRun('ward-usage')
    s.carried.push({
      id: 'w1',
      name: '避咒之籠',
      weight: 5,
      kind: 'relic',
      value: 1200,
      identified: true,
      relicId: 'ward-basket',
    })
    const html = render(s, ui())
    expect(html).toContain('撤離時在隊伍面板指定承受的人')
  })

  it('回到地表時結算帶回的價值與名字', () => {
    const s = createRun('surfaced')
    s.over = true
    s.endReason = 'surfaced'
    s.maxDepthReached = 3400
    s.party[3]!.status = 'lost'
    s.carried.push({
      id: 'l1',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 250,
      identified: true,
    })

    const html = render(s, ui())
    expect(html).toContain('回到了奧斯城')
    expect(html).toContain('3,400m')
    expect(html).toContain('250')
    expect(html).toContain('沒有回來：托比')
  })

  it('全滅時不顯示戰利品價值', () => {
    const s = createRun('wiped')
    s.over = true
    s.endReason = 'wiped'
    expect(render(s, ui())).toContain('探索結束')
  })

  it('嚴重超重時抉擇按鈕停用', () => {
    const s = createRun('blocked')
    s.carried.push({
      id: 'anvil',
      name: '不可能的重物',
      weight: 999,
      kind: 'loot',
      value: 0,
      identified: true,
    })
    expect(render(s, ui())).toContain('disabled')
  })

  it('多步下潛後仍可正常渲染', () => {
    const s = createRun('walk')
    for (let i = 0; i < 15 && !s.over && s.choices[0]; i++) {
      moveTo(s, s.choices[0].id)
    }
    expect(() => render(s, ui())).not.toThrow()
  })
})
