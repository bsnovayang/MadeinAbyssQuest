/**
 * 火葬砲代價組合的平衡觀測（非測試）。
 *   npx vite-node src/core/__tests__/knockout.stats.ts
 *
 * 兩種代價管不同的事（企劃書 12-1c）：
 * - 昏睡：這一趟裡的取捨 —— 接下來幾步沒有雷格
 * - 檢修費：整趟收益的取捨 —— 固定金額，淺層收益低所以不划算，深層救命時才放得下手
 *
 * 目標：
 * 1. 淺層不無腦放 —— 1,600m、2,800m 折返時「每場都放」的淨值低於「從不放」
 * 2. 深層值得放 —— 7,500m 折返時，至少有一種有節制的放法（深層開場放、限兩發、危急才放）淨值高於「從不放」
 * 3. 不是必用 —— 深層「每場都放」不是最好的玩法
 *
 * 淨值 = 帶回的戰利品 − 檢修費 − 死亡人數 × DEATH_COST。
 * 不算死亡的話，「放了保住人命」的價值會被低估。
 *
 * 之前淘汰的代價：負重 +12～22kg、失去揹負量、每步多耗水 ——
 * 深層的負重與水本來就很緊，會連鎖丟東西，打贏了還是得回去。
 */
import { awaitingActor, living, skillsOfActor, type BattleState, type Combatant } from '../battle'
import { formatDepth, layerAt } from '../depth'
import {
  aliveMembers,
  battleAct,
  battleFlee,
  beginAscent,
  camp,
  canCamp,
  createRun,
  dropItem,
  dropSupply,
  encumbranceOfRun,
  moveTo,
  totalValue,
} from '../run'
import type { RunState, SupplyKey } from '../types'
import { KNOCKOUT, skillById } from '../../data/skills'

type Policy = 'never' | 'always' | 'clutch' | 'deep' | 'deep2'

/** 失去一個人的代價，約等於招募一個孩子（hireCost 約 360） */
const DEATH_COST = 400
/** 具名角色與羈絆的價值不只一筆招募費，另外看死亡算重一點時結論會不會翻轉 */
const DEATH_COST_HIGH = 800

interface Tally {
  survived: number
  loot: number
  fees: number
  deaths: number
  shots: number
}

const INCINERATE = skillById('incinerate')!

/**
 * 危急才放：隊伍剩不到一半血，而且至少燒得死一隻（通常太晚，那場已經救不回來）
 * 深層開場放：第 1～3 層忍住，第 4 層起開場就放 —— 企劃上希望玩家學會的打法
 * 深層限兩發：同上，但一趟最多兩發
 */
function shouldFire(policy: Policy, b: BattleState, reg: Combatant, shots: number): boolean {
  if (policy === 'never') return false
  if (policy === 'always') return true
  if (policy === 'deep') return b.layer >= 4
  if (policy === 'deep2') return b.layer >= 4 && shots < 2

  const least = Math.round(reg.power * (INCINERATE.power ?? 0) * 0.85)
  const party = living(b, 'party')
  const hpShare = party.reduce((a, c) => a + c.hp, 0) / party.reduce((a, c) => a + c.maxHp, 1)
  return hpShare < 0.5 && living(b, 'enemy').some((e) => e.hp <= least)
}

function fight(s: RunState, policy: Policy, shots: { n: number }): void {
  let guard = 0
  while (s.battle && !s.battle.over && guard++ < 300) {
    const b = s.battle
    const actor = awaitingActor(b)
    if (!actor) break
    const options = skillsOfActor(actor)

    if (options.some((o) => o.id === 'incinerate') && shouldFire(policy, b, actor, shots.n)) {
      battleAct(s, 'incinerate', null)
      shots.n++
      continue
    }

    const hurt = living(b, 'party')
      .filter((c) => c.hp < c.maxHp * 0.4)
      .sort((a, c) => a.hp - c.hp)[0]
    const heal = options.find((o) => o.heal && (o.medicine ?? 0) <= s.supplies.medicine)
    if (hurt && heal) {
      battleAct(s, heal.id, hurt.id)
      continue
    }

    const attack = options
      .filter((o) => o.power && o.target === 'enemy')
      .sort((a, c) => (c.power ?? 0) - (a.power ?? 0))[0]
    const foe = living(b, 'enemy').sort((a, c) => a.hp - c.hp)[0]
    if (!attack || !foe) break
    battleAct(s, attack.id, foe.id)
  }
  if (s.battle) battleFlee(s)
}

