import { describe, expect, it } from 'vitest'
import { createRun, descendTo } from '../../core/run'
import { render } from '../render'

describe('render', () => {
  it('起始畫面包含深度計、隊伍與抉擇', () => {
    const s = createRun('render')
    const html = render(s, {})
    expect(html).toContain('depth-bar__depth')
    expect(html).toContain('莉可')
    expect(html).toContain('class="choice"')
    expect(html).toContain('探窟筆記')
  })

  it('HP 變化以手寫修正呈現，而非飄字', () => {
    const s = createRun('delta')
    const riko = s.party[0]!
    riko.hp = 14
    const html = render(s, { [riko.id]: 8 })
    expect(html).toContain('<s>22</s>')
    expect(html).toContain('class="changed">14</span>')
  })

  it('死亡的隊員被劃掉', () => {
    const s = createRun('death')
    const tobi = s.party[3]!
    tobi.hp = 0
    tobi.status = 'dead'
    expect(render(s, {})).toContain('member--dead')
  })

  it('結束後顯示最深抵達深度並提供重來', () => {
    const s = createRun('over')
    s.over = true
    s.maxDepthReached = 3400
    const html = render(s, {})
    expect(html).toContain('探索結束')
    expect(html).toContain('3,400m')
    expect(html).toContain('data-restart')
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
    expect(render(s, {})).toContain('disabled')
  })

  it('多步下潛後仍可正常渲染', () => {
    const s = createRun('walk')
    for (let i = 0; i < 15 && !s.over && s.choices[0]; i++) {
      descendTo(s, s.choices[0].id)
    }
    expect(() => render(s, {})).not.toThrow()
  })
})
