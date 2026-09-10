import { nextInt, pick } from './rng'
import type { Character } from './types'
import { enemiesForLayer, enemyById, type EnemyDef } from '../data/enemies'
import {
  DEFAULT_SKILLS,
  SIGNATURE_SKILLS,
  skillById,
  type SkillDef,
} from '../data/skills'

/** 行動間隔的基準。速度 10 的人每 100 個時間單位動一次 */
export const TICK = 1000

export interface Combatant {
  id: string
  name: string
  side: 'party' | 'enemy'
  hp: number
  maxHp: number
  speed: number
  power: number
  /** 下次行動的時間點。整條時間軸都由它決定 */
  nextAt: number
  skills: string[]
  /** 技能剩餘次數 */
  uses: Record<string, number>
  /** 敵人蓄力中的重擊倍率 */
  charging: number
  enemyId?: string
  status: 'alive' | 'down'
}

/** 戰鬥造成、需要由探索層結算的後果 */
export type BattleEffect =
  | { kind: 'poison'; charId: string; amount: number }
  | { kind: 'devour' }

export interface BattleState {
  combatants: Combatant[]
  log: string[]
  /** 正在等待玩家下令的隊員 */
  awaiting: string | null
  over: null | 'win' | 'flee' | 'wipe'
  effects: BattleEffect[]
  rngState: number
  layer: number
}

// ─── 建立 ────────────────────────────────────────────────────

function powerOf(c: Character): number {
  return 4 + Math.floor(c.maxHp / 6)
}

function skillsOf(c: Character): string[] {
  return SIGNATURE_SKILLS[c.id] ?? [...DEFAULT_SKILLS]
}

function initialUses(skills: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of skills) {
    const def = skillById(id)
    if (def?.uses !== undefined) out[id] = def.uses
  }
  return out
}

/** 越深的個體越硬，但成長是溫和的 —— 威脅該來自機制而不是血條 */
export function enemyScale(def: EnemyDef, layer: number): number {
  return 1 + Math.max(0, layer - def.layers[0]) * 0.18
}

function makeEnemy(def: EnemyDef, index: number, layer: number): Combatant {
  const scale = enemyScale(def, layer)
  return {
    id: `e${index}`,
    name: def.name,
    side: 'enemy',
    hp: Math.round(def.hp * scale),
    maxHp: Math.round(def.hp * scale),
    speed: def.speed,
    power: Math.round(def.power * scale),
    nextAt: TICK / def.speed,
    skills: [],
    uses: {},
    charging: 0,
    enemyId: def.id,
    status: 'alive',
  }
}

export function createBattle(
  rngState: number,
  party: readonly Character[],
  layer: number,
): BattleState {
  let s = rngState
  const pool = enemiesForLayer(layer)

  const [count, s1] = nextInt(s, 1, layer >= 4 ? 3 : 2)
  s = s1

  const enemies: Combatant[] = []
  for (let i = 0; i < count; i++) {
    const [def, ns] = pick(s, pool)
    s = ns
    enemies.push(makeEnemy(def, i, layer))
  }

  const allies: Combatant[] = party
    .filter((c) => c.status === 'alive')
    .map((c) => {
      const skills = skillsOf(c)
      return {
        id: c.id,
        name: c.name,
        side: 'party' as const,
        hp: c.hp,
        maxHp: c.maxHp,
        speed: 10 + Math.floor(c.tolerance / 6),
        power: powerOf(c),
        nextAt: TICK / (10 + Math.floor(c.tolerance / 6)),
        skills,
        uses: initialUses(skills),
        charging: 0,
        status: 'alive' as const,
      }
    })

  const battle: BattleState = {
    combatants: [...allies, ...enemies],
    log: [`${enemies.map((e) => e.name).join('、')}擋在前面。`],
    awaiting: null,
    over: null,
    effects: [],
    rngState: s,
    layer,
  }

  advance(battle)
  return battle
}

// ─── 查詢 ────────────────────────────────────────────────────

export function living(b: BattleState, side: Combatant['side']): Combatant[] {
  return b.combatants.filter((c) => c.side === side && c.status === 'alive')
}

