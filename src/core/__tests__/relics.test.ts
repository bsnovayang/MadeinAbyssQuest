import { describe, expect, it } from 'vitest'
import { distributeBurden } from '../curse'
import { concludeRun, createMeta, deployParty, type MetaState } from '../meta'
import {
  camp,
  campFoodCost,
  capacityOfRun,
  createRun,
  useEscapeRelic,
} from '../run'
import { runBehaviors } from '../traits'
import type { Item, RunState } from '../types'
import { ESCAPE_RELICS, PASSIVE_RELICS, RELIC_DEFS, relicById } from '../../data/relics'

const IDS = ['riko', 'reg', 'urna', 'tobi']

function relic(relicId: string, identified = true): Item {
  const def = relicById(relicId)!
  return {
    id: `x-${relicId}`,
    name: identified ? def.name : def.appearance,
    weight: def.weight,
    kind: 'relic',
    value: def.value,
    identified,
    relicId,
  }
}

function run(seed: string, depth = 9000, carried: Item[] = []): RunState {
  const s = createRun(seed, { party: deployParty(createMeta(), IDS), carried })
  s.depth = depth
  s.maxDepthReached = depth
  return s
}

describe('遺物資料', () => {
  it('數量足以支撐內容量', () => {
    expect(RELIC_DEFS.length).toBeGreaterThanOrEqual(20)
    expect(ESCAPE_RELICS.length).toBeGreaterThanOrEqual(8)
    expect(PASSIVE_RELICS.length).toBeGreaterThanOrEqual(8)
  })

  it('每一件都有外觀、效果與代價，id 不重複', () => {
    const ids = new Set<string>()
    for (const def of RELIC_DEFS) {
      expect(def.appearance.length).toBeGreaterThan(0)
      expect(def.effect.length).toBeGreaterThan(0)
      expect(def.cost.length).toBeGreaterThan(0)
      expect(ids.has(def.id), `重複的 id：${def.id}`).toBe(false)
      ids.add(def.id)
    }
  })

  it('每個脫離型都有真的代價 —— 沒有免費的回家路', () => {
    for (const def of ESCAPE_RELICS) {
      expect(def.escapeCost, `${def.name} 沒有代價`).toBeDefined()
      expect(def.escapeCost?.kind).not.toBe('none')
    }
  })

  it('每個常駐型都有壞處 —— 好處與壞處寫在同一個地方', () => {
    for (const def of PASSIVE_RELICS) {
      if (def.id === 'ward-basket') continue // 它的代價是敘事性的
      const p = def.passive ?? {}
      const bad =
        (p.carry ?? 0) < 0 ||
        (p.forage ?? 0) < 0 ||
        (p.camp ?? 0) < 0 ||
        (p.appetite ?? 0) > 0 ||
        (p.curseBurden ?? 0) > 0 ||
        (p.phantom ?? 0) > 0 ||
        def.weight >= 8
      expect(bad, `${def.name} 只有好處`).toBe(true)
    }
  })
})

describe('脫離代價', () => {
  it('選別之秤帶走最虛弱的那個人', () => {
    const s = run('scale', 9000, [relic('weakest-link')])
    const tobi = s.party.find((c) => c.id === 'tobi')!
    tobi.hp = 1

    useEscapeRelic(s, 'x-weakest-link')
    expect(s.endReason).toBe('surfaced')
    expect(tobi.status).toBe('lost')
  })

  it('仿製的白笛只碎遺物，不碰戰利品', () => {
    const s = run('whistle', 9000, [relic('hollow-whistle'), relic('star-compass')])
    s.carried.push({
      id: 'loot',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 400,
      identified: true,
    })

    useEscapeRelic(s, 'x-hollow-whistle')
    expect(s.carried.some((i) => i.kind === 'relic')).toBe(false)
    expect(s.carried.some((i) => i.kind === 'loot')).toBe(true)
  })

  it('千人楔什麼都不留', () => {
    const s = run('thousand', 9000, [relic('thousand-wedge')])
    s.carried.push({
      id: 'loot',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 400,
      identified: true,
    })

    useEscapeRelic(s, 'x-thousand-wedge')
    expect(s.carried).toHaveLength(0)
  })

  it('原初印章讓外界流逝十年，回城才結算', () => {
    const meta = createMeta()
    const s = createRun('seal', { party: deployParty(meta, IDS), carried: [relic('primal-seal')] })
    s.depth = 9000
    s.maxDepthReached = 9000

    useEscapeRelic(s, 'x-primal-seal')
    expect(s.aftermath.some((a) => a.kind === 'days')).toBe(true)

    const day = meta.day
    const summary = concludeRun(meta, s)
    expect(meta.day).toBeGreaterThan(day + 3000)
    expect(summary.aftermath.join()).toContain('年')
  })

  it('負債之鈴把資金掏空', () => {
    const meta = createMeta()
    meta.funds = 5000
    const s = createRun('bell', { party: deployParty(meta, IDS), carried: [relic('debt-bell')] })
    s.depth = 9000
    s.maxDepthReached = 9000

    useEscapeRelic(s, 'x-debt-bell')
    concludeRun(meta, s)
    expect(meta.funds).toBeLessThan(500)
  })

  it('逆吊之陽讓每一個人都留下永久損傷', () => {
    const meta = createMeta()
    const s = createRun('sun', { party: deployParty(meta, IDS), carried: [relic('inverted-sun')] })
    s.depth = 9000
    s.maxDepthReached = 9000

    useEscapeRelic(s, 'x-inverted-sun')
    const summary = concludeRun(meta, s)
    expect(summary.newAfflictions.length).toBeGreaterThanOrEqual(3)
  })

  it('靜止之匣讓這一趟的委託全部交不了差', () => {
    const meta = createMeta()
    const quest = meta.quests[0]!
    quest.kind = 'reach'
    quest.minDepth = 100
    quest.state = 'taken'

    const s = createRun('box', { party: deployParty(meta, IDS), carried: [relic('stillbox')] })
    s.depth = 9000
    s.maxDepthReached = 9000

    useEscapeRelic(s, 'x-stillbox')
    const summary = concludeRun(meta, s)
    expect(summary.questsDone).toHaveLength(0)
    expect(summary.questsFailed).toHaveLength(1)
  })
})

