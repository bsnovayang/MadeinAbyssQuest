import { formatDepth, layerAt } from './depth'
import { nextInt, pick } from './rng'
import type { RunState } from './types'

export type QuestKind = 'reach' | 'collect' | 'relic' | 'allSurvive' | 'bury'

export interface Quest {
  id: string
  kind: QuestKind
  title: string
  desc: string
  /** 必須抵達的深度 */
  minDepth: number
  /** 需要的數量（採集類） */
  target: number
  reward: number
  tier: number
  /** 到期日（絕對日數） */
  deadline: number
  state: 'open' | 'taken'
}

export const MAX_ACTIVE_QUESTS = 2
export const QUEST_OFFERS = 3

interface QuestTemplate {
  kind: QuestKind
  title: (depth: number, target: number) => string
  desc: (depth: number, target: number) => string
  /** 相對於基準報酬的倍率 */
  payout: number
  targetRange?: [number, number]
}

const TEMPLATES: readonly QuestTemplate[] = [
  {
    kind: 'reach',
    payout: 1,
    title: (d) => `抵達 ${formatDepth(d)}`,
    desc: (d) => `下潛到 ${formatDepth(d)} 以下，然後活著回來。組合要的是紀錄，不是東西。`,
  },
  {
    kind: 'collect',
    payout: 1.3,
    targetRange: [2, 4],
    title: (d, n) => `從 ${formatDepth(d)} 帶回 ${n} 件`,
    desc: (d, n) => `在 ${formatDepth(d)} 以下取得 ${n} 件戰利品並帶回地表。`,
  },
  {
    kind: 'relic',
    payout: 1.8,
    title: (d) => `從 ${formatDepth(d)} 帶回遺物`,
    desc: (d) => `在 ${formatDepth(d)} 以下找到一件遺物並帶回來。組合不問你怎麼拿到的。`,
  },
  {
    kind: 'allSurvive',
    payout: 1.6,
    title: (d) => `全員從 ${formatDepth(d)} 生還`,
    desc: (d) =>
      `下潛到 ${formatDepth(d)} 以下，帶著出發時的每一個人回來。一個都不能少。`,
  },
  {
    kind: 'bury',
    payout: 1.5,
    title: () => '把人帶回來安葬',
    desc: () =>
      '深淵裡有太多沒有名字的骨頭。這一趟不管走多深，請把倒下的人帶回地表。',
  },
]

/** 委託等級對應的深度區間 */
const TIER_DEPTH: readonly [number, number][] = [
  [400, 1200],
  [1600, 2600],
  [3000, 6800],
  [7500, 11800],
  [12200, 13000],
]

export function generateQuest(
  rngState: number,
  id: number,
  tier: number,
  today: number,
): [Quest, number] {
  let s = rngState
  const band = TIER_DEPTH[Math.max(0, Math.min(TIER_DEPTH.length - 1, tier - 1))] ?? [400, 1200]

  const [tpl, s1] = pick(s, TEMPLATES)
  s = s1
  const [depth, s2] = nextInt(s, band[0], band[1])
  s = s2

  const range = tpl.targetRange ?? [1, 1]
  const [target, s3] = nextInt(s, range[0], range[1])
  s = s3

  const [days, s4] = nextInt(s, 12, 26)
  s = s4

  // 報酬隨深度成長得比戰利品更快 —— 這才是往下走的理由（企劃書 8-4）
  const layer = layerAt(depth).id
  const base = 400 + depth * 0.55 + layer * layer * 130
  const reward = Math.round(base * tpl.payout * (tpl.targetRange ? target / 2 : 1))

  const quest: Quest = {
    id: `q${id}`,
    kind: tpl.kind,
    title: tpl.title(depth, target),
    desc: tpl.desc(depth, target),
    minDepth: tpl.kind === 'bury' ? 0 : depth,
    target,
    reward,
    tier,
    deadline: today + days,
    state: 'open',
  }

  return [quest, s]
}

export interface QuestOutcome {
  quest: Quest
  done: boolean
}

/**
 * 驗收。只有活著回到地表才算數 —— 死在下面的人交不出報告。
 */
export function evaluateQuest(quest: Quest, run: RunState, deployed: number): boolean {
  if (run.endReason !== 'surfaced') return false
  if (run.maxDepthReached < quest.minDepth) return false

  switch (quest.kind) {
    case 'reach':
      return true

    case 'collect':
      return run.carried.filter((i) => i.kind === 'loot').length >= quest.target

    case 'relic':
      return run.carried.some((i) => i.kind === 'relic')

    case 'allSurvive':
      return run.party.filter((c) => c.status === 'alive').length === deployed

    case 'bury':
      return run.carried.some((i) => i.kind === 'corpse')
  }
}

export function describeProgress(quest: Quest, run: RunState | null): string {
  if (!run) return ''
  const deep = run.maxDepthReached >= quest.minDepth
  const depthNote = quest.minDepth > 0 ? (deep ? '深度達成' : '深度未達') : ''

  switch (quest.kind) {
    case 'collect':
      return `${depthNote}　戰利品 ${run.carried.filter((i) => i.kind === 'loot').length}/${quest.target}`
    case 'relic':
      return `${depthNote}　${run.carried.some((i) => i.kind === 'relic') ? '已取得遺物' : '尚未取得遺物'}`
    case 'bury':
      return run.carried.some((i) => i.kind === 'corpse') ? '已帶著遺體' : '尚未有人倒下'
    default:
      return depthNote
  }
}
