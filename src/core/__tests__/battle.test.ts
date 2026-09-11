import { describe, expect, it } from 'vitest'
import {
  awaitingActor,
  combatantById,
  createBattle,
  enemyScale,
  flee,
  forecast,
  living,
  skillsOfActor,
  TICK,
  useSkill,
  type BattleState,
} from '../battle'
import { createMeta, deployParty } from '../meta'
import { autoResolveBattle, battleAct, battleFlee, createRun, moveTo } from '../run'
import type { Character, RunState } from '../types'
import { ENEMIES } from '../../data/enemies'

const IDS = ['riko', 'reg', 'urna', 'tobi']

function party(): Character[] {
  return deployParty(createMeta(), IDS)
}

function battleAt(seed: number, layer: number): BattleState {
  return createBattle(seed, party(), layer)
}

/** 直接讓某個隊員輪到行動，方便測技能 */
function giveTurn(b: BattleState, id: string): void {
  for (const c of b.combatants) c.nextAt = c.id === id ? 0 : 9999
  b.awaiting = id
}

describe('戰鬥的建立', () => {
  it('依層級挑選敵人，雙方都上場', () => {
    const b = battleAt(101, 1)
    expect(living(b, 'enemy').length).toBeGreaterThan(0)
    expect(living(b, 'party')).toHaveLength(4)
  })

  it('同一個 seed 打出同一場戰鬥', () => {
    const a = battleAt(555, 3)
    const c = battleAt(555, 3)
    expect(a.combatants.map((x) => x.name)).toEqual(c.combatants.map((x) => x.name))
    expect(a.log).toEqual(c.log)
  })

  it('同一種生物在越深的地方越硬，但成長是溫和的', () => {
    const def = ENEMIES.find((e) => e.id === 'corpse-weeper')!
    expect(enemyScale(def, 4)).toBe(1)
    expect(enemyScale(def, 5)).toBeGreaterThan(1)
    // 威脅該來自機制而不是血條，所以不該翻倍
    expect(enemyScale(def, 7)).toBeLessThan(2)
  })

  it('建立後就停在某個隊員的回合上等指令', () => {
    const b = battleAt(202, 1)
    expect(b.awaiting).not.toBeNull()
    expect(awaitingActor(b)?.side).toBe('party')
  })
})

describe('行動順序條', () => {
  it('速度快的人先動', () => {
    const b = battleAt(303, 1)
    const order = forecast(b, 6)
    expect(order.length).toBe(6)

    const first = order[0]!
    const clock = b.combatants.map((c) => c.nextAt)
    expect(first.nextAt).toBe(Math.min(...clock))
  })

  it('預判不會改動戰鬥狀態', () => {
    const b = battleAt(404, 2)
    const before = b.combatants.map((c) => c.nextAt)
    forecast(b, 10)
    expect(b.combatants.map((c) => c.nextAt)).toEqual(before)
  })
})

describe('技能', () => {
  it('揮擊造成傷害', () => {
    const b = battleAt(505, 1)
    const foe = living(b, 'enemy')[0]!
    const before = foe.hp
    giveTurn(b, 'riko')
    useSkill(b, 'strike', foe.id, 3)
    expect(combatantById(b, foe.id)!.hp).toBeLessThan(before)
  })

  it('牽制會把目標的下次行動往後推 —— 這才是時間軸的重點', () => {
    const b = battleAt(606, 2)
    const foe = living(b, 'enemy')[0]!
    const before = foe.nextAt
    giveTurn(b, 'urna')
    useSkill(b, 'harry', foe.id, 3)
    expect(combatantById(b, foe.id)!.nextAt).toBeGreaterThan(before)
  })

  it('火葬砲一場只能用一次，而且之後很久不能動', () => {
    const b = battleAt(707, 3)
    giveTurn(b, 'reg')
    const reg = combatantById(b, 'reg')!
    const before = reg.nextAt

    const r = useSkill(b, 'incinerate', null, 3)
    expect(r.ok).toBe(true)
    expect(reg.nextAt).toBeGreaterThan(before + TICK / reg.speed)
    expect(reg.uses['incinerate']).toBe(0)

    giveTurn(b, 'reg')
    expect(useSkill(b, 'incinerate', null, 3).ok).toBe(false)
    expect(skillsOfActor(reg).map((s) => s.id)).not.toContain('incinerate')
  })

  it('急救治不到敵人身上', () => {
    const b = battleAt(808, 2)
    const foe = living(b, 'enemy')[0]!
    foe.hp = 1
    giveTurn(b, 'riko')

    useSkill(b, 'firstaid', foe.id, 3)
    expect(combatantById(b, foe.id)!.hp).toBe(1)
  })

  it('藥品不夠就用不了急救', () => {
    const b = battleAt(909, 1)
    giveTurn(b, 'riko')
    expect(useSkill(b, 'firstaid', 'riko', 0).ok).toBe(false)
  })

  it('不是自己的回合就不能出手', () => {
    const b = battleAt(111, 1)
    b.awaiting = null
    expect(useSkill(b, 'strike', null, 3).ok).toBe(false)
  })
})

