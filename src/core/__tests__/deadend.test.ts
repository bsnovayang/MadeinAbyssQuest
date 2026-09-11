import { describe, expect, it } from 'vitest'
import { AFFLICTIONS } from '../affliction'
import {
  adjustLoadout,
  advanceDays,
  availableMembers,
  canSpend,
  clampLoadoutToFunds,
  createMeta,
  cureAffliction,
  departCost,
  hire,
  hireCost,
  identifyCost,
  identifyRelic,
  refreshApplicants,
  replenish,
  sellRelic,
  setDepartDepth,
  spendingFloor,
  type MetaState,
} from '../meta'
import { nextInt } from '../rng'
import type { SupplyKey } from '../types'
import { BASES } from '../../data/bases'
import { RELIC_DEFS } from '../../data/relics'

const CURABLE = AFFLICTIONS.filter((a) => a.cureCost > 0).map((a) => a.id)
const KEYS: SupplyKey[] = ['food', 'water', 'rope', 'medicine']

/** 出得了門：有人能去、付得起目前的補給單，而且至少付得起最低配給 */
function expectCanDepart(meta: MetaState, context: string): void {
  expect(availableMembers(meta).length, context).toBeGreaterThan(0)
  expect(departCost(meta), context).toBeLessThanOrEqual(meta.funds)
  expect(meta.funds, context).toBeGreaterThanOrEqual(spendingFloor())
}

function freshTown(): MetaState {
  const meta = createMeta()
  replenish(meta)
  refreshApplicants(meta)
  return meta
}

const cheapest = (meta: MetaState) => [...meta.applicants].sort((a, b) => hireCost(a) - hireCost(b))[0]

describe('城裡不會走進出不了門的死路', () => {
  it('一開始就把錢花在雇人上，還是出得了門', () => {
    const meta = freshTown()
    let hired = 0
    for (let i = 0; i < 20; i++) {
      const target = cheapest(meta)
      if (!target || !hire(meta, target.id)) break
      hired++
    }

    expect(hired).toBeGreaterThan(0)
    expectCanDepart(meta, `雇了 ${hired} 個人之後`)
  })

  it('錢夠付、但付了就買不起最低補給時，不給雇', () => {
    const meta = freshTown()
    const target = meta.applicants[0]!
    meta.funds = hireCost(target) + spendingFloor() - 1

    expect(meta.funds).toBeGreaterThanOrEqual(hireCost(target))
    expect(canSpend(meta, hireCost(target))).toBe(false)
    expect(hire(meta, target.id)).toBeNull()
  })

  it('鑑定與治療也不能把出發的錢花掉', () => {
    const meta = freshTown()
    meta.vault.push({
      id: 'v1',
      name: '沉甸甸的金屬片',
      weight: 3,
      kind: 'relic',
      value: 1000,
      identified: false,
      relicId: RELIC_DEFS[0]!.id,
    })
    const member = meta.roster[0]!
    const afflictionId = CURABLE[0]!
    member.afflictions.push(afflictionId)

    meta.funds = spendingFloor() + 10
    expect(identifyRelic(meta, 'v1')).toBe(false)
    expect(cureAffliction(meta, member.id, afflictionId)).toBe(false)

    const cureCost = AFFLICTIONS.find((a) => a.id === afflictionId)!.cureCost
    meta.funds = spendingFloor() + identifyCost(meta.vault[0]!) + cureCost
    expect(identifyRelic(meta, 'v1')).toBe(true)
    expect(cureAffliction(meta, member.id, afflictionId)).toBe(true)
    expectCanDepart(meta, '鑑定並治療之後')
  })

  it('花了錢，補給單自動調降到付得起 —— 不必自己按幾十次減號', () => {
    const meta = freshTown()
    const target = cheapest(meta)!
    meta.funds = hireCost(target) + spendingFloor() + 50

    expect(hire(meta, target.id)).not.toBeNull()
    expect(departCost(meta)).toBeLessThanOrEqual(meta.funds)
  })

  it('隨機亂花錢幾百次，每一步都還出得了門', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let rng = seed * 7919
      const roll = (min: number, max: number) => {
        const [v, s] = nextInt(rng, min, max)
        rng = s
        return v
      }
      const pickFrom = <T>(list: readonly T[]): T | undefined =>
        list.length ? list[roll(0, list.length - 1)] : undefined

      const meta = createMeta(seed)
      meta.funds = roll(0, 3000)
      meta.bases = BASES.map((b) => b.layer)
      for (let i = 0; i < 4; i++) {
        meta.vault.push({
          id: `v${i}`,
          name: `遺物${i}`,
          weight: 3,
          kind: 'relic',
          value: roll(200, 2000),
          identified: false,
          relicId: pickFrom(RELIC_DEFS)!.id,
        })
      }
      for (const c of meta.roster) {
        if (roll(0, 1)) c.afflictions.push(pickFrom(CURABLE)!)
      }
      replenish(meta)
      refreshApplicants(meta)
      expectCanDepart(meta, `seed ${seed} 開局`)

      for (let step = 0; step < 300; step++) {
        let label = ''
        switch (roll(0, 7)) {
          case 0: {
            const target = pickFrom(meta.applicants)
            if (target) hire(meta, target.id)
            label = '雇人'
            break
          }
          case 1: {
            const item = pickFrom(meta.vault)
            if (item) identifyRelic(meta, item.id)
            label = '鑑定'
            break
          }
          case 2: {
            const member = pickFrom(meta.roster)
            const affliction = member?.afflictions[0]
            if (member && affliction) cureAffliction(meta, member.id, affliction)
            label = '治療'
            break
          }
          case 3:
          case 4:
            adjustLoadout(meta, pickFrom(KEYS)!, roll(0, 1) ? 1 : -1)
            label = '調整補給'
            break
          case 5:
            // 和畫面上一樣：換出發點之後把補給單調降到付得起
            setDepartDepth(meta, pickFrom([0, ...BASES.map((b) => b.depth)])!)
            clampLoadoutToFunds(meta)
            label = '選出發點'
            break
          case 6:
            advanceDays(meta, 1)
            label = '休養'
            break
          case 7: {
            const item = meta.vault[0]
            if (item && roll(0, 4) === 0) sellRelic(meta, item.id)
            label = '變賣'
            break
          }
        }
        expectCanDepart(meta, `seed ${seed} 第 ${step} 步（${label}）`)
      }
    }
  })
})
