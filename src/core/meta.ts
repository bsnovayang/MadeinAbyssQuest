import { CURSE_AFFLICTIONS, effectiveStats } from './affliction'
import { layerAt } from './depth'
import { nextInt, pick } from './rng'
import {
  evaluateQuest,
  generateQuest,
  MAX_ACTIVE_QUESTS,
  QUEST_OFFERS,
  type Quest,
} from './quests'
import { COMMON_TRAITS } from './traits'
import type {
  Character,
  Item,
  LostSoul,
  MemorialEntry,
  RunState,
  Supplies,
  SupplyKey,
} from './types'
import { RECRUIT_BIOS } from '../data/bios'
import { RECRUIT_NAMES } from '../data/names'
import { baseFee, BASES, type BaseDef } from '../data/bases'
import { RANKS, rankAt, type RankDef } from '../data/ranks'
import { relicById } from '../data/relics'
import { startingParty, startingSupplies } from '../data/party'

export interface MetaState {
  roster: Character[]
  graveyard: MemorialEntry[]
  lostSouls: LostSoul[]
  /** 孤兒院目前有的孩子。招募是選擇，不是抽獎 */
  applicants: Character[]
  /** 下一趟要帶的補給。出發時才付錢 */
  loadout: Supplies
  /** 帶回地表的遺物。不會自動變賣，要鑑定或處理掉 */
  vault: Item[]
  /** 下一趟要帶下去的遺物 id */
  takeDown: string[]
  /** 已解鎖的前線基地所在層 */
  bases: number[]
  /** 下一趟的出發深度。0 = 從地表走下去 */
  departDepth: number
  funds: number
  /** 地表的日期。委託期限與休養都靠它推進 */
  day: number
  /** 目前的笛階級（見 data/ranks.ts） */
  rankIndex: number
  /** 已完成的委託數，晉升的條件之一 */
  questsCompleted: number
  /** 委託公告板與已承接的委託 */
  quests: Quest[]
  nextQuestId: number
  runIndex: number
  /** 活著回到地表的次數 */
  runsSurvived: number
  /** 歷來抵達過的最深深度 */
  deepestReached: number
  /** 累計帶回地表的價值 */
  totalEarned: number
  rngState: number
}

export const PARTY_SIZE = 4

/**
 * 補給不再是免費配給的。
 *
 * 錢限制的是前期「買不買得起」，負重限制的是全程「帶不帶得動」——
 * 兩者一起，「帶多少補給下去」才是一個真的決策（企劃書 8-1）。
 */
export const SUPPLY_PRICE: Readonly<Record<SupplyKey, number>> = {
  food: 12,
  water: 8,
  rope: 20,
  medicine: 45,
}

export const SUPPLY_REFUND = 0.5

export function loadoutCost(supplies: Supplies): number {
  return (Object.keys(SUPPLY_PRICE) as SupplyKey[]).reduce(
    (sum, k) => sum + supplies[k] * SUPPLY_PRICE[k],
    0,
  )
}

/** 探窟家組合的最低配給。低到不夠深潛，但足以再賺一趟 */
export const MINIMUM_KIT: Supplies = { food: 4, water: 8, rope: 1, medicine: 0 }

/**
 * 補給版的破產保底（企劃書 11-7、11-8）。
 *
 * 沒有這道保底，全滅之後會出現第二種死亡螺旋：沒錢 → 買不起補給 →
 * 空手下去 → 又死。孤兒院保證有人，組合保證那些人身上有水。
 */
export function guildSubsidy(meta: MetaState): boolean {
  const floor = loadoutCost(MINIMUM_KIT)
  if (meta.funds >= floor) return false
  meta.funds = floor
  return true
}

export function adjustLoadout(meta: MetaState, key: SupplyKey, delta: number): void {
  const next = Math.max(0, Math.min(99, meta.loadout[key] + delta))
  const candidate = { ...meta.loadout, [key]: next }
  // 基地維護費也算在這一趟的花費裡
  if (delta > 0 && loadoutCost(candidate) + departFee(meta) > meta.funds) return
  meta.loadout[key] = next
}

export function createMeta(rngState = 20260910): MetaState {
  const meta: MetaState = {
    roster: startingParty(),
    graveyard: [],
    lostSouls: [],
    applicants: [],
    loadout: startingSupplies(),
    vault: [],
    takeDown: [],
    bases: [],
    departDepth: 0,
    // 第一趟的本錢。之後就得自己賺
    funds: 700,
    day: 1,
    rankIndex: 0,
    questsCompleted: 0,
    quests: [],
    nextQuestId: 1,
    runIndex: 0,
    runsSurvived: 0,
    deepestReached: 0,
    totalEarned: 0,
    rngState,
  }
  refreshApplicants(meta)
  refreshQuests(meta)
  return meta
}

