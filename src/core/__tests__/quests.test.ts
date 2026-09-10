import { describe, expect, it } from 'vitest'
import {
  abandonQuest,
  activeQuests,
  advanceDays,
  canPromote,
  clampLoadoutToFunds,
  concludeRun,
  createMeta,
  currentRank,
  departCost,
  departFee,
  deployableMembers,
  deployParty,
  hire,
  isFit,
  loadoutCost,
  nextRank,
  openQuests,
  promote,
  rosterCap,
  setDepartDepth,
  takeQuest,
  unlockedBases,
  type MetaState,
} from '../meta'
import { baseFee } from '../../data/bases'
import { evaluateQuest, generateQuest, MAX_ACTIVE_QUESTS, type Quest } from '../quests'
import { createRun } from '../run'
import type { RunState } from '../types'

const IDS = ['riko', 'reg', 'urna', 'tobi']

function finishedRun(meta: MetaState, mutate: (r: RunState) => void = () => {}): RunState {
  const run = createRun('quest-test', { party: deployParty(meta, IDS) })
  run.maxDepthReached = 5000
  run.depth = 0
  run.over = true
  run.endReason = 'surfaced'
  mutate(run)
  return run
}

function questOf(over: Partial<Quest>): Quest {
  const [q] = generateQuest(12345, 1, 1, 1)
  return { ...q, ...over }
}

describe('委託的產生', () => {
  it('報酬隨深度大幅成長 —— 這才是往下走的理由', () => {
    const [shallow] = generateQuest(111, 1, 1, 1)
    const [deep] = generateQuest(111, 1, 4, 1)
    expect(deep.reward).toBeGreaterThan(shallow.reward * 3)
  })

  it('同一個 seed 產生同一張委託', () => {
    const [a] = generateQuest(777, 1, 2, 1)
    const [b] = generateQuest(777, 1, 2, 1)
    expect(a).toEqual(b)
  })

  it('公告板永遠補滿', () => {
    const meta = createMeta()
    expect(openQuests(meta)).toHaveLength(3)
    takeQuest(meta, openQuests(meta)[0]!.id)
    expect(openQuests(meta)).toHaveLength(3)
  })
})

describe('承接與放棄', () => {
  it('最多只能同時接兩張', () => {
    const meta = createMeta()
    for (const q of [...openQuests(meta)]) takeQuest(meta, q.id)
    expect(activeQuests(meta)).toHaveLength(MAX_ACTIVE_QUESTS)
  })

  it('放棄之後名額會空出來', () => {
    const meta = createMeta()
    const first = openQuests(meta)[0]!
    takeQuest(meta, first.id)
    expect(abandonQuest(meta, first.id)).toBe(true)
    expect(activeQuests(meta)).toHaveLength(0)
  })
})

describe('驗收', () => {
  const run = (over: Partial<RunState>): RunState => {
    const meta = createMeta()
    return { ...finishedRun(meta), ...over }
  }

  it('死在下面就什麼都交不出來', () => {
    const q = questOf({ kind: 'reach', minDepth: 1000 })
    expect(evaluateQuest(q, run({ endReason: 'wiped', maxDepthReached: 9000 }), 4)).toBe(false)
  })

  it('深度不夠不算達成', () => {
    const q = questOf({ kind: 'reach', minDepth: 8000 })
    expect(evaluateQuest(q, run({ maxDepthReached: 7999 }), 4)).toBe(false)
    expect(evaluateQuest(q, run({ maxDepthReached: 8000 }), 4)).toBe(true)
  })

  it('採集要看帶回來的數量', () => {
    const q = questOf({ kind: 'collect', minDepth: 0, target: 2 })
    const loot = (id: string) => ({
      id,
      name: 'x',
      weight: 1,
      kind: 'loot' as const,
      value: 10,
      identified: true,
    })
    expect(evaluateQuest(q, run({ carried: [loot('a')] }), 4)).toBe(false)
    expect(evaluateQuest(q, run({ carried: [loot('a'), loot('b')] }), 4)).toBe(true)
  })

  it('全員生還要一個都不能少', () => {
    const q = questOf({ kind: 'allSurvive', minDepth: 0 })
    const base = finishedRun(createMeta())
    expect(evaluateQuest(q, base, base.party.length)).toBe(true)

    base.party[0]!.status = 'dead'
    expect(evaluateQuest(q, base, base.party.length)).toBe(false)
  })

  it('安葬委託要真的帶著遺體回來', () => {
    const q = questOf({ kind: 'bury', minDepth: 0 })
    expect(evaluateQuest(q, run({}), 4)).toBe(false)
    expect(
      evaluateQuest(
        q,
        run({
          carried: [
            {
              id: 'c',
              name: '遺體',
              weight: 22,
              kind: 'corpse',
              value: 0,
              identified: true,
              ownerId: 'tobi',
            },
          ],
        }),
        4,
      ),
    ).toBe(true)
  })
})

describe('結算', () => {
  it('達成的委託會付錢並計入晉升', () => {
    const meta = createMeta()
    const q = openQuests(meta)[0]!
    q.kind = 'reach'
    q.minDepth = 100
    q.reward = 5000
    takeQuest(meta, q.id)

    const funds = meta.funds
    const summary = concludeRun(meta, finishedRun(meta))

    expect(summary.questsDone).toHaveLength(1)
    expect(meta.funds).toBeGreaterThanOrEqual(funds + 5000)
    expect(meta.questsCompleted).toBe(1)
  })

  it('沒交差的委託就這樣失去，不會留到下次', () => {
    const meta = createMeta()
    const q = openQuests(meta)[0]!
    q.kind = 'reach'
    q.minDepth = 99999
    takeQuest(meta, q.id)

    const summary = concludeRun(meta, finishedRun(meta))
    expect(summary.questsFailed).toHaveLength(1)
    expect(activeQuests(meta)).toHaveLength(0)
    expect(meta.questsCompleted).toBe(0)
  })

  it('一趟至少花掉一天', () => {
    const meta = createMeta()
    const before = meta.day
    const summary = concludeRun(meta, finishedRun(meta))
    expect(summary.daysSpent).toBeGreaterThanOrEqual(1)
    expect(meta.day).toBe(before + summary.daysSpent)
  })
})

