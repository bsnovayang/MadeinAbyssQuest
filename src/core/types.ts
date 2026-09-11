import type { BattleState } from './battle'

export type Direction = 'down' | 'up'

export interface Character {
  id: string
  name: string
  /** 一句話的來歷。孤兒院的孩子也有，這是讓玩家記住名字的第一步 */
  bio: string
  hp: number
  /** 基礎值。永久損傷的扣減不寫進這裡，而是在出發時換算（見 core/meta.ts） */
  maxHp: number
  /** 負荷耐受度 */
  tolerance: number
  maxTolerance: number
  carryCapacity: number
  /** 雷格：機械之軀不受上升負荷影響 */
  immuneToCurse: boolean
  /** lost = 被留在深淵。不是死亡，日後可能以成之末端的身分再遇 */
  status: 'alive' | 'dead' | 'lost'
  /** 永久損傷的 id，跨場次保留。可重複（例如多次失去） */
  afflictions: string[]
  /** 探索用的被動能力（見 core/traits.ts）。具名角色的招牌能力也放這裡 */
  traits: string[]
  /** 與其他隊員的共同生還次數 */
  bonds: Record<string, number>
}

/**
 * 探索留下、要由城鎮結算的後果。
 * 遺物的代價常常超出一趟探索的範圍（十年、資金、永久損傷）。
 */
export type Aftermath =
  | { kind: 'affliction'; charId: string }
  | { kind: 'days'; amount: number }
  | { kind: 'fundsRatio'; ratio: number }
  | { kind: 'questsFail' }
  /** 放過火葬砲的檢修費。人活著回到奧斯城才收（企劃書 12-1c） */
  | { kind: 'repair'; charId: string; skillId: string; amount: number }

/** 被留在深淵的人。M5 會讓他們以成之末端的身分回來 */
export interface LostSoul {
  name: string
  depth: number
}

export interface MemorialEntry {
  name: string
  depth: number
  cause: 'dead' | 'lost'
  /** 遺體是否被帶回地表安葬 */
  buried: boolean
  runIndex: number
}

export type ItemKind = 'loot' | 'relic' | 'corpse'

export interface Item {
  id: string
  name: string
  weight: number
  kind: ItemKind
  /** 運回地表才能變現的價值 */
  value: number
  identified: boolean
  /** 對應 data/relics.ts 的定義 */
  relicId?: string
  /** 遺體所屬的隊員 id */
  ownerId?: string
}

export interface Supplies {
  food: number
  water: number
  rope: number
  medicine: number
}

export type SupplyKey = keyof Supplies

export type NodeKind =
  | 'empty'
  | 'forage'
  | 'rest'
  | 'obstacle'
  | 'encounter'
  | 'relic'
  | 'anchor'

export interface AbyssNode {
  id: string
  kind: NodeKind
  /** 抵達此節點後的深度（公尺） */
  depth: number
  label: string
}

/** 回饋層的語氣分類，決定筆記本上的呈現方式（見企劃書 16-1） */
export type LogTone = 'plain' | 'warm' | 'cold' | 'grim'

export interface LogEntry {
  id: number
  text: string
  tone: LogTone
  depth: number
}

export type RunEndReason = 'wiped' | 'surfaced' | null

/** 負荷承受方式。ward 需要持有「避咒之籠」 */
export type BurdenMode = 'spread' | 'ward'

export interface Burden {
  mode: BurdenMode
  targetId: string | null
}

export interface RunState {
  seed: string
  rngState: number
  depth: number
  maxDepthReached: number
  direction: Direction
  party: Character[]
  supplies: Supplies
  carried: Item[]
  /** 力竭進度。補給歸零後累積 */
  exhaustion: number
  daysElapsed: number
  burden: Burden
  /** 本次撤離已經走過的上升節點數 */
  ascentSteps: number
  /** 過去被留在深淵的人，會在探索中以聲音的形式出現 */
  echoes: LostSoul[]
  /** 進行中的戰鬥。不為 null 時，探索的一切都要等它結束 */
  battle: BattleState | null
  /** 昏睡中的隊員，以及還要揹著他走幾步（放完火葬砲的雷格） */
  sleepers: Record<string, number>
  /** 回到城裡才會結算的後果 */
  aftermath: Aftermath[]
  current: AbyssNode
  choices: AbyssNode[]
  log: LogEntry[]
  nextLogId: number
  nextNodeId: number
  over: boolean
  endReason: RunEndReason
}
