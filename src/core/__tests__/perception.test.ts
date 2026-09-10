import { describe, expect, it } from 'vitest'
import { decayStage, distort, phantomChance, reliabilityAt } from '../perception'
import { createMeta, deployParty } from '../meta'
import { createRun, moveTo } from '../run'
import { render } from '../../ui/render'

const ui = { deltas: {}, muted: true }

describe('可靠度', () => {
  it('前三層完全可信 —— 沒有前面的整潔，後面的崩壞就不成立', () => {
    expect(reliabilityAt(500)).toBe(1)
    expect(reliabilityAt(2000)).toBe(1)
    expect(reliabilityAt(6000)).toBe(1)
  })

  it('四層以下逐漸不可信', () => {
    expect(reliabilityAt(8000)).toBeLessThan(1)
    expect(reliabilityAt(12500)).toBeLessThan(reliabilityAt(8000))
    expect(reliabilityAt(14000)).toBeLessThan(reliabilityAt(12500))
  })

  it('劣化階段對應層級', () => {
    expect(decayStage(500)).toBe(1)
    expect(decayStage(8000)).toBe(4)
    expect(decayStage(14000)).toBe(6)
  })

  it('幻覺條目只出現在五層以下', () => {
    expect(phantomChance(500)).toBe(0)
    expect(phantomChance(8000)).toBe(0)
    expect(phantomChance(12500)).toBeGreaterThan(0)
    expect(phantomChance(14000)).toBeGreaterThan(phantomChance(12500))
  })
})

describe('數字的謊言', () => {
  it('可信時原封不動', () => {
    expect(distort(17, 1, 'x')).toBe(17)
  })

  it('不可信時會偏掉，但幅度有限', () => {
    const shown = distort(20, 0.4, 'riko:20:12500')
    expect(shown).not.toBe(20)
    expect(Math.abs(shown - 20)).toBeLessThanOrEqual(7)
  })

  it('同樣的輸入永遠得到同樣的謊 —— 不會每次重繪都在跳', () => {
    const a = distort(20, 0.4, 'same')
    const b = distort(20, 0.4, 'same')
    expect(a).toBe(b)
  })

  it('不同的人得到不同的謊', () => {
    const values = ['riko', 'reg', 'urna', 'tobi'].map((id) => distort(20, 0.4, `${id}:20:12500`))
    expect(new Set(values).size).toBeGreaterThan(1)
  })

  it('永遠不會變成負數', () => {
    for (let i = 0; i < 50; i++) {
      expect(distort(1, 0.1, `edge-${i}`)).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('說謊的只有顯示', () => {
  it('深層畫面上的 HP 可能與真實不同，但真實狀態沒有被動過', () => {
    const meta = createMeta()
    const run = createRun('deep-lie', { party: deployParty(meta, ['riko', 'reg', 'urna', 'tobi']) })
    run.depth = 13000
    run.maxDepthReached = 13000

    const riko = run.party.find((c) => c.id === 'riko')!
    riko.hp = 17
    const html = render(run, ui)

    // 真實狀態不變
    expect(riko.hp).toBe(17)
    // 畫面上出現的是被扭曲過的數字
    const shown = distort(17, reliabilityAt(13000), `riko:17:13000`)
    expect(html).toContain(`${shown} / ${riko.maxHp}`)
  })

  it('淺層畫面上的數字與真實一致', () => {
    const meta = createMeta()
    const run = createRun('shallow-true', { party: deployParty(meta, ['riko']) })
    run.depth = 800
    const riko = run.party[0]!
    riko.hp = 13

    expect(render(run, ui)).toContain(`13 / ${riko.maxHp}`)
  })
})

describe('筆記本的幻覺條目', () => {
  it('五層以下走幾步就會出現不是自己寫的東西', () => {
    const meta = createMeta()
    const run = createRun('phantom', {
      party: deployParty(meta, ['riko', 'reg']),
      startDepth: 12500,
    })
    run.supplies = { food: 8, water: 12, rope: 4, medicine: 3 }

    let found = false
    for (let i = 0; i < 40 && !run.over && run.choices[0] && !found; i++) {
      moveTo(run, run.choices[0].id)
      if (run.battle) run.battle = null
      found = run.log.some((l) => l.text.startsWith('（'))
    }
    expect(found).toBe(true)
  })

  it('淺層永遠不會出現', () => {
    const meta = createMeta()
    const run = createRun('no-phantom', { party: deployParty(meta, ['riko', 'reg']) })

    for (let i = 0; i < 15 && !run.over && run.choices[0]; i++) {
      moveTo(run, run.choices[0].id)
      if (run.battle) run.battle = null
      if (run.depth > 2600) break
    }
    expect(run.log.some((l) => l.text.startsWith('（'))).toBe(false)
  })
})
