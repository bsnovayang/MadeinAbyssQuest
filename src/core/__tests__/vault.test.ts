import { describe, expect, it } from 'vitest'
import {
  concludeRun,
  createMeta,
  deployParty,
  identifyCost,
  identifyRelic,
  relicsToTake,
  sellRelic,
  sellValue,
  takeDownWeight,
  toggleTakeDown,
  withdrawRelics,
  type MetaState,
} from '../meta'
import { createRun, moveTo, usableRelics, useEscapeRelic } from '../run'
import type { Item, RunState } from '../types'

const IDS = ['riko', 'reg', 'urna', 'tobi']

function unknown(id: string, relicId: string): Item {
  return {
    id,
    name: '鏽色的楔子',
    weight: 6,
    kind: 'relic',
    value: 900,
    identified: false,
    relicId,
  }
}

function surfaced(meta: MetaState, carried: Item[]): RunState {
  const run = createRun('vault', { party: deployParty(meta, IDS) })
  run.maxDepthReached = 5000
  run.depth = 0
  run.over = true
  run.endReason = 'surfaced'
  run.carried = carried
  return run
}

describe('撿到的遺物沒有標籤', () => {
  it('深淵裡撿到的一律未鑑定，而且只看得到外觀', () => {
    const run = createRun('pickup', { party: deployParty(createMeta(), IDS) })
    let guard = 0
    while (!run.over && run.choices[0] && guard++ < 80) {
      moveTo(run, run.choices[0].id)
      if (run.battle) run.battle = null
      const relic = run.carried.find((i) => i.kind === 'relic')
      if (relic) {
        expect(relic.identified).toBe(false)
        expect(['鏽色的楔子', '摺起來的布', '鳥籠狀的東西']).toContain(relic.name)
        return
      }
    }
  })

  it('未鑑定的一律列進可用清單 —— 只列脫離型等於免費幫玩家鑑定', () => {
    const run = createRun('list', { party: deployParty(createMeta(), IDS) })
    run.carried.push(unknown('u1', 'ward-basket')) // 常駐型
    expect(usableRelics(run)).toHaveLength(1)
  })

  it('用了才知道是什麼；用到常駐型就只是掛上去，不會離開深淵', () => {
    const meta = createMeta()
    const run = createRun('gamble', { party: deployParty(meta, IDS) })
    run.depth = 5000
    run.maxDepthReached = 5000
    run.carried.push(unknown('u1', 'ward-basket'))

    useEscapeRelic(run, 'u1')

    const item = run.carried.find((i) => i.id === 'u1')!
    expect(item.identified).toBe(true)
    expect(item.name).toBe('避咒之籠')
    expect(run.over).toBe(false)
    expect(run.log.some((l) => l.text.includes('原來是避咒之籠'))).toBe(true)
  })

  it('賭中脫離型就真的離開了', () => {
    const meta = createMeta()
    const run = createRun('gamble2', { party: deployParty(meta, IDS) })
    run.depth = 9000
    run.maxDepthReached = 9000
    run.carried.push(unknown('u1', 'immovable-wedge'))

    useEscapeRelic(run, 'u1')
    expect(run.endReason).toBe('surfaced')
  })
})

describe('倉庫', () => {
  it('遺物不會自動變賣，而是進倉庫', () => {
    const meta = createMeta()
    const before = meta.funds
    const summary = concludeRun(meta, surfaced(meta, [unknown('u1', 'pyre-cloth')]))

    expect(summary.earned).toBe(0) // 遺物不算在收益裡
    expect(meta.funds).toBeGreaterThanOrEqual(before)
    expect(meta.vault).toHaveLength(1)
    expect(summary.relicsKept).toContain('未鑑定的遺物')
  })

  it('戰利品照樣自動變賣', () => {
    const meta = createMeta()
    const loot: Item = {
      id: 'l1',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 400,
      identified: true,
    }
    const summary = concludeRun(meta, surfaced(meta, [loot]))
    expect(summary.earned).toBe(400)
    expect(meta.vault).toHaveLength(0)
  })

  it('全滅就什麼都沒帶回來', () => {
    const meta = createMeta()
    const run = surfaced(meta, [unknown('u1', 'pyre-cloth')])
    run.endReason = 'wiped'
    concludeRun(meta, run)
    expect(meta.vault).toHaveLength(0)
  })
})

describe('鑑定與變賣', () => {
  it('鑑定要花錢，之後看得到名字與效果', () => {
    const meta = createMeta()
    meta.vault.push(unknown('v1', 'immovable-wedge'))
    meta.funds = 9999

    const cost = identifyCost(meta.vault[0]!)
    expect(identifyRelic(meta, 'v1')).toBe(true)
    expect(meta.funds).toBe(9999 - cost)
    expect(meta.vault[0]!.identified).toBe(true)
    expect(meta.vault[0]!.name).toBe('不動之楔')
  })

  it('沒錢就鑑定不了', () => {
    const meta = createMeta()
    meta.vault.push(unknown('v1', 'immovable-wedge'))
    meta.funds = 0
    expect(identifyRelic(meta, 'v1')).toBe(false)
    expect(meta.vault[0]!.identified).toBe(false)
  })

  it('未鑑定的只值三成 —— 鑑定師的價值不只是告訴你那是什麼', () => {
    const item = unknown('v1', 'immovable-wedge')
    const raw = sellValue(item)
    item.identified = true
    expect(sellValue(item)).toBeGreaterThan(raw)
    expect(raw).toBe(Math.round(900 * 0.3))
  })

  it('變賣會換成錢並離開倉庫', () => {
    const meta = createMeta()
    meta.vault.push(unknown('v1', 'pyre-cloth'))
    const before = meta.funds

    expect(sellRelic(meta, 'v1')).toBe(true)
    expect(meta.funds).toBeGreaterThan(before)
    expect(meta.vault).toHaveLength(0)
  })
})

describe('帶下去', () => {
  it('可以指定要帶哪幾件，重量看得到', () => {
    const meta = createMeta()
    meta.vault.push(unknown('v1', 'ward-basket'))

    expect(takeDownWeight(meta)).toBe(0)
    toggleTakeDown(meta, 'v1')
    expect(relicsToTake(meta)).toHaveLength(1)
    expect(takeDownWeight(meta)).toBe(6)

    toggleTakeDown(meta, 'v1')
    expect(takeDownWeight(meta)).toBe(0)
  })

  it('出發時從倉庫搬進背包', () => {
    const meta = createMeta()
    meta.vault.push(unknown('v1', 'ward-basket'))
    toggleTakeDown(meta, 'v1')

    const taken = withdrawRelics(meta)
    expect(taken).toHaveLength(1)
    expect(meta.vault).toHaveLength(0)
    expect(meta.takeDown).toHaveLength(0)

    const run = createRun('carry', { party: deployParty(meta, IDS), carried: taken })
    expect(run.carried).toHaveLength(1)
  })

  it('死在下面就再也拿不回來', () => {
    const meta = createMeta()
    meta.vault.push(unknown('v1', 'immovable-wedge'))
    toggleTakeDown(meta, 'v1')
    const taken = withdrawRelics(meta)

    const run = surfaced(meta, taken)
    run.endReason = 'wiped'
    concludeRun(meta, run)

    expect(meta.vault).toHaveLength(0)
  })

  it('活著回來就回到倉庫', () => {
    const meta = createMeta()
    meta.vault.push(unknown('v1', 'immovable-wedge'))
    toggleTakeDown(meta, 'v1')
    const taken = withdrawRelics(meta)

    concludeRun(meta, surfaced(meta, taken))
    expect(meta.vault).toHaveLength(1)
  })
})
