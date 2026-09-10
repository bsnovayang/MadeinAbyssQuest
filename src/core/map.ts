import { advance, layerAt } from './depth'
import { nextInt, pick, pickWeighted } from './rng'
import type { AbyssNode, NodeKind } from './types'

const KINDS: readonly NodeKind[] = [
  'empty',
  'forage',
  'rest',
  'obstacle',
  'encounter',
  'relic',
  'anchor',
]

/** 「空節點」是刻意保留的 —— 深淵大部分時候只是安靜地很深（企劃書 9-6） */
const WEIGHTS: readonly number[] = [12, 20, 14, 12, 24, 8, 6]

const LABELS: Readonly<Record<NodeKind, readonly string[]>> = {
  empty: ['靜謐的岩棚', '無事的斜坡', '空曠的裂隙', '什麼也沒有的窪地'],
  forage: ['苔蘚叢生處', '滲水的岩壁', '菌類群落', '前人的補給箱'],
  rest: ['避風的凹穴', '乾燥的岩洞', '廢棄的營地'],
  obstacle: ['垂直斷崖', '崩落的通道', '橫亙的深溝'],
  encounter: ['濃重的獸臭', '被啃食的殘骸', '不祥的鳴叫', '新鮮的爪痕'],
  relic: ['半埋的金屬物', '發光的碎片', '奇異的容器'],
  anchor: ['鏽蝕的升降裝置', '固定用的鐵樁'],
}

export function makeNode(
  rngState: number,
  id: number,
  depth: number,
  kind: NodeKind,
): [AbyssNode, number] {
  const [label, s] = pick(rngState, LABELS[kind])
  return [{ id: `n${id}`, kind, depth, label }, s]
}

/**
 * 產生下一排的分岔選項。
 * 深度已知且固定，差異在於節點種類 —— 玩家選的是「風險」不是「距離」。
 */
export function generateChoices(
  rngState: number,
  nextNodeId: number,
  depth: number,
): { choices: AbyssNode[]; rngState: number; nextNodeId: number } {
  const nextDepth = advance(depth)
  let s = rngState
  let id = nextNodeId

  const [count, s1] = nextInt(s, 2, 3)
  s = s1

  const choices: AbyssNode[] = []
  const used = new Set<NodeKind>()

  for (let i = 0; i < count; i++) {
    let kind: NodeKind = 'empty'
    // 同一排避免重複種類，讓每個選擇都是不同的風險
    for (let attempt = 0; attempt < 8; attempt++) {
      const [k, s2] = pickWeighted(s, KINDS, WEIGHTS)
      s = s2
      kind = k
      if (!used.has(k)) break
    }
    used.add(kind)

    const [node, s3] = makeNode(s, id, nextDepth, kind)
    s = s3
    id += 1
    choices.push(node)
  }

  return { choices, rngState: s, nextNodeId: id }
}

export function describeLayer(depth: number): string {
  const layer = layerAt(depth)
  return `第${layer.id}層　${layer.name}`
}