/** 舊存檔缺少後來才加上的欄位，讀取時補齊 */
export function normalizeMeta(meta: MetaState): MetaState {
  meta.applicants ??= []
  meta.lostSouls ??= []
  meta.graveyard ??= []
  meta.loadout ??= startingSupplies()
  meta.runsSurvived ??= 0
  meta.deepestReached ??= 0
  meta.totalEarned ??= 0
  meta.day ??= 1
  meta.rankIndex ??= 0
  meta.questsCompleted ??= 0
  meta.quests ??= []
  meta.nextQuestId ??= 1
  meta.bases ??= []
  meta.departDepth ??= 0
  meta.vault ??= []
  meta.takeDown ??= []
  for (const c of [...meta.roster, ...meta.applicants]) {
    c.afflictions ??= []
    c.traits ??= []
    c.bonds ??= {}
    c.bio ??= ''
  }
  refreshApplicants(meta)
  return meta
}

export function availableMembers(meta: MetaState): Character[] {
  return meta.roster.filter((c) => c.status === 'alive')
}

// ─── 階級 ────────────────────────────────────────────────────

export function currentRank(meta: MetaState): RankDef {
  return rankAt(meta.rankIndex)
}

export function nextRank(meta: MetaState): RankDef | null {
  return meta.rankIndex + 1 < RANKS.length ? rankAt(meta.rankIndex + 1) : null
}

export function canPromote(meta: MetaState): boolean {
  const next = nextRank(meta)
  if (!next) return false
  return meta.questsCompleted >= next.quests && meta.deepestReached >= next.depth
}

export function promote(meta: MetaState): RankDef | null {
  if (!canPromote(meta)) return null
  meta.rankIndex += 1
  refreshQuests(meta)
  return currentRank(meta)
}

export function rosterCap(meta: MetaState): number {
  return currentRank(meta).rosterCap
}

// ─── 遺物保管與鑑定 ──────────────────────────────────────────

/**
 * 未鑑定的遺物賣不了好價錢 ——
 * 鑑定師的價值不只是「告訴你那是什麼」，也是「讓你賣得掉」。
 * 因此就算玩家背熟了外觀，鑑定仍然有經濟上的意義。
 */
export const UNIDENTIFIED_RATE = 0.3
export const IDENTIFY_RATE = 0.25

export function identifyCost(item: Item): number {
  return Math.max(50, Math.round(item.value * IDENTIFY_RATE))
}

export function sellValue(item: Item): number {
  return item.identified ? item.value : Math.round(item.value * UNIDENTIFIED_RATE)
}

export function identifyRelic(meta: MetaState, id: string): boolean {
  const item = meta.vault.find((i) => i.id === id)
  if (!item || item.identified) return false

  const cost = identifyCost(item)
  if (meta.funds < cost) return false

  meta.funds -= cost
  item.identified = true
  const def = item.relicId ? relicById(item.relicId) : undefined
  if (def) item.name = def.name
  return true
}

export function sellRelic(meta: MetaState, id: string): boolean {
  const idx = meta.vault.findIndex((i) => i.id === id)
  const item = meta.vault[idx]
  if (!item) return false

  meta.funds += sellValue(item)
  meta.vault.splice(idx, 1)
  meta.takeDown = meta.takeDown.filter((x) => x !== id)
  return true
}

export function toggleTakeDown(meta: MetaState, id: string): void {
  if (!meta.vault.some((i) => i.id === id)) return
  meta.takeDown = meta.takeDown.includes(id)
    ? meta.takeDown.filter((x) => x !== id)
    : [...meta.takeDown, id]
}

export function relicsToTake(meta: MetaState): Item[] {
  return meta.vault.filter((i) => meta.takeDown.includes(i.id))
}

export function takeDownWeight(meta: MetaState): number {
  return relicsToTake(meta).reduce((sum, i) => sum + i.weight, 0)
}

/** 出發時把選定的遺物從倉庫搬進背包。死在下面就再也拿不回來 */
export function withdrawRelics(meta: MetaState): Item[] {
  const taken = relicsToTake(meta)
  meta.vault = meta.vault.filter((i) => !meta.takeDown.includes(i.id))
  meta.takeDown = []
  return taken.map((i) => ({ ...i }))
}

// ─── 前線基地 ────────────────────────────────────────────────

export function unlockedBases(meta: MetaState): BaseDef[] {
  return BASES.filter((b) => meta.bases.includes(b.layer))
}

