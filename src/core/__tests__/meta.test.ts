import { describe, expect, it } from 'vitest'
import { effectiveStats } from '../affliction'
import {
  availableMembers,
  bondBetween,
  bondBonus,
  clampLoadoutToFunds,
  concludeRun,
  createMeta,
  deployParty,
  loadoutCost,
  MINIMUM_KIT,
  recruit,
  replenish,
  ROSTER_FLOOR,
  type MetaState,
} from '../meta'
import { autoResolveBattle, CORPSE_WEIGHT, createRun, dropItem, moveTo } from '../run'
import type { Character, RunState } from '../types'

const IDS = ['riko', 'reg', 'urna', 'tobi']

function member(meta: MetaState, id: string): Character {
  const c = meta.roster.find((r) => r.id === id)
  if (!c) throw new Error(`no member ${id}`)
  return c
}

/** 做出一趟已經結束的探索 */
function finishedRun(meta: MetaState, mutate: (run: RunState) => void): RunState {
  const run = createRun('meta-test', { party: deployParty(meta, IDS), echoes: meta.lostSouls })
  run.maxDepthReached = 5000
  run.depth = 0
  run.over = true
  run.endReason = 'surfaced'
  mutate(run)
  return run
}

describe('羈絆', () => {
  it('一起活著回來，羈絆就 +1', () => {
    const meta = createMeta()
    concludeRun(meta, finishedRun(meta, () => {}))
    expect(bondBetween(member(meta, 'riko'), member(meta, 'tobi'))).toBe(1)

    concludeRun(meta, finishedRun(meta, () => {}))
    expect(bondBetween(member(meta, 'riko'), member(meta, 'tobi'))).toBe(2)
  })

  it('沒有活著回來就不算', () => {
    const meta = createMeta()
    const run = finishedRun(meta, (r) => {
      r.endReason = 'wiped'
      for (const c of r.party) c.status = 'dead'
    })
    concludeRun(meta, run)
    expect(bondBetween(member(meta, 'riko'), member(meta, 'tobi'))).toBe(0)
  })

  it('羈絆換算成耐受度，讓隊伍更撐得住', () => {
    const meta = createMeta()
    const before = deployParty(meta, IDS).find((c) => c.id === 'riko')!.maxTolerance

    for (let i = 0; i < 4; i++) concludeRun(meta, finishedRun(meta, () => {}))

    const after = deployParty(meta, IDS).find((c) => c.id === 'riko')!.maxTolerance
    expect(after).toBeGreaterThan(before)
  })

  it('羈絆加成有上限，不會無限膨脹', () => {
    const meta = createMeta()
    const riko = member(meta, 'riko')
    for (const id of IDS) if (id !== 'riko') riko.bonds[id] = 99
    expect(bondBonus(riko, meta.roster)).toBe(6)
  })
})

describe('失去', () => {
  it('關係夠深的人死了，倖存者會留下「失去」', () => {
    const meta = createMeta()
    // 先累積羈絆
    for (let i = 0; i < 2; i++) concludeRun(meta, finishedRun(meta, () => {}))

    const run = finishedRun(meta, (r) => {
      const tobi = r.party.find((c) => c.id === 'tobi')!
      tobi.status = 'dead'
      tobi.hp = 0
    })
    concludeRun(meta, run)

    expect(member(meta, 'riko').afflictions).toContain('grief')
    expect(member(meta, 'tobi').status).toBe('dead')
  })

  it('沒有交情的話不會留下痕跡', () => {
    const meta = createMeta()
    const run = finishedRun(meta, (r) => {
      const tobi = r.party.find((c) => c.id === 'tobi')!
      tobi.status = 'dead'
    })
    concludeRun(meta, run)
    expect(member(meta, 'riko').afflictions).not.toContain('grief')
  })

  it('永久損傷會壓低實際能力值', () => {
    const meta = createMeta()
    const riko = member(meta, 'riko')
    const before = effectiveStats(riko).maxTolerance
    riko.afflictions.push('grief', 'grief')
    expect(effectiveStats(riko).maxTolerance).toBeLessThan(before)
  })
})

