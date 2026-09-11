import { describe, expect, it } from 'vitest'
import { createBattle, type BattleState } from '../battle'
import { makeNode } from '../map'
import { concludeRun, createMeta, deployParty } from '../meta'
import {
  battleAct,
  battleFlee,
  camp,
  capacityOfRun,
  createRun,
  isAsleep,
  loadOf,
  moveTo,
  normalizeRun,
  repairBill,
} from '../run'
import type { RunState } from '../types'
import { KNOCKOUT, skillById } from '../../data/skills'

const IDS = ['riko', 'reg', 'urna', 'tobi']

function giveTurn(b: BattleState, id: string): void {
  for (const c of b.combatants) c.nextAt = c.id === id ? 0 : 9999
  b.awaiting = id
}

function fresh(seed: string, ids = IDS): RunState {
  return createRun(seed, { party: deployParty(createMeta(), ids) })
}

/** 下一步一定是遭遇 */
function enterEncounter(s: RunState): void {
  const [node, rng] = makeNode(s.rngState, s.nextNodeId, s.depth + 60, 'encounter')
  s.rngState = rng
  s.choices = [node]
  moveTo(s, node.id)
}

/** 往前走一步；遇到戰鬥就撤退，只為了推進步數 */
function walk(s: RunState): void {
  const next = s.choices[0]
  if (!next) return
  moveTo(s, next.id)
  if (s.battle) battleFlee(s)
}

describe('火葬砲的代價：雷格會昏睡', () => {
  it('放了火葬砲，打完雷格就睡著了', () => {
    const s = fresh('fired')
    s.battle = createBattle(s.rngState, s.party, 1)
    giveTurn(s.battle, 'reg')
    battleAct(s, 'incinerate', null)
    if (s.battle) battleFlee(s)

    expect(isAsleep(s, 'reg')).toBe(true)
    expect(s.sleepers['reg']).toBe(KNOCKOUT.steps)
    expect(s.log.some((l) => l.text.includes('睡著'))).toBe(true)
  })

  it('沒放就不會睡', () => {
    const s = fresh('not-fired')
    s.battle = createBattle(s.rngState, s.party, 1)
    battleFlee(s)
    expect(isAsleep(s, 'reg')).toBe(false)
  })

  it('技能說明寫出實際的代價 —— 按下去之前就該知道', () => {
    const def = skillById('incinerate')!
    expect(def.desc).toContain(`${KNOCKOUT.steps} 步`)
    expect(def.desc).toContain(`+${KNOCKOUT.bodyWeight}kg`)
    expect(def.desc).toContain('紮營')
    expect(def.desc).toContain(`檢修費 ${def.repairFee}`)
  })

  /**
   * 代價壓在戰力，不壓在負重。
   * 負重代價一重，隊伍就會連鎖丟東西，打贏了還是得回去（見 knockout.stats.ts）。
   */
  it('扶著他走只多一點負重，揹負量不變', () => {
    const s = fresh('carry')
    const load = loadOf(s)
    const cap = capacityOfRun(s)

    s.sleepers['reg'] = 2
    expect(loadOf(s)).toBeCloseTo(load + KNOCKOUT.bodyWeight)
    expect(capacityOfRun(s)).toBe(cap)
    expect(KNOCKOUT.bodyWeight).toBeLessThanOrEqual(cap * 0.1)
  })

  it('睡著的人不參戰', () => {
    const s = fresh('no-fight')
    s.sleepers['reg'] = 999
    enterEncounter(s)

    expect(s.battle).not.toBeNull()
    expect(s.battle!.combatants.some((c) => c.id === 'reg')).toBe(false)
  })

  it('醒著的人一個也沒有時，遭遇不會開打', () => {
    const s = fresh('all-asleep', ['reg'])
    // 雷格一個人揹不動預設的補給，先減到走得動
    s.supplies = { food: 1, water: 5, rope: 0, medicine: 0 }
    s.sleepers['reg'] = 999
    enterEncounter(s)

    expect(s.battle).toBeNull()
    expect(s.log.some((l) => l.text.includes('醒著的人一個也沒有'))).toBe(true)
  })

  it(`扶著走 ${KNOCKOUT.steps} 步之後自己醒來`, () => {
    const s = fresh('wake')
    s.sleepers['reg'] = KNOCKOUT.steps

    for (let i = 0; i < KNOCKOUT.steps - 1; i++) walk(s)
    expect(isAsleep(s, 'reg')).toBe(true)

    walk(s)
    expect(isAsleep(s, 'reg')).toBe(false)
    expect(s.log.some((l) => l.text.includes('醒過來'))).toBe(true)
  })

  it('紮營可以提早叫醒', () => {
    const s = fresh('camp-wake')
    s.sleepers['reg'] = KNOCKOUT.steps
    camp(s)
    expect(isAsleep(s, 'reg')).toBe(false)
  })

  it('放了火葬砲會記下回城的檢修費', () => {
    const s = fresh('bill')
    s.battle = createBattle(s.rngState, s.party, 1)
    giveTurn(s.battle, 'reg')
    battleAct(s, 'incinerate', null)
    if (s.battle) battleFlee(s)

    const fee = skillById('incinerate')!.repairFee!
    expect(fee).toBeGreaterThan(0)
    expect(repairBill(s)).toEqual({ shots: 1, total: fee })
  })

  it('舊存檔沒有昏睡欄位也能讀', () => {
    const s = fresh('legacy')
    delete (s as unknown as Record<string, unknown>).sleepers
    expect(normalizeRun(s).sleepers).toEqual({})
  })
})

describe('回奧斯城結算檢修費', () => {
  /** 兩趟一模一樣的探索，只差有沒有放火葬砲，比較結算後的資金 */
  function settle(shots: number, tweak: (s: RunState) => void = () => {}) {
    const run = (withShots: number) => {
      const meta = createMeta()
      const s = createRun('settle', { party: deployParty(meta, IDS) })
      s.over = true
      s.endReason = 'surfaced'
      for (let i = 0; i < withShots; i++) {
        s.aftermath.push({ kind: 'repair', charId: 'reg', skillId: 'incinerate', amount: 200 })
      }
      tweak(s)
      const summary = concludeRun(meta, s)
      return { funds: meta.funds, summary }
    }
    const plain = run(0)
    const billed = run(shots)
    return { paid: plain.funds - billed.funds, summary: billed.summary }
  }

  it('活著回來就依發數收費，並寫進結算', () => {
    const { paid, summary } = settle(2)
    expect(paid).toBe(400)
    expect(summary.aftermath).toContain('雷格的檢修費 −400（火葬砲 2 發）')
  })

  it('雷格沒有回來就不收', () => {
    const { paid } = settle(2, (s) => {
      s.party.find((c) => c.id === 'reg')!.status = 'dead'
    })
    expect(paid).toBe(0)
  })

  it('全滅就不收', () => {
    const { paid } = settle(2, (s) => {
      s.endReason = 'wiped'
    })
    expect(paid).toBe(0)
  })
})