/**
 * 基地不是打下來的，是活著回來換的。
 *
 * 抵達某一層並且回到地表，那一層的基地就開放 ——
 * 在這個遊戲裡，「回得來」本身就是最難的成就。
 */
export function unlockBases(meta: MetaState, maxDepthReached: number): BaseDef[] {
  const opened: BaseDef[] = []
  for (const base of BASES) {
    if (meta.bases.includes(base.layer)) continue
    if (maxDepthReached < base.depth) continue
    meta.bases.push(base.layer)
    opened.push(base)
  }
  return opened
}

/** 從基地出發要付的維護費。從地表走下去永遠免費 */
export function departFee(meta: MetaState): number {
  return meta.departDepth > 0 ? baseFee(meta.departDepth) : 0
}

export function setDepartDepth(meta: MetaState, depth: number): void {
  if (depth === 0) {
    meta.departDepth = 0
    return
  }
  const base = BASES.find((b) => b.depth === depth)
  if (!base || !meta.bases.includes(base.layer)) return
  meta.departDepth = depth
}

/** 出發的總花費：補給加上基地維護費 */
export function departCost(meta: MetaState): number {
  return loadoutCost(meta.loadout) + departFee(meta)
}

// ─── 時間與休養 ──────────────────────────────────────────────

/** 低於這個比例的人不能出勤（企劃書 11-3） */
export const DEPLOY_HP_RATIO = 0.5

export function isFit(c: Character): boolean {
  return c.status === 'alive' && c.hp >= effectiveStats(c).maxHp * DEPLOY_HP_RATIO
}

export function deployableMembers(meta: MetaState): Character[] {
  return meta.roster.filter(isFit)
}

/**
 * 讓地表的時間前進。
 * 傷員會慢慢恢復，過期的委託會消失 —— 等待從來不是免費的。
 */
export function advanceDays(meta: MetaState, days = 1): void {
  meta.day += days

  for (const c of meta.roster) {
    if (c.status !== 'alive') continue
    const max = effectiveStats(c).maxHp
    c.hp = Math.min(max, c.hp + Math.ceil(max * 0.25) * days)
  }

  const before = meta.quests.length
  meta.quests = meta.quests.filter((q) => q.deadline >= meta.day)
  if (meta.quests.length !== before) refreshQuests(meta)
  refreshQuests(meta)
}

// ─── 委託 ────────────────────────────────────────────────────

export function openQuests(meta: MetaState): Quest[] {
  return meta.quests.filter((q) => q.state === 'open')
}

export function activeQuests(meta: MetaState): Quest[] {
  return meta.quests.filter((q) => q.state === 'taken')
}

export function refreshQuests(meta: MetaState): void {
  const tier = currentRank(meta).questTier
  while (openQuests(meta).length < QUEST_OFFERS) {
    const [quest, s] = generateQuest(meta.rngState, meta.nextQuestId, tier, meta.day)
    meta.rngState = s
    meta.nextQuestId += 1
    meta.quests.push(quest)
  }
}

export function takeQuest(meta: MetaState, id: string): boolean {
  if (activeQuests(meta).length >= MAX_ACTIVE_QUESTS) return false
  const quest = meta.quests.find((q) => q.id === id && q.state === 'open')
  if (!quest) return false
  quest.state = 'taken'
  refreshQuests(meta)
  return true
}