function shed(s: RunState): boolean {
  const heaviest = [...s.carried].sort((a, b) => b.weight - a.weight)[0]
  if (heaviest) {
    dropItem(s, heaviest.id)
    return true
  }
  for (const key of ['rope', 'food', 'water', 'medicine'] as SupplyKey[]) {
    if (s.supplies[key] > 0) {
      dropSupply(s, key)
      return true
    }
  }
  return false
}

function step(s: RunState, policy: Policy, shots: { n: number }): boolean {
  if (encumbranceOfRun(s) === 'critical') return shed(s)
  const next = s.choices[0]
  if (!next) return false
  moveTo(s, next.id)
  if (s.battle) fight(s, policy, shots)
  return true
}

function prudentRun(
  seed: string,
  turnAt: number,
  policy: Policy,
  fee: (shot: number) => number,
  t: Tally,
): void {
  const s = createRun(seed)
  const shots = { n: 0 }
  let guard = 0

  while (!s.over && s.depth < turnAt && guard++ < 300) {
    if (canCamp(s) && aliveMembers(s).some((c) => c.hp < c.maxHp * 0.6)) {
      camp(s)
      continue
    }
    if (!step(s, policy, shots)) break
  }
  if (!s.over) beginAscent(s)
  while (!s.over && guard++ < 500) {
    if (canCamp(s) && aliveMembers(s).some((c) => c.tolerance <= 2)) {
      camp(s)
      continue
    }
    if (!step(s, policy, shots)) break
  }

  const surfaced = s.endReason === 'surfaced'
  const regHome = surfaced && s.party.some((c) => c.id === 'reg' && c.status === 'alive')

  t.shots += shots.n
  t.deaths += s.party.filter((c) => c.status !== 'alive').length
  if (surfaced) {
    t.survived++
    t.loot += totalValue(s)
  }
  // 雷格沒有回來就不收 —— 人都沒回來還扣錢，只會加重死亡螺旋
  if (regHome) {
    for (let i = 0; i < shots.n; i++) t.fees += fee(i)
  }
}

const N = 400
const SHALLOW = [1600, 2800]
const DEEP = [7500, 10000]
const POLICIES: Policy[] = ['never', 'always', 'clutch', 'deep', 'deep2']
const LABEL: Record<Policy, string> = {
  never: '從不放',
  always: '每場都放',
  clutch: '危急才放',
  deep: '深層開場放',
  deep2: '深層限兩發',
}

const flat = (amount: number) => () => amount
/** 同一趟裡連放越來越貴：第一發 base、第二發兩倍、第三發四倍…… */
const rising = (base: number) => (shot: number) => base * 2 ** shot
/** 前兩發便宜，之後變貴 */
const stepped = (cheap: number, dear: number) => (shot: number) => (shot < 2 ? cheap : dear)

/*
 * 已知結果：
 * - 只有昏睡：淺層「每場都放」仍略賺（2,800m 淨值 4,632 vs 從不放 4,411）
 * - 加固定檢修費 150～400：淺層每場都放都變成不划算；7,500m「深層開場放」仍是淨值最高
 * - 連放加倍、前兩發便宜再變貴：結論和固定費用幾乎一樣 —— 合理打法一趟只放 0～2 發，
 *   根本碰不到加價，規則卻比較難解釋，因此不採用
 * - 10,000m 折返時所有打法都差不多（生還 21～24%）：那個深度對這支隊伍太致命，
 *   不是火葬砲的代價問題
 */