describe('屍體處理', () => {
  it('死亡時遺體會自動進入負重', () => {
    const meta = createMeta()
    const run = createRun('corpse-weight', { party: deployParty(meta, IDS) })

    // 補給歸零 → 力竭 → 有人倒下
    run.supplies.water = 0
    run.supplies.food = 0
    for (const c of run.party) c.hp = 1

    let guard = 0
    while (!run.over && run.choices[0] && guard++ < 10) {
      moveTo(run, run.choices[0].id)
      autoResolveBattle(run)
    }

    const corpses = run.carried.filter((i) => i.kind === 'corpse')
    expect(corpses.length).toBeGreaterThan(0)
    expect(corpses[0]!.weight).toBe(CORPSE_WEIGHT)
    expect(corpses[0]!.ownerId).toBeTruthy()
  })

  it('把遺體留下，那個人就成為深淵的一部分', () => {
    const meta = createMeta()
    const run = createRun('corpse-drop', { party: deployParty(meta, IDS) })
    const tobi = run.party.find((c) => c.id === 'tobi')!
    tobi.status = 'dead'
    run.carried.push({
      id: 'corpse-tobi',
      name: '托比的遺體',
      weight: CORPSE_WEIGHT,
      kind: 'corpse',
      value: 0,
      identified: true,
      ownerId: 'tobi',
    })

    dropItem(run, 'corpse-tobi')
    expect(tobi.status).toBe('lost')
    expect(run.carried.filter((i) => i.kind === 'corpse')).toHaveLength(0)
  })

  it('帶回地表 → 安葬；留在深淵 → 成為 lost', () => {
    const buriedMeta = createMeta()
    const buried = finishedRun(buriedMeta, (r) => {
      const tobi = r.party.find((c) => c.id === 'tobi')!
      tobi.status = 'dead'
      r.carried.push({
        id: 'corpse-tobi',
        name: '托比的遺體',
        weight: CORPSE_WEIGHT,
        kind: 'corpse',
        value: 0,
        identified: true,
        ownerId: 'tobi',
      })
    })
    const buriedSummary = concludeRun(buriedMeta, buried)
    expect(buriedSummary.buried).toContain('托比')
    expect(buriedMeta.graveyard[0]?.buried).toBe(true)
    expect(buriedMeta.lostSouls).toHaveLength(0)

    const leftMeta = createMeta()
    const left = finishedRun(leftMeta, (r) => {
      const tobi = r.party.find((c) => c.id === 'tobi')!
      tobi.status = 'lost'
    })
    const leftSummary = concludeRun(leftMeta, left)
    expect(leftSummary.lost).toContain('托比')
    expect(leftMeta.lostSouls.map((s) => s.name)).toContain('托比')
  })

  it('留下的人痛得更久', () => {
    const build = (leaveBehind: boolean) => {
      const meta = createMeta()
      for (let i = 0; i < 2; i++) concludeRun(meta, finishedRun(meta, () => {}))
      const run = finishedRun(meta, (r) => {
        const tobi = r.party.find((c) => c.id === 'tobi')!
        tobi.status = leaveBehind ? 'lost' : 'dead'
        if (!leaveBehind) {
          r.carried.push({
            id: 'corpse-tobi',
            name: '托比的遺體',
            weight: CORPSE_WEIGHT,
            kind: 'corpse',
            value: 0,
            identified: true,
            ownerId: 'tobi',
          })
        }
      })
      concludeRun(meta, run)
      return member(meta, 'riko').afflictions.filter((a) => a === 'grief').length
    }

    expect(build(true)).toBeGreaterThan(build(false))
  })
})