export function combatantById(b: BattleState, id: string): Combatant | undefined {
  return b.combatants.find((c) => c.id === id)
}

export function awaitingActor(b: BattleState): Combatant | undefined {
  return b.awaiting ? combatantById(b, b.awaiting) : undefined
}

function order(b: BattleState): Combatant[] {
  return b.combatants
    .filter((c) => c.status === 'alive')
    .slice()
    .sort((a, c) => a.nextAt - c.nextAt || (a.side === 'party' ? -1 : 1))
}

/**
 * 預判接下來的出手順序（企劃書 12-1）。
 * 玩家看得到「三個行動之後 BOSS 會動」，牽制才有意義。
 */
export function forecast(b: BattleState, count = 6): Combatant[] {
  const clock = new Map(b.combatants.map((c) => [c.id, c.nextAt]))
  const out: Combatant[] = []

  for (let i = 0; i < count; i++) {
    const alive = b.combatants.filter((c) => c.status === 'alive')
    if (alive.length === 0) break

    let soonest = alive[0] as Combatant
    for (const c of alive) {
      const t = clock.get(c.id) ?? 0
      const best = clock.get(soonest.id) ?? 0
      if (t < best || (t === best && c.side === 'party')) soonest = c
    }

    out.push(soonest)
    clock.set(soonest.id, (clock.get(soonest.id) ?? 0) + TICK / soonest.speed)
  }

  return out
}

export function skillsOfActor(actor: Combatant): SkillDef[] {
  return actor.skills
    .map(skillById)
    .filter((s): s is SkillDef => !!s)
    .filter((s) => actor.uses[s.id] === undefined || (actor.uses[s.id] ?? 0) > 0)
}

// ─── 行動 ────────────────────────────────────────────────────

function damage(b: BattleState, target: Combatant, amount: number): void {
  target.hp = Math.max(0, target.hp - amount)
  if (target.hp === 0 && target.status === 'alive') {
    target.status = 'down'
    b.log.push(target.side === 'enemy' ? `${target.name}倒下了。` : `${target.name}倒下了。`)
  }
}

function roll(b: BattleState, min: number, max: number): number {
  const [v, s] = nextInt(b.rngState, min, max)
  b.rngState = s
  return v
}

function targetsFor(b: BattleState, actor: Combatant, def: SkillDef, targetId: string | null) {
  switch (def.target) {
    case 'allEnemies':
      return living(b, actor.side === 'party' ? 'enemy' : 'party')
    case 'allAllies':
      return living(b, actor.side)
    case 'self':
      return [actor]
    default: {
      const side = def.target === 'ally' ? actor.side : actor.side === 'party' ? 'enemy' : 'party'
      const t = targetId ? combatantById(b, targetId) : undefined
      // 指定的目標站錯邊就忽略它，免得急救治到敵人身上
      if (t && t.status === 'alive' && t.side === side) return [t]
      return living(b, side).slice(0, 1)
    }
  }
}

export interface SkillResult {
  ok: boolean
  reason?: string
}

/** 玩家下令。medicine 由探索層扣，因此以參數傳入目前存量 */
export function useSkill(
  b: BattleState,
  skillId: string,
  targetId: string | null,
  medicine: number,
): SkillResult {
  const actor = awaitingActor(b)
  if (!actor || b.over) return { ok: false, reason: '現在不是你的回合' }

  const def = skillById(skillId)
  if (!def || !actor.skills.includes(skillId)) return { ok: false, reason: '沒有這個技能' }
  if ((actor.uses[skillId] ?? 1) <= 0) return { ok: false, reason: '這一戰已經用過了' }
  if ((def.medicine ?? 0) > medicine) return { ok: false, reason: '藥品不夠' }

  const targets = targetsFor(b, actor, def, targetId)
  if (targets.length === 0) return { ok: false, reason: '沒有目標' }

  if (def.power) {
    for (const t of targets) {
      const variance = roll(b, 85, 115) / 100
      const dealt = Math.max(1, Math.round(actor.power * def.power * variance))
      b.log.push(`${actor.name}的${def.name} → ${t.name} −${dealt}`)
      damage(b, t, dealt)
    }
  }

  if (def.heal) {
    for (const t of targets) {
      const healed = Math.round(actor.power * def.heal)
      t.hp = Math.min(t.maxHp, t.hp + healed)
      b.log.push(`${actor.name}的${def.name} → ${t.name} +${healed}`)
    }
  }

  if (def.delay) {
    for (const t of targets) {
      if (t.id === actor.id && def.target === 'allAllies') continue
      t.nextAt = Math.max(0, t.nextAt + def.delay)
    }
    if (!def.power && !def.heal) {
      b.log.push(`${actor.name}使用了${def.name}。`)
    }
  }

  if (actor.uses[skillId] !== undefined) actor.uses[skillId] = (actor.uses[skillId] ?? 1) - 1

  actor.nextAt += TICK / actor.speed + (def.recoil ?? 0)
  b.awaiting = null

  advance(b)
  return { ok: true }
}