const CONFIGS = [
  { name: '只有昏睡（改動前）', steps: KNOCKOUT.steps, bodyWeight: KNOCKOUT.bodyWeight, fee: flat(0) },
  {
    name: `定案：昏睡 + 每發 ${INCINERATE.repairFee}`,
    steps: KNOCKOUT.steps,
    bodyWeight: KNOCKOUT.bodyWeight,
    fee: flat(INCINERATE.repairFee ?? 0),
  },
  { name: '昏睡 + 每發 400', steps: KNOCKOUT.steps, bodyWeight: KNOCKOUT.bodyWeight, fee: flat(400) },
  { name: '昏睡 + 150 起連放加倍', steps: KNOCKOUT.steps, bodyWeight: KNOCKOUT.bodyWeight, fee: rising(150) },
  {
    name: '昏睡 + 前兩發 150、之後每發 600',
    steps: KNOCKOUT.steps,
    bodyWeight: KNOCKOUT.bodyWeight,
    fee: stepped(150, 600),
  },
]

interface Row {
  net: number
  netHigh: number
}

const original = { ...KNOCKOUT }
const verdicts: string[] = []

for (const { name, fee, ...rules } of CONFIGS) {
  Object.assign(KNOCKOUT, rules)
  console.log(`\n── ${name} ──`)
  console.log(
    '折返深度   層  玩法        生還率  死亡/趟  開砲  戰利品  檢修費    淨值  淨值(死亡算800)',
  )

  const rows: Record<number, Partial<Record<Policy, Row>>> = {}

  for (const turnAt of [...SHALLOW, ...DEEP]) {
    rows[turnAt] = {}
    for (const policy of POLICIES) {
      // 淺層沒有第 4 層的戰鬥，深層打法等同從不放
      if (SHALLOW.includes(turnAt) && (policy === 'deep' || policy === 'deep2')) continue

      const t: Tally = { survived: 0, loot: 0, fees: 0, deaths: 0, shots: 0 }
      for (let i = 0; i < N; i++) prudentRun(`k-${turnAt}-${i}`, turnAt, policy, fee, t)

      const net = (t.loot - t.fees - t.deaths * DEATH_COST) / N
      const netHigh = (t.loot - t.fees - t.deaths * DEATH_COST_HIGH) / N
      rows[turnAt]![policy] = { net, netHigh }
      console.log(
        `${formatDepth(turnAt).padStart(8)}  ${String(layerAt(turnAt).id).padStart(2)}  ` +
          `${LABEL[policy].padEnd(6, '　')}  ${((t.survived / N) * 100).toFixed(0).padStart(5)}%  ` +
          `${(t.deaths / N).toFixed(2).padStart(7)}  ${(t.shots / N).toFixed(1).padStart(4)}  ` +
          `${(t.loot / N).toFixed(0).padStart(6)}  ${(t.fees / N).toFixed(0).padStart(6)}  ` +
          `${net.toFixed(0).padStart(6)}  ${netHigh.toFixed(0).padStart(14)}`,
      )
    }
  }

  const judge = (pick: 'net' | 'netHigh') => {
    const v = (d: number, p: Policy) => rows[d]![p]?.[pick] ?? -Infinity
    const shallowOk = SHALLOW.every((d) => v(d, 'always') < v(d, 'never'))
    // 10,000m 只當參考：那個深度所有打法的差距都在誤差內，拿來判斷只會誤導
    const deepWorth = [7500].every(
      (d) => Math.max(v(d, 'deep'), v(d, 'deep2'), v(d, 'clutch')) > v(d, 'never'),
    )
    const notMust = DEEP.every(
      (d) => v(d, 'always') < Math.max(v(d, 'never'), v(d, 'deep'), v(d, 'deep2'), v(d, 'clutch')),
    )
    const mark = (ok: boolean) => (ok ? '✓' : '✗')
    return `${mark(shallowOk)} 淺層不無腦放  ${mark(deepWorth)} 深層值得放  ${mark(notMust)} 不是必用`
  }

  const line = `${name}\n    死亡算 400：${judge('net')}\n    死亡算 800：${judge('netHigh')}`
  console.log(line)
  verdicts.push(line)
}

Object.assign(KNOCKOUT, original)

console.log('\n══ 總結 ══')
for (const line of verdicts) console.log(line)