describe('結算與招募', () => {
  it('活著回到地表才能變現', () => {
    const loot = {
      id: 'l1',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot' as const,
      value: 500,
      identified: true,
    }

    const wiped = createMeta()
    const wipedBefore = wiped.funds
    const wipedSummary = concludeRun(
      wiped,
      finishedRun(wiped, (r) => {
        r.endReason = 'wiped'
        r.carried.push(loot)
      }),
    )
    expect(wipedSummary.earned).toBe(0)
    expect(wipedSummary.refunded).toBe(0)
    expect(wiped.funds).toBe(wipedBefore)

    const meta = createMeta()
    const before = meta.funds
    const summary = concludeRun(meta, finishedRun(meta, (r) => r.carried.push(loot)))
    expect(summary.earned).toBe(500)
    expect(meta.funds).toBe(before + summary.earned + summary.refunded)
  })

  it('遺體不會被拿去賣', () => {
    const meta = createMeta()
    const summary = concludeRun(
      meta,
      finishedRun(meta, (r) => {
        const tobi = r.party.find((c) => c.id === 'tobi')!
        tobi.status = 'dead'
        r.carried.push({
          id: 'corpse-tobi',
          name: '托比的遺體',
          weight: CORPSE_WEIGHT,
          kind: 'corpse',
          value: 999,
          identified: true,
          ownerId: 'tobi',
        })
      }),
    )
    expect(summary.earned).toBe(0)
  })

  it('沒用完的補給會半價賣回，全滅則什麼都不剩', () => {
    const meta = createMeta()
    const summary = concludeRun(
      meta,
      finishedRun(meta, (r) => {
        r.supplies = { food: 4, water: 6, rope: 1, medicine: 1 }
      }),
    )
    // (4*12 + 6*8 + 1*20 + 1*45) / 2
    expect(summary.refunded).toBe(Math.floor((48 + 48 + 20 + 45) / 2))

    const wiped = createMeta()
    const wipedSummary = concludeRun(
      wiped,
      finishedRun(wiped, (r) => {
        r.endReason = 'wiped'
        r.supplies = { food: 9, water: 9, rope: 9, medicine: 9 }
      }),
    )
    expect(wipedSummary.refunded).toBe(0)
  })

  it('孤兒院永遠會給你新的孩子', () => {
    const meta = createMeta()
    for (const c of meta.roster) c.status = 'dead'

    const fresh = recruit(meta)
    expect(fresh).not.toBeNull()
    expect(fresh?.status).toBe('alive')
    expect(fresh?.afflictions).toHaveLength(0)
    expect(meta.roster.filter((c) => c.status === 'alive')).toHaveLength(1)
  })

  it('全滅之後孤兒院會免費補到可以再出發的人數', () => {
    const meta = createMeta()
    for (const c of meta.roster) c.status = 'dead'
    meta.funds = 0

    const added = replenish(meta)
    expect(added.length).toBe(ROSTER_FLOOR)
    expect(availableMembers(meta).length).toBe(ROSTER_FLOOR)
    // 孤兒院不收錢，資金只會因為組合的最低配給而上升
    expect(meta.funds).toBeGreaterThanOrEqual(0)
  })

  it('破產時組合保證最低限度的補給買得起', () => {
    const meta = createMeta()
    meta.funds = 0
    replenish(meta)

    expect(meta.funds).toBe(loadoutCost(MINIMUM_KIT))
    expect(loadoutCost(meta.loadout)).toBeLessThanOrEqual(meta.funds)
    expect(meta.loadout.water).toBeGreaterThan(0)
  })

  it('資金縮水時採購單會自動調降，不會出現買不起的死結', () => {
    const meta = createMeta()
    meta.loadout = { food: 30, water: 40, rope: 9, medicine: 9 }
    meta.funds = 300
    clampLoadoutToFunds(meta)
    expect(loadoutCost(meta.loadout)).toBeLessThanOrEqual(300)
  })

  it('有錢的時候組合不會多給', () => {
    const meta = createMeta()
    meta.funds = 5000
    replenish(meta)
    expect(meta.funds).toBe(5000)
  })

  it('人手足夠時不會硬塞新人', () => {
    const meta = createMeta()
    const before = meta.roster.length
    expect(replenish(meta)).toHaveLength(0)
    expect(meta.roster.length).toBe(before)
  })

  it('招募的人名字不重複', () => {
    const meta = createMeta()
    for (let i = 0; i < 10; i++) recruit(meta)
    const names = meta.roster.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('死掉的人不會被派出去', () => {
    const meta = createMeta()
    member(meta, 'tobi').status = 'dead'
    const party = deployParty(meta, IDS)
    expect(party.map((c) => c.id)).not.toContain('tobi')
    expect(party).toHaveLength(3)
  })
})