describe('階級', () => {
  it('起始是紅笛，條件不足時不會晉升', () => {
    const meta = createMeta()
    expect(currentRank(meta).name).toBe('紅笛')
    expect(canPromote(meta)).toBe(false)
    expect(promote(meta)).toBeNull()
  })

  it('委託數與深度都達成才晉升', () => {
    const meta = createMeta()
    const target = nextRank(meta)!

    meta.questsCompleted = target.quests
    expect(canPromote(meta)).toBe(false) // 深度還不夠

    meta.deepestReached = target.depth
    expect(canPromote(meta)).toBe(true)
    expect(promote(meta)?.name).toBe(target.name)
  })

  it('階級決定名冊上限', () => {
    const meta = createMeta()
    const cap = rosterCap(meta)
    meta.funds = 999999
    for (let i = 0; i < cap + 5; i++) {
      const applicant = meta.applicants[0]
      if (!applicant) break
      hire(meta, applicant.id)
    }
    expect(meta.roster.filter((c) => c.status === 'alive').length).toBeLessThanOrEqual(cap)
  })
})

describe('前線基地', () => {
  it('一開始一個都沒有，只能從地表走下去', () => {
    const meta = createMeta()
    expect(unlockedBases(meta)).toHaveLength(0)
    expect(meta.departDepth).toBe(0)
    expect(departFee(meta)).toBe(0)
  })

  it('抵達某一層並且活著回來，那一層的基地就開放', () => {
    const meta = createMeta()
    const summary = concludeRun(
      meta,
      finishedRun(meta, (r) => {
        r.maxDepthReached = 7200
      }),
    )
    // 二、三、四層一次全開
    expect(summary.basesOpened.length).toBe(3)
    expect(unlockedBases(meta).map((b) => b.layer)).toEqual([2, 3, 4])
  })

  it('全滅就什麼都沒開', () => {
    const meta = createMeta()
    const summary = concludeRun(
      meta,
      finishedRun(meta, (r) => {
        r.maxDepthReached = 12500
        r.endReason = 'wiped'
      }),
    )
    expect(summary.basesOpened).toHaveLength(0)
    expect(unlockedBases(meta)).toHaveLength(0)
  })

  it('沒解鎖的基地選不了', () => {
    const meta = createMeta()
    setDepartDepth(meta, 7000)
    expect(meta.departDepth).toBe(0)
  })

  it('選了基地之後要付維護費，而且計入出發總花費', () => {
    const meta = createMeta()
    meta.bases = [4]
    setDepartDepth(meta, 7000)

    expect(meta.departDepth).toBe(7000)
    expect(departFee(meta)).toBe(baseFee(7000))
    expect(departCost(meta)).toBe(loadoutCost(meta.loadout) + baseFee(7000))
  })

  it('從基地出發：起始深度生效，但回程的代價一分不少', () => {
    const meta = createMeta()
    const run = createRun('base', { party: deployParty(meta, IDS), startDepth: 7000 })

    expect(run.depth).toBe(7000)
    // 最深抵達從出發點起算，所以爬回地表仍要穿越每一層
    expect(run.maxDepthReached).toBe(7000)
    expect(run.choices[0]!.depth).toBeGreaterThan(7000)
  })

  it('付不起維護費時會自動退回從地表出發', () => {
    const meta = createMeta()
    meta.bases = [5]
    setDepartDepth(meta, 12000)
    meta.funds = 100

    clampLoadoutToFunds(meta)
    expect(meta.departDepth).toBe(0)
    expect(departCost(meta)).toBeLessThanOrEqual(100)
  })
})

describe('休養', () => {
  it('傷勢未癒的人不能出勤', () => {
    const meta = createMeta()
    const tobi = meta.roster.find((c) => c.id === 'tobi')!
    tobi.hp = 1

    expect(isFit(tobi)).toBe(false)
    expect(deployableMembers(meta).map((c) => c.id)).not.toContain('tobi')
    expect(deployParty(meta, IDS).map((c) => c.id)).not.toContain('tobi')
  })

  it('在城裡待一天會讓傷勢好轉，也會讓日子過去', () => {
    const meta = createMeta()
    const tobi = meta.roster.find((c) => c.id === 'tobi')!
    tobi.hp = 1
    const day = meta.day

    advanceDays(meta, 1)
    expect(meta.day).toBe(day + 1)
    expect(tobi.hp).toBeGreaterThan(1)

    advanceDays(meta, 10)
    expect(isFit(tobi)).toBe(true)
  })

  it('等太久委託會過期', () => {
    const meta = createMeta()
    const ids = openQuests(meta).map((q) => q.id)
    advanceDays(meta, 40)
    const remaining = openQuests(meta).map((q) => q.id)
    expect(ids.some((id) => remaining.includes(id))).toBe(false)
    expect(remaining).toHaveLength(3) // 但公告板會補上新的
  })

  it('傷勢會從深淵帶回地表', () => {
    const meta = createMeta()
    const run = finishedRun(meta, (r) => {
      const riko = r.party.find((c) => c.id === 'riko')!
      riko.hp = 3
    })
    concludeRun(meta, run)
    expect(meta.roster.find((c) => c.id === 'riko')!.hp).toBe(3)
  })
})
