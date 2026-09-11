import { describe, expect, it } from 'vitest'
import { effectiveStats } from '../affliction'
import { distributeBurden } from '../curse'
import { createMeta, deployParty, recruit } from '../meta'
import { camp, campFoodCost, createRun } from '../run'
import {
  COMMON_TRAITS,
  partyBehaviors,
  TRAITS,
  traitById,
  traitEffectText,
  traitTone,
} from '../traits'
import type { Character } from '../types'

function member(traits: string[], over: Partial<Character> = {}): Character {
  return {
    id: 'x',
    name: 'x',
    bio: '',
    hp: 20,
    maxHp: 20,
    tolerance: 10,
    maxTolerance: 10,
    carryCapacity: 20,
    immuneToCurse: false,
    status: 'alive',
    afflictions: [],
    traits,
    bonds: {},
    ...over,
  }
}

describe('特質的能力值修正', () => {
  it('好特質加、壞特質減', () => {
    expect(effectiveStats(member(['sturdy'])).carryCapacity).toBe(24)
    expect(effectiveStats(member(['clumsy'])).carryCapacity).toBe(16)
    expect(effectiveStats(member(['stubborn'])).maxTolerance).toBe(13)
    expect(effectiveStats(member(['afraid-dark'])).maxTolerance).toBe(7)
  })

  it('特質與永久損傷會一起結算', () => {
    const c = member(['stubborn'], { afflictions: ['grief', 'grief'] })
    // +3 −2 −2
    expect(effectiveStats(c).maxTolerance).toBe(9)
  })
})

describe('隊伍層級的行為', () => {
  it('好處取隊伍中的最佳值，不會疊加', () => {
    const b = partyBehaviors([member(['curse-ward']), member(['curse-ward'], { id: 'y' })])
    expect(b.curseResist).toBe(1)
  })

  it('壞處會累加 —— 三個食量大的孩子確實吃得比較多', () => {
    const b = partyBehaviors([
      member(['big-eater']),
      member(['big-eater'], { id: 'y' }),
      member(['big-eater'], { id: 'z' }),
    ])
    expect(b.appetite).toBe(3)
  })

  it('死掉的人不再提供能力', () => {
    const b = partyBehaviors([member(['survey'], { status: 'dead' })])
    expect(b.survey).toBe(false)
  })
})

describe('特質接進既有系統', () => {
  it('詛咒緩和讓每一步都輕一點，但不會歸零', () => {
    const plain = createRun('t1', { party: [member([])] })
    plain.depth = 3000
    plain.maxDepthReached = 3000
    const base = distributeBurden(plain)['x']!

    const helped = createRun('t2', { party: [member(['curse-ward'])] })
    helped.depth = 3000
    helped.maxDepthReached = 3000
    expect(distributeBurden(helped)['x']!).toBe(base - 1)

    // 一層的代價本來就是 1，減免後仍然要付
    helped.depth = 500
    expect(distributeBurden(helped)['x']!).toBe(1)
  })

  it('食量大讓紮營更貴', () => {
    const run = createRun('t3', { party: [member(['big-eater'])] })
    expect(campFoodCost(run)).toBe(2)
  })

  it('會做飯的人讓紮營恢復更多耐受度', () => {
    const build = (traits: string[]) => {
      const run = createRun('t4', { party: [member(traits, { tolerance: 1 })] })
      run.current = { id: 'r', kind: 'rest', depth: 0, label: '營地' }
      camp(run)
      return run.party[0]!.tolerance
    }
    expect(build(['cook'])).toBeGreaterThan(build([]))
  })

  it('伸縮臂讓地形障礙不消耗繩索', () => {
    const run = createRun('t5', { party: [member(['extend-arm'])] })
    run.current = { id: 'o', kind: 'obstacle', depth: 100, label: '斷崖' }
    const before = run.supplies.rope
    run.choices = [{ id: 'o2', kind: 'obstacle', depth: 200, label: '斷崖' }]
    expect(partyBehaviors(run.party).ropeless).toBe(true)
    expect(run.supplies.rope).toBe(before)
  })
})

describe('特質的說明', () => {
  it('寫出實際規則，而不是只有氛圍', () => {
    expect(traitEffectText(traitById('sturdy')!)).toBe('負重 +4')
    expect(traitEffectText(traitById('big-eater')!)).toBe('紮營多吃 1 份食物')
    expect(traitEffectText(traitById('survey')!)).toBe('看得出前方是什麼')
  })

  it('每一個特質都說得出功能 —— 沒有只剩氛圍文字的', () => {
    for (const t of TRAITS) {
      expect(traitEffectText(t).length, `${t.name} 沒有實際效果說明`).toBeGreaterThan(0)
    }
  })

  it('好壞分得出來，決定標籤顏色', () => {
    expect(traitTone(traitById('sturdy')!)).toBe('good')
    expect(traitTone(traitById('frail')!)).toBe('bad')
    expect(traitTone(traitById('apprentice')!)).toBe('bad')
  })
})

describe('孤兒院的孩子', () => {
  it('只拿得到 common 特質，永遠沒有招牌能力', () => {
    const meta = createMeta()
    for (let i = 0; i < 12; i++) recruit(meta)

    const commons = new Set(COMMON_TRAITS.map((t) => t.id))
    for (const c of meta.roster.slice(4)) {
      expect(c.traits.length).toBeGreaterThan(0)
      for (const id of c.traits) {
        expect(commons.has(id), `${c.name} 拿到了招牌能力 ${id}`).toBe(true)
        expect(traitById(id)?.signature).toBeFalsy()
      }
    }
  })

  it('主角群保有招牌能力', () => {
    const meta = createMeta()
    const party = deployParty(meta, ['riko', 'reg', 'urna', 'tobi'])
    const b = partyBehaviors(party)
    expect(b.survey).toBe(true) // 烏爾娜
    expect(b.ropeless).toBe(true) // 雷格
    expect(b.forage).toBeGreaterThan(0) // 莉可
  })
})