export function abandonQuest(meta: MetaState, id: string): boolean {
  const idx = meta.quests.findIndex((q) => q.id === id && q.state === 'taken')
  if (idx < 0) return false
  meta.quests.splice(idx, 1)
  refreshQuests(meta)
  return true
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
    .filter((c): c is Character => !!c && isFit(c))

  return chosen.map((c) => {
    const stats = effectiveStats(c)
    const bonus = bondBonus(c, chosen)
    return {
      ...c,
      bonds: { ...c.bonds },
      afflictions: [...c.afflictions],
      traits: [...c.traits],
      // 傷還沒好就出勤，那是玩家自己的選擇
      hp: Math.min(c.hp, stats.maxHp),
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
  /** 沒用完的補給賣回來的錢 */
  refunded: number
  /** 完成的委託 */
  questsDone: { title: string; reward: number }[]
  /** 逾期或失敗而失去的委託 */
  questsFailed: string[]
  daysSpent: number
  promoted: string | null
  /** 這一趟開放的前線基地 */
  basesOpened: string[]
  /** 帶回地表、進了倉庫的遺物 */
  relicsKept: string[]
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
    refunded: 0,
    questsDone: [],
    questsFailed: [],
    daysSpent: 0,
    promoted: null,
    basesOpened: [],
    relicsKept: [],
    survivors: [],
    dead: [],
    lost: [],
    buried: [],
    newAfflictions: [],
  }

  meta.runIndex += 1
  meta.deepestReached = Math.max(meta.deepestReached, Math.round(run.maxDepthReached))
  if (surfaced) meta.runsSurvived += 1

  // 一趟至少花掉一天，紮營過的每一夜都要算
  summary.daysSpent = Math.max(1, run.daysElapsed)
  meta.day += summary.daysSpent

  const buriedIds = new Set(
    surfaced
      ? run.carried.filter((i) => i.kind === 'corpse' && i.ownerId).map((i) => i.ownerId as string)
      : [],
  )

  const survivors = run.party.filter((c) => c.status === 'alive')
  const fallen = run.party.filter((c) => c.status !== 'alive')
  const deployedCount = run.party.length

  // 只有活著回到地表，戰利品才算數（企劃書 9-2）
  if (surfaced) {
    summary.earned = run.carried
      .filter((i) => i.kind === 'loot')
      .reduce((sum, i) => sum + i.value, 0)

    // 遺物不自動變賣，先進倉庫等鑑定
    for (const item of run.carried.filter((i) => i.kind === 'relic')) {
      meta.vault.push({ ...item, id: `v${meta.runIndex}-${meta.vault.length}` })
      summary.relicsKept.push(item.identified ? item.name : '未鑑定的遺物')
    }
    // 沒用完的補給賣回給補給商。全滅的話當然什麼都沒有
    summary.refunded = Math.floor(loadoutCost(run.supplies) * SUPPLY_REFUND)
    meta.funds += summary.earned + summary.refunded
    meta.totalEarned += summary.earned
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
      // 傷勢帶回地表。沒有休養就出勤，下一趟會更危險
      entry.hp = Math.max(1, s.hp)

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

  if (surfaced) {
    for (const base of unlockBases(meta, run.maxDepthReached)) {
      summary.basesOpened.push(base.name)
    }
  }

  settleQuests(meta, run, summary, deployedCount)

  const rank = promote(meta)
  if (rank) summary.promoted = rank.name

  refreshQuests(meta)
  return summary
}

/**
 * 委託驗收。承接的委託只有兩種下場：這一趟達成，或者失去。
 * 沒有「下次再說」—— 否則接下委託就沒有風險。
 */
function settleQuests(
  meta: MetaState,
  run: RunState,
  summary: RunSummary,
  deployed: number,
): void {
  for (const quest of activeQuests(meta)) {
    if (evaluateQuest(quest, run, deployed)) {
      meta.funds += quest.reward
      meta.questsCompleted += 1
      summary.questsDone.push({ title: quest.title, reward: quest.reward })
    } else {
      summary.questsFailed.push(quest.title)
    }
  }

  meta.quests = meta.quests.filter((q) => q.state !== 'taken')
  // 這一趟花掉的日子可能已經讓公告板上的委託過期
  meta.quests = meta.quests.filter((q) => q.deadline >= meta.day)
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
  if (meta.roster.filter((c) => c.status === 'alive').length >= rosterCap(meta)) return null

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
  guildSubsidy(meta)
  clampLoadoutToFunds(meta)

  const added: Character[] = []
  while (availableMembers(meta).length < ROSTER_FLOOR) {
    const member = recruit(meta)
    if (!member) break
    added.push(member)
  }
  return added
}

/** 資金縮水時，把上次的採購單自動調降到買得起的範圍 */
export function clampLoadoutToFunds(meta: MetaState): void {
  const order: SupplyKey[] = ['medicine', 'rope', 'food', 'water']
  for (const key of order) {
    while (departCost(meta) > meta.funds && meta.loadout[key] > 0) {
      meta.loadout[key] -= 1
    }
  }
  // 連最低配給都付不起，就只好從地表走下去
  if (departCost(meta) > meta.funds) meta.departDepth = 0
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
  const [bio, s5] = pick(s4, RECRUIT_BIOS)
  meta.rngState = s5

  return {
    bio,
    traits: rollTraits(meta),
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

/**
 * 孤兒院的孩子只拿得到 common 特質，永遠不會有招牌能力。
 *
 * 如果隨機來的孩子也有帥氣技能，具名角色就失去份量，
 * 而「犧牲隊友」在算計上會變得太划算。
 * 但特質仍然讓玩家記得住某幾個名字（見 角色.md）。
 */
function rollTraits(meta: MetaState): string[] {
  const [count, s1] = nextInt(meta.rngState, 1, 2)
  meta.rngState = s1

  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    const pool = COMMON_TRAITS.filter((t) => !picked.includes(t.id))
    if (pool.length === 0) break
    const [t, s] = pick(meta.rngState, pool)
    meta.rngState = s
    picked.push(t.id)
  }
  return picked
}
