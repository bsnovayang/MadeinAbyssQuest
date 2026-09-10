import { CURSE_AFFLICTIONS, effectiveStats } from './affliction'
import { layerAt } from './depth'
import { nextInt, pick } from './rng'
import type { Character, LostSoul, MemorialEntry, RunState } from './types'
import { RECRUIT_NAMES } from '../data/names'
import { startingParty } from '../data/party'

export interface MetaState {
  roster: Character[]
  graveyard: MemorialEntry[]
  lostSouls: LostSoul[]
  /** 孤兒院目前有的孩子。招募是選擇，不是抽獎 */
  applicants: Character[]
  funds: number
  runIndex: number
  rngState: number
}

export const PARTY_SIZE = 4

export function createMeta(rngState = 20260910): MetaState {
  const meta: MetaState = {
    roster: startingParty(),
    graveyard: [],
    lostSouls: [],
    applicants: [],
    funds: 0,
    runIndex: 0,
    rngState,
  }
  refreshApplicants(meta)
  return meta
}

/** 舊存檔缺少後來才加上的欄位，讀取時補齊 */
export function normalizeMeta(meta: MetaState): MetaState {
  meta.applicants ??= []
  meta.lostSouls ??= []
  meta.graveyard ??= []
  for (const c of [...meta.roster, ...meta.applicants]) {
    c.afflictions ??= []
    c.bonds ??= {}
  }
  refreshApplicants(meta)
  return meta
}

export function availableMembers(meta: MetaState): Character[] {
  return meta.roster.filter((c) => c.status === 'alive')
}

// ─── 羈絆 ────────────────────────────────────────────────────

export function bondBetween(a: Character, b: Character): number {
  return a.bonds[b.id] ?? 0
}

/**
 * 羈絆換算成耐受度：一起活著回來過的人，比較撐得住。
 *
 * 它直接接進撤離系統（第 7 章），因此玩家會在最痛的地方感覺到
 * 自己失去了什麼 —— 而不是只在數字上看到。
 */
export function bondBonus(member: Character, party: readonly Character[]): number {
  let total = 0
  for (const other of party) {
    if (other.id === member.id) continue
    total += Math.floor(bondBetween(member, other) / 2)
  }
  return Math.min(6, total)
}

// ─── 出發 ────────────────────────────────────────────────────

/**
 * 把名冊上的人換算成這一趟的實際狀態。
 * 永久損傷與羈絆都在這裡結算，因此 run 層拿到的永遠是單純的數字。
 */
export function deployParty(meta: MetaState, ids: readonly string[]): Character[] {
  const chosen = ids
    .map((id) => meta.roster.find((c) => c.id === id))
    .filter((c): c is Character => !!c && c.status === 'alive')

  return chosen.map((c) => {
    const stats = effectiveStats(c)
    const bonus = bondBonus(c, chosen)
    return {
      ...c,
      bonds: { ...c.bonds },
      afflictions: [...c.afflictions],
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      tolerance: stats.maxTolerance + bonus,
      maxTolerance: stats.maxTolerance + bonus,
      carryCapacity: stats.carryCapacity,
    }
  })
}

// ─── 回收 ────────────────────────────────────────────────────

export interface RunSummary {
  surfaced: boolean
  earned: number
  survivors: string[]
  dead: string[]
  lost: string[]
  buried: string[]
  newAfflictions: { name: string; affliction: string }[]
}

/**
 * 一趟探索的結算：羈絆、永久損傷、墓地、資金。
 * 這是 M3 的核心 —— 沒有這一步，犧牲隊友就只是點掉一個單位。
 */
export function concludeRun(meta: MetaState, run: RunState): RunSummary {
  const surfaced = run.endReason === 'surfaced'
  const summary: RunSummary = {
    surfaced,
    earned: 0,
    survivors: [],
    dead: [],
    lost: [],
    buried: [],
    newAfflictions: [],
  }

  meta.runIndex += 1

  const buriedIds = new Set(
    surfaced
      ? run.carried.filter((i) => i.kind === 'corpse' && i.ownerId).map((i) => i.ownerId as string)
      : [],
  )

  const survivors = run.party.filter((c) => c.status === 'alive')
  const fallen = run.party.filter((c) => c.status !== 'alive')

  // 只有活著回到地表，戰利品才算數（企劃書 9-2）
  if (surfaced) {
    summary.earned = run.carried
      .filter((i) => i.kind !== 'corpse')
      .reduce((sum, i) => sum + i.value, 0)
    meta.funds += summary.earned
  }

  for (const c of fallen) {
    const entry = meta.roster.find((r) => r.id === c.id)
    const buried = buriedIds.has(c.id)
    const cause = c.status === 'lost' && !buried ? 'lost' : 'dead'

    if (entry) entry.status = c.status === 'lost' && !buried ? 'lost' : 'dead'

    meta.graveyard.push({
      name: c.name,
      depth: Math.round(run.maxDepthReached),
      cause,
      buried,
      runIndex: meta.runIndex,
    })

    if (buried) summary.buried.push(c.name)
    if (cause === 'lost') {
      summary.lost.push(c.name)
      // 被留在深淵的人日後會回來（M5）
      meta.lostSouls.push({ name: c.name, depth: Math.round(run.maxDepthReached) })
    } else {
      summary.dead.push(c.name)
    }

    // 失去的重量由關係決定，而不是由人數決定
    for (const s of survivors) {
      const entryS = meta.roster.find((r) => r.id === s.id)
      if (!entryS) continue
      const bond = bondBetween(s, c)
      if (bond >= 2) entryS.afflictions.push('grief')
      // 沒有帶回來的，痛得更久
      if (!buried && bond >= 2) entryS.afflictions.push('grief')
    }
  }

  if (surfaced) {
    for (const s of survivors) {
      const entry = meta.roster.find((r) => r.id === s.id)
      if (!entry) continue
      summary.survivors.push(s.name)
      entry.status = 'alive'

      // 一起活著回來 → 羈絆 +1
      for (const other of survivors) {
        if (other.id === s.id) continue
        entry.bonds[other.id] = (entry.bonds[other.id] ?? 0) + 1
      }

      // 深層的負荷會留下痕跡
      const affliction = rollAffliction(meta, s, run)
      if (affliction) {
        entry.afflictions.push(affliction)
        summary.newAfflictions.push({ name: s.name, affliction })
      }
    }
  }

  return summary
}

