import { describe, expect, it } from 'vitest'
import { distributeBurden } from '../curse'
import { retreat } from '../depth'
import {
  aliveMembers,
  autoResolveBattle,
  beginAscent,
  camp,
  createRun,
  escapeRelics,
  moveTo,
  resumeDescent,
  totalValue,
  useEscapeRelic,
  useMedicine,
} from '../run'
import type { Item, RunState } from '../types'

function relic(id: string, relicId: string, weight = 5): Item {
  return { id, name: relicId, weight, kind: 'relic', value: 100, identified: true, relicId }
}

/** 挑一個不會打起來的節點，免得戰鬥干擾對耐受度的斷言 */
function peaceful(s: RunState): string {
  return (s.choices.find((n) => n.kind !== 'encounter') ?? s.choices[0]!).id
}

/** 直接把隊伍放到指定深度，省去一路下潛 */
function planted(seed: string, depth: number): RunState {
  const s = createRun(seed)
  s.depth = depth
  s.maxDepthReached = depth
  return s
}

describe('retreat', () => {
  it('上升一定往上，且不會卡在層邊界', () => {
    let d = 9000
    for (let i = 0; i < 60; i++) {
      const next = retreat(d)
      expect(next).toBeLessThan(d)
      d = next
      if (d === 0) break
    }
    expect(d).toBe(0)
  })
})

describe('ascent', () => {
  it('往下不扣耐受度，往上才扣', () => {
    const s = planted('curse-direction', 3000)
    const before = s.party.map((c) => c.tolerance)
    moveTo(s, peaceful(s))
    expect(s.party.map((c) => c.tolerance)).toEqual(before)

    beginAscent(s)
    moveTo(s, peaceful(s))
    autoResolveBattle(s)
    const riko = s.party.find((c) => c.id === 'riko')!
    expect(riko.tolerance).toBeLessThan(before[0]!)
  })

  it('雷格上升時毫髮無傷', () => {
    const s = planted('reg-immune', 8000)
    beginAscent(s)
    const reg = s.party.find((c) => c.id === 'reg')!
    for (let i = 0; i < 5 && !s.over && s.choices[0]; i++) {
      moveTo(s, s.choices[0].id)
      autoResolveBattle(s)
    }
    expect(reg.tolerance).toBe(reg.maxTolerance)
  })

  it('一路往上會回到地表', () => {
    const s = planted('surface', 900)
    // 補給本身有重量，堆太多會直接動彈不得
    s.supplies.water = 20
    s.supplies.food = 10
    beginAscent(s)
    let guard = 0
    while (!s.over && s.choices[0] && guard++ < 40) {
      moveTo(s, s.choices[0].id)
      autoResolveBattle(s)
    }
    expect(s.endReason).toBe('surfaced')
    expect(s.depth).toBe(0)
  })

  it('撤離途中可以反悔往下，已受的傷不會消失', () => {
    const s = planted('regret', 5000)
    beginAscent(s)
    moveTo(s, peaceful(s))
    autoResolveBattle(s)
    const riko = s.party.find((c) => c.id === 'riko')!
    const hurt = riko.tolerance
    expect(hurt).toBeLessThan(riko.maxTolerance)

    resumeDescent(s)
    expect(s.direction).toBe('down')
    moveTo(s, peaceful(s))
    expect(s.party.find((c) => c.id === 'riko')!.tolerance).toBe(hurt)
  })

  it('深處的負荷遠比淺處沉重', () => {
    const shallow = planted('shallow', 1000)
    const deep = planted('deep', 12500)
    for (const s of [shallow, deep]) {
      beginAscent(s)
      moveTo(s, peaceful(s))
      autoResolveBattle(s)
    }
    const shallowLoss = 10 - shallow.party.find((c) => c.id === 'riko')!.tolerance
    const deepLoss = 10 - deep.party.find((c) => c.id === 'riko')!.tolerance
    expect(deepLoss).toBeGreaterThan(shallowLoss)
  })

  /**
   * 沒有這條規則，玩家可以一路紮營把負荷睡掉，
   * 實測會讓五層的生還率從 41% 暴增到 78%。
   */
  it('歸途紮營只能養傷，治不好上升負荷', () => {
    const s = planted('camp-ascent', 5000)
    s.current = { id: 'r', kind: 'rest', depth: 5000, label: '營地' }
    beginAscent(s)
    s.current = { id: 'r', kind: 'rest', depth: 5000, label: '營地' }

    const riko = s.party.find((c) => c.id === 'riko')!
    riko.hp = 5
    riko.tolerance = 4

    camp(s)
    expect(riko.hp).toBeGreaterThan(5) // 傷有好
    expect(riko.tolerance).toBe(4) // 但那份沉重還在
  })

  it('往下的時候紮營仍然恢復耐受度', () => {
    const s = planted('camp-descent', 5000)
    s.current = { id: 'r', kind: 'rest', depth: 5000, label: '營地' }
    const riko = s.party.find((c) => c.id === 'riko')!
    riko.tolerance = 4

    camp(s)
    expect(riko.tolerance).toBeGreaterThan(4)
  })

  it('藥品可以恢復耐受度', () => {
    const s = planted('medicine', 5000)
    const tobi = s.party.find((c) => c.id === 'tobi')!
    tobi.tolerance = 1
    const before = s.supplies.medicine
    useMedicine(s, 'tobi')
    expect(tobi.tolerance).toBeGreaterThan(1)
    expect(s.supplies.medicine).toBe(before - 1)
  })
})

describe('escape relics', () => {
  it('不動之楔讓全隊回到地表，但留下一個人', () => {
    const s = planted('wedge', 11000)
    s.carried.push(relic('r1', 'immovable-wedge'))
    expect(escapeRelics(s)).toHaveLength(1)

    useEscapeRelic(s, 'r1')
    expect(s.endReason).toBe('surfaced')
    expect(s.party.filter((c) => c.status === 'lost')).toHaveLength(1)
    expect(aliveMembers(s)).toHaveLength(3)
  })

  it('火葬布燒掉所有戰利品', () => {
    const s = planted('pyre', 9000)
    s.carried.push(relic('r2', 'pyre-cloth', 3))
    s.carried.push({
      id: 'loot1',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 500,
      identified: true,
    })

    useEscapeRelic(s, 'r2')
    expect(s.endReason).toBe('surfaced')
    expect(s.carried).toHaveLength(0)
    expect(totalValue(s)).toBe(0)
  })

  it('籠子被燒掉之後，負荷轉嫁立刻失效', () => {
    const s = planted('ward-burned', 9000)
    s.carried.push(relic('r-ward', 'ward-basket'))
    s.carried.push(relic('r-pyre', 'pyre-cloth', 3))
    s.burden = { mode: 'ward', targetId: 'tobi' }
    expect(distributeBurden(s)['riko']).toBe(0)

    s.carried = s.carried.filter((i) => i.relicId !== 'ward-basket')
    expect(distributeBurden(s)['riko']).toBeGreaterThan(0)
  })

  it('避咒之籠不是脫離用的遺物', () => {
    const s = planted('ward-not-escape', 5000)
    s.carried.push(relic('r3', 'ward-basket'))
    expect(escapeRelics(s)).toHaveLength(0)
    useEscapeRelic(s, 'r3')
    expect(s.over).toBe(false)
  })
})