describe('常駐效果', () => {
  it('未鑑定的遺物不生效 —— 你不知道那是什麼，就只是背著一塊金屬', () => {
    // 烏爾娜自己就有測繪，會蓋掉遺物的效果，所以這一組不帶她
    const party = () => deployParty(createMeta(), ['riko', 'tobi'])

    const unknown = createRun('unknown', {
      party: party(),
      carried: [relic('star-compass', false)],
    })
    expect(runBehaviors(unknown.party, unknown.carried).survey).toBe(false)

    const known = createRun('known', { party: party(), carried: [relic('star-compass')] })
    expect(runBehaviors(known.party, known.carried).survey).toBe(true)
  })

  it('千手提升負重，但每一步的負荷更重', () => {
    const plain = run('plain', 5000)
    const withRelic = run('hands', 5000, [relic('thousand-hands')])
    withRelic.direction = 'up'
    plain.direction = 'up'

    expect(capacityOfRun(withRelic)).toBeGreaterThan(capacityOfRun(plain))
    expect(distributeBurden(withRelic)['riko']!).toBeGreaterThan(
      distributeBurden(plain)['riko']!,
    )
  })

  it('靜謐之鐘減輕負荷，但比較難找到東西', () => {
    const s = run('bell2', 5000, [relic('quiet-bell')])
    s.direction = 'up'
    const plain = run('plain2', 5000)
    plain.direction = 'up'

    expect(distributeBurden(s)['riko']!).toBeLessThan(distributeBurden(plain)['riko']!)
    expect(runBehaviors(s.party, s.carried).forage).toBeLessThan(
      runBehaviors(plain.party, plain.carried).forage,
    )
  })

  it('火葉之器讓紮營更有效，但更耗食物', () => {
    const s = run('ember', 3000, [relic('ember-vessel')])
    s.current = { id: 'r', kind: 'rest', depth: 3000, label: '營地' }
    expect(campFoodCost(s)).toBeGreaterThan(1)

    const riko = s.party.find((c) => c.id === 'riko')!
    riko.tolerance = 2
    camp(s)
    expect(riko.tolerance).toBeGreaterThan(2 + 4)
  })

  it('空之瓶採集更多，但吃掉背包空間', () => {
    const plain = run('p3', 3000)
    const s = run('flask', 3000, [relic('empty-flask')])
    expect(runBehaviors(s.party, s.carried).forage).toBeGreaterThan(0)
    expect(capacityOfRun(s)).toBeLessThan(capacityOfRun(plain))
  })

  it('未鑑定的籠子不能拿來轉嫁負荷', () => {
    const meta: MetaState = createMeta()
    const s = createRun('cage', {
      party: deployParty(meta, IDS),
      carried: [relic('ward-basket', false)],
    })
    s.depth = 5000
    s.maxDepthReached = 5000
    s.direction = 'up'
    s.burden = { mode: 'ward', targetId: 'tobi' }

    // 籠子沒鑑定 → 退回平均分攤
    expect(distributeBurden(s)['riko']!).toBeGreaterThan(0)
  })
})
