export type Direction = 'down' | 'up'

export interface Character {
  id: string
  name: string
  hp: number
  maxHp: number
  /** 負荷耐受度。M2 的撤離系統會用到，M1 僅顯示 */
  tolerance: number
  maxTolerance: number
  carryCapacity: number
  /** 雷格：機械之軀不受上升負荷影響 */
  immuneToCurse: boolean
  /** lost = 被留在深淵。不是死亡，日後可能以成之末端的身分再遇 */
  status: 'alive' | 'dead' | 'lost'
}

export type ItemKind = 'loot' | 'relic'

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
  current: AbyssNode
  choices: AbyssNode[]
  log: LogEntry[]
  nextLogId: number
  nextNodeId: number
  over: boolean
  endReason: RunEndReason
}