describe('收場', () => {
  it('打光敵人就贏', () => {
    const b = battleAt(222, 1)
    const foes = living(b, 'enemy')
    for (const e of foes.slice(1)) {
      e.hp = 0
      e.status = 'down'
    }
    const last = foes[0]!
    last.hp = 1

    giveTurn(b, 'riko')
    useSkill(b, 'strike', last.id, 3)
    expect(b.over).toBe('win')
  })

  it('逃跑永遠有效', () => {
    const b = battleAt(333, 5)
    flee(b)
    expect(b.over).toBe('flee')
    expect(b.awaiting).toBeNull()
  })
})

describe('接進探索', () => {
  function untilBattle(seed: string): RunState {
    const s = createRun(seed, { party: party() })
    let guard = 0
    while (!s.battle && !s.over && s.choices[0] && guard++ < 60) {
      moveTo(s, s.choices[0].id)
    }
    return s
  }

  it('遭遇會開打，而且在打完之前探索完全停住', () => {
    const s = untilBattle('into-battle')
    expect(s.battle).not.toBeNull()

    const depth = s.depth
    const choices = s.choices
    moveTo(s, s.choices[0]?.id ?? 'x')
    expect(s.depth).toBe(depth)
    expect(s.choices).toBe(choices)
  })

  it('打完之後被中斷的那一步會走完', () => {
    const s = untilBattle('resume-after')
    const choices = s.choices
    autoResolveBattle(s)
    expect(s.battle).toBeNull()
    expect(s.over || s.choices !== choices).toBeTruthy()
  })

  it('逃跑之後照樣繼續探索', () => {
    const s = untilBattle('flee-then')
    battleFlee(s)
    expect(s.battle).toBeNull()
    expect(s.log.some((l) => l.text.includes('退開'))).toBe(true)
  })

  it('戰鬥中倒下的人會留下遺體', () => {
    const s = untilBattle('battle-death')
    if (!s.battle) return
    for (const unit of s.battle.combatants) {
      if (unit.side === 'party') unit.hp = 0
    }
    battleFlee(s)
    expect(s.carried.some((i) => i.kind === 'corpse')).toBe(true)
  })

  it('毒會扣掉耐受度 —— 威脅是資源，不是血量', () => {
    const s = createRun('poison', { party: party() })
    const riko = s.party.find((c) => c.id === 'riko')!
    const before = riko.tolerance

    s.battle = createBattle(s.rngState, s.party, 2)
    s.battle.effects.push({ kind: 'poison', charId: 'riko', amount: 2 })
    battleFlee(s)

    expect(riko.tolerance).toBe(before - 2)
  })

  it('使用急救會真的扣掉藥品', () => {
    const s = createRun('medicine-cost', { party: party() })
    s.battle = createBattle(s.rngState, s.party, 1)
    giveTurn(s.battle, 'riko')

    const before = s.supplies.medicine
    battleAct(s, 'firstaid', 'tobi')
    expect(s.supplies.medicine).toBe(before - 1)
  })
})

describe('失明：戰鬥中出手會落空', () => {
  it('失明的隊員帶著落空機率上場，其他人不受影響', () => {
    const members = party()
    members[0]!.afflictions.push('blind')
    const b = createBattle(1, members, 1)

    expect(combatantById(b, members[0]!.id)!.miss).toBeCloseTo(0.25)
    expect(combatantById(b, 'reg')!.miss).toBe(0)
  })

  it('落空時不造成傷害，而且寫進戰鬥紀錄', () => {
    const b = battleAt(505, 1)
    const foe = living(b, 'enemy')[0]!
    const before = foe.hp
    giveTurn(b, 'riko')
    combatantById(b, 'riko')!.miss = 1

    useSkill(b, 'strike', foe.id, 3)
    expect(foe.hp).toBe(before)
    expect(b.log.some((l) => l.includes('落空'))).toBe(true)
  })

  it('治療不會落空 —— 那靠的是手，不是眼睛', () => {
    const b = battleAt(606, 1)
    giveTurn(b, 'riko')
    const riko = combatantById(b, 'riko')!
    riko.miss = 1
    const tobi = combatantById(b, 'tobi')!
    tobi.hp = 1

    useSkill(b, 'firstaid', 'tobi', 3)
    expect(tobi.hp).toBeGreaterThan(1)
  })
})