function rollAffliction(meta: MetaState, member: Character, run: RunState): string | null {
  if (member.immuneToCurse) return null

  const layer = layerAt(run.maxDepthReached).id
  const pool = CURSE_AFFLICTIONS[layer] ?? []
  if (pool.length === 0) return null

  // 撐得越勉強，留下痕跡的機率越高
  const strain = 1 - member.tolerance / Math.max(1, member.maxTolerance)
  const chance = Math.min(0.9, strain * (0.3 + layer * 0.1))

  const [roll, s1] = nextInt(meta.rngState, 1, 100)
  meta.rngState = s1
  if (roll > chance * 100) return null

  const [id, s2] = pick(meta.rngState, pool)
  meta.rngState = s2
  return id
}

// ─── 招募 ────────────────────────────────────────────────────

/** 孤兒院同時會有幾個孩子等著 */
export const APPLICANT_SLOTS = 3

/** 低於這個人數，孤兒院會免費補人 */
export const ROSTER_FLOOR = 3

/**
 * 招募費用由能力決定，所以「錢」變成一個真的選擇：
 * 便宜但撐不住的孩子，還是貴但可靠的人。
 */
export function hireCost(c: Character): number {
  return 100 + (c.maxHp + c.maxTolerance + c.carryCapacity) * 5
}

export function refreshApplicants(meta: MetaState): void {
  while (meta.applicants.length < APPLICANT_SLOTS) {
    meta.applicants.push(makeRecruit(meta))
  }
}

/** 付錢帶走指定的孩子。名額會由新的人補上 */
export function hire(meta: MetaState, applicantId: string): Character | null {
  const idx = meta.applicants.findIndex((c) => c.id === applicantId)
  const candidate = meta.applicants[idx]
  if (!candidate) return null

  const cost = hireCost(candidate)
  if (meta.funds < cost) return null

  meta.funds -= cost
  meta.applicants.splice(idx, 1)
  meta.roster.push(candidate)
  refreshApplicants(meta)
  return candidate
}

/**
 * 破產保底（企劃書 11-7）。
 *
 * 沒有這道保底，一次全滅之後玩家會陷入死亡螺旋：沒錢招募 → 只有一個人能下去
 * → 又死掉 → 墓地多一行。遊戲不該結束，但也不該變成徒勞的跑步機。
 *
 * 孤兒院不收錢，因為它本來就不是生意。
 */
export function replenish(meta: MetaState): Character[] {
  const added: Character[] = []
  while (availableMembers(meta).length < ROSTER_FLOOR) {
    const member = recruit(meta)
    if (!member) break
    added.push(member)
  }
  return added
}

/** 孤兒院永遠會給你新的孩子（企劃書 11-7）。免費補人用，不經過孤兒院名額 */
export function recruit(meta: MetaState): Character | null {
  const member = makeRecruit(meta)
  meta.roster.push(member)
  return member
}

function makeRecruit(meta: MetaState): Character {
  const used = new Set([...meta.roster, ...meta.applicants].map((c) => c.name))
  const pool = RECRUIT_NAMES.filter((n) => !used.has(n))
  const [name, s1] = pool.length
    ? pick(meta.rngState, pool)
    : [`探窟家 ${meta.roster.length + 1}`, meta.rngState]
  meta.rngState = s1

  const [hp, s2] = nextInt(meta.rngState, 14, 22)
  const [tol, s3] = nextInt(s2, 8, 16)
  const [cap, s4] = nextInt(s3, 12, 22)
  meta.rngState = s4

  return {
    id: `r${meta.runIndex}-${meta.roster.length}-${meta.applicants.length}-${Math.round(meta.rngState % 99991)}`,
    name,
    hp,
    maxHp: hp,
    tolerance: tol,
    maxTolerance: tol,
    carryCapacity: cap,
    immuneToCurse: false,
    status: 'alive',
    afflictions: [],
    bonds: {},
  }
}
