import { describe, expect, it } from 'vitest'
import {
  awaitingActor,
  createBattle,
  living,
  skillsOfActor,
  useSkill,
  type BattleState,
} from '../../core/battle'
import { createMeta, deployParty } from '../../core/meta'
import { diffBattle, HEAVY_SHARE, renderBattle, snapshotBattle, type BattleFx } from '../battle'

function fresh(): BattleState {
  return createBattle(20260911, deployParty(createMeta(), ['riko', 'reg']), 1)
}

const none: BattleFx = { hp: {}, downed: [], advanced: false }

/** 用第一個有傷害的技能打第一個敵人 */
function strike(b: BattleState): void {
  const actor = awaitingActor(b)!
  const skill = skillsOfActor(actor).find((s) => s.power)!
  useSkill(b, skill.id, living(b, 'enemy')[0]!.id, 99)
}

describe('戰鬥行動的差異', () => {
  it('算得出誰掉了多少血、行動順序有沒有推進', () => {
    const b = fresh()
    const foe = living(b, 'enemy')[0]!
    const before = snapshotBattle(b)
    strike(b)

    const fx = diffBattle(before, b)
    expect(fx.hp[foe.id]).toBeGreaterThan(0)
    expect(fx.advanced).toBe(true)
  })

  it('記得這次行動才倒下的', () => {
    const b = fresh()
    const foe = living(b, 'enemy')[0]!
    foe.hp = 1
    const before = snapshotBattle(b)
    strike(b)

    expect(diffBattle(before, b).downed).toContain(foe.id)
  })
})

describe('戰鬥畫面的手感', () => {
  it('被打中：血量劃掉改寫、血條留下殘影', () => {
    const b = fresh()
    const foe = living(b, 'enemy')[0]!
    foe.hp -= 1
    const html = renderBattle(b, null, 0, { ...none, hp: { [foe.id]: 1 } })

    expect(html).toContain('unit--hit')
    expect(html).toContain(`<s>${foe.hp + 1}</s>`)
    expect(html).toContain('unit__ghost')
  })

  it('一次吃掉大量血量時筆跡特別用力', () => {
    const b = fresh()
    const foe = living(b, 'enemy')[0]!
    const big = Math.ceil(foe.maxHp * HEAVY_SHARE)
    foe.hp = Math.max(1, foe.hp - big)

    expect(renderBattle(b, null, 0, { ...none, hp: { [foe.id]: big } })).toContain('unit--heavy')
  })

  it('回復用綠色改寫，血條往上長', () => {
    const b = fresh()
    const ally = living(b, 'party')[0]!
    const html = renderBattle(b, null, 0, { ...none, hp: { [ally.id]: -3 } })

    expect(html).toContain('changed--up')
    expect(html).toContain('unit__fill--grow')
    expect(html).not.toContain('unit__ghost')
  })

  it('這次才倒下的會被標記，用來播放劃掉或變灰', () => {
    const b = fresh()
    const foe = living(b, 'enemy')[0]!
    foe.hp = 0
    foe.status = 'down'

    expect(renderBattle(b, null, 0, { ...none, downed: [foe.id] })).toContain('unit--felled')
  })

  it('輪到的人被圈起來；推進時才播放畫圈與順序滑動', () => {
    const b = fresh()
    const still = renderBattle(b, null, 0)
    expect(still).toContain('unit--actor')
    expect(still).not.toContain('unit--turn')

    const moved = renderBattle(b, null, 0, { ...none, advanced: true })
    expect(moved).toContain('unit--turn')
    expect(moved).toContain('timeline--advanced')
  })

  it('沒有帶入行動差異時不播放任何動畫 —— 展開面板不能讓動畫重播', () => {
    const html = renderBattle(fresh(), null, 0)
    for (const cls of ['unit--hit', 'unit__ghost', 'unit--felled', 'unit--turn', 'timeline--advanced']) {
      expect(html).not.toContain(cls)
    }
  })

  it('蓄力中的敵人字跡會抖', () => {
    const b = fresh()
    living(b, 'enemy')[0]!.charging = 2
    expect(renderBattle(b, null, 0)).toContain('unit--charging')
  })

  it('停在最後一擊的畫面時，不再提供撤退', () => {
    const b = fresh()
    b.over = 'win'
    b.awaiting = null
    const html = renderBattle(b, null, 0)

    expect(html).toContain('周圍安靜下來了')
    expect(html).not.toContain('data-flee')
  })
})