export function flee(b: BattleState): void {
  if (b.over) return
  b.over = 'flee'
  b.awaiting = null
  // 逃跑永遠是有效選項，且不該被懲罰得太重（企劃書 12-2）
  b.log.push('全隊退開了。深淵不是競技場。')
}

// ─── 敵人 ────────────────────────────────────────────────────

function enemyAct(b: BattleState, actor: Combatant): void {
  const def = actor.enemyId ? enemyById(actor.enemyId) : undefined
  const targets = living(b, 'party')
  if (targets.length === 0) return

  // 蓄力中 → 這次打出重擊
  if (actor.charging > 0) {
    const multiplier = actor.charging
    actor.charging = 0
    const t = targets[roll(b, 0, targets.length - 1)] as Combatant
    const dealt = Math.max(1, Math.round(actor.power * multiplier))
    b.log.push(`${actor.name}放出了蓄積的力量 → ${t.name} −${dealt}`)
    damage(b, t, dealt)
    actor.nextAt += TICK / actor.speed
    return
  }

  // 準備蓄力
  if (def && def.windup > 0 && roll(b, 1, 100) <= 35) {
    actor.charging = def.windup
    b.log.push(`${actor.name}安靜下來了。有什麼正在聚集。`)
    actor.nextAt += TICK / actor.speed
    return
  }

  // 屍蠟哭鴉專找傷得最重的人
  const target =
    def?.effect === 'mimic'
      ? targets.reduce((a, c) => (c.hp < a.hp ? c : a), targets[0] as Combatant)
      : (targets[roll(b, 0, targets.length - 1)] as Combatant)

  const variance = roll(b, 85, 115) / 100
  const dealt = Math.max(1, Math.round(actor.power * variance))

  if (def?.effect === 'mimic') {
    b.log.push(`${actor.name}用某個人的聲音叫了${target.name}。 −${dealt}`)
  } else {
    b.log.push(`${actor.name} → ${target.name} −${dealt}`)
  }
  damage(b, target, dealt)

  if (def?.effect === 'poison' && target.status === 'alive') {
    const amount = roll(b, 1, 2)
    b.effects.push({ kind: 'poison', charId: target.id, amount })
    b.log.push(`毒素滲進去了。${target.name}的耐受度掉了 ${amount}。`)
  }

  if (def?.effect === 'devour' && roll(b, 1, 100) <= 40) {
    b.effects.push({ kind: 'devour' })
    b.log.push(`${actor.name}咬破了背包。`)
  }

  actor.nextAt += TICK / actor.speed
}

// ─── 推進 ────────────────────────────────────────────────────

function checkEnd(b: BattleState): void {
  if (b.over) return
  if (living(b, 'enemy').length === 0) {
    b.over = 'win'
    b.awaiting = null
    b.log.push('周圍安靜下來了。')
    return
  }
  if (living(b, 'party').length === 0) {
    b.over = 'wipe'
    b.awaiting = null
  }
}

/** 一路跑到輪某個隊員行動，或者戰鬥結束 */
function advance(b: BattleState): void {
  checkEnd(b)
  let guard = 0

  while (!b.over && !b.awaiting && guard++ < 500) {
    const next = order(b)[0]
    if (!next) break

    if (next.side === 'party') {
      b.awaiting = next.id
      return
    }

    enemyAct(b, next)
    checkEnd(b)
  }
}
