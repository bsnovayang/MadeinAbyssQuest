import {
  awaitingActor,
  forecast,
  living,
  skillsOfActor,
  type BattleState,
  type Combatant,
} from '../core/battle'
import { enemyById } from '../data/enemies'

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

// ─── 這一次行動造成了什麼 ────────────────────────────────────

/** 一次行動前的戰場快照 */
export interface BattleSnapshot {
  units: Record<string, { hp: number; down: boolean; nextAt: number }>
}

/**
 * 只在「行動之後的那一次重繪」帶進畫面。
 * 展開面板之類的重繪不帶，動畫才不會重播。
 */
export interface BattleFx {
  /** 血量變化：正數是受傷，負數是回復 */
  hp: Record<string, number>
  /** 這次行動才倒下的 */
  downed: string[]
  /** 行動順序往前推進了 */
  advanced: boolean
}

/** 一次吃掉這麼多比例的血，筆跡就特別用力（企劃書 16-1 的暴擊） */
export const HEAVY_SHARE = 0.3

export function snapshotBattle(b: BattleState): BattleSnapshot {
  return {
    units: Object.fromEntries(
      b.combatants.map((c) => [c.id, { hp: c.hp, down: c.status === 'down', nextAt: c.nextAt }]),
    ),
  }
}

export function diffBattle(before: BattleSnapshot, b: BattleState): BattleFx {
  const hp: Record<string, number> = {}
  const downed: string[] = []
  let advanced = false

  for (const c of b.combatants) {
    const prev = before.units[c.id]
    if (!prev) continue
    if (prev.hp !== c.hp) hp[c.id] = prev.hp - c.hp
    if (!prev.down && c.status === 'down') downed.push(c.id)
    if (prev.nextAt !== c.nextAt) advanced = true
  }

  return { hp, downed, advanced }
}

// ─── 畫面 ────────────────────────────────────────────────────

/**
 * 行動順序條（企劃書 12-1）。
 * 玩家看得到「三個行動之後那個東西會動」，牽制才有意義。
 */
function timeline(b: BattleState, fx: BattleFx | undefined): string {
  const upcoming = b.over ? [] : forecast(b, 7)

  return `
    <div class="timeline ${fx?.advanced ? 'timeline--advanced' : ''}">
      <div class="timeline__label">行動順序</div>
      <ol class="timeline__list">
        ${upcoming
          .map(
            (c, i) => `
              <li class="tl ${c.side === 'enemy' ? 'tl--enemy' : ''} ${i === 0 ? 'tl--now' : ''}" style="--i:${i}">
                ${esc(c.name)}${c.charging > 0 ? '<span class="tl__charge">蓄力</span>' : ''}
              </li>`,
          )
          .join('')}
      </ol>
    </div>`
}

function unitRow(
  c: Combatant,
  selected: string | null,
  fx: BattleFx | undefined,
  actorId: string | null,
): string {
  const pct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0
  const def = c.enemyId ? enemyById(c.enemyId) : undefined
  const down = c.status === 'down'

  const delta = fx?.hp[c.id] ?? 0
  const before = c.hp + delta
  const beforePct = c.maxHp > 0 ? Math.min(100, (before / c.maxHp) * 100) : 0
  const heavy = delta > 0 && delta >= c.maxHp * HEAVY_SHARE
  const felled = fx?.downed.includes(c.id) ?? false
  const acting = c.id === actorId

  const classes = [
    'unit',
    c.side === 'enemy' && 'unit--enemy',
    down && 'unit--down',
    selected === c.id && 'unit--target',
    acting && 'unit--actor',
    acting && fx?.advanced && 'unit--turn',
    c.charging > 0 && !down && 'unit--charging',
    delta > 0 && 'unit--hit',
    delta < 0 && 'unit--healed',
    heavy && 'unit--heavy',
    felled && 'unit--felled',
  ]
    .filter(Boolean)
    .join(' ')

  // 不用飄字，用手寫修正（企劃書 16-1）
  const hpText =
    delta !== 0
      ? `<s>${before}</s><span class="changed ${delta < 0 ? 'changed--up' : ''}">${c.hp}</span> / ${c.maxHp}`
      : `${c.hp} / ${c.maxHp}`

  // 血條先扣下去，留一段淡色的殘影再慢慢縮回來
  const ghost =
    delta > 0
      ? `<span class="unit__ghost" style="--from:${beforePct.toFixed(0)}%;--to:${pct.toFixed(0)}%"></span>`
      : ''

  return `
    <button class="${classes}" data-target="${esc(c.id)}" type="button" ${down ? 'disabled' : ''}>
      <span class="unit__row">
        <span class="unit__name">${esc(c.name)}</span>
        <span class="unit__hp">${hpText}</span>
      </span>
      <span class="unit__track">
        ${ghost}
        <span class="unit__fill ${delta < 0 ? 'unit__fill--grow' : ''}" style="width:${pct.toFixed(0)}%;--from:${beforePct.toFixed(0)}%"></span>
      </span>
      ${c.charging > 0 && !down ? '<span class="unit__note">正在聚集力量</span>' : ''}
      ${def && c.side === 'enemy' && selected === c.id ? `<span class="unit__desc">${esc(def.desc)}</span>` : ''}
    </button>`
}

const OVER_HEADING: Readonly<Record<NonNullable<BattleState['over']>, string>> = {
  win: '周圍安靜下來了',
  flee: '退開了',
  wipe: '……',
}

export function renderBattle(
  b: BattleState,
  selected: string | null,
  medicine: number,
  fx?: BattleFx,
): string {
  const actor = awaitingActor(b)

  const commands = actor
    ? skillsOfActor(actor)
        .map((s) => {
          const short = (s.medicine ?? 0) > medicine
          return `
            <button class="skill" data-skill="${esc(s.id)}" type="button" ${short ? 'disabled' : ''}>
              <span class="skill__name">
                ${esc(s.name)}
                ${actor.uses[s.id] !== undefined ? `<span class="skill__uses">剩 ${actor.uses[s.id]}</span>` : ''}
              </span>
              <span class="skill__desc">${esc(s.desc)}</span>
              ${short ? '<span class="action__why">藥品不夠</span>' : ''}
            </button>`
        })
        .join('')
    : ''

  const heading = b.over ? OVER_HEADING[b.over] : actor ? `輪到${esc(actor.name)}` : '……'

  // 戰鬥在最後一擊結束時，畫面會在這裡停一下，讓玩家看見發生了什麼
  const flee = b.over
    ? ''
    : `
      <div class="actions">
        <button class="action" data-flee="1" type="button">撤退</button>
      </div>
      <p class="hint">逃跑永遠是有效的選項。深淵不是競技場。</p>`

  return `
    <div class="battle">
      ${timeline(b, fx)}

      <section>
        <h2>擋在前面的東西</h2>
        <div class="units">${living(b, 'enemy')
          .concat(b.combatants.filter((c) => c.side === 'enemy' && c.status === 'down'))
          .map((c) => unitRow(c, selected, fx, actor?.id ?? null))
          .join('')}</div>
      </section>

      <section>
        <h2>隊伍</h2>
        <div class="units">${b.combatants
          .filter((c) => c.side === 'party')
          .map((c) => unitRow(c, selected, fx, actor?.id ?? null))
          .join('')}</div>
      </section>

      <section>
        <h2>${heading}</h2>
        <div class="skills">${commands}</div>
        ${flee}
      </section>
    </div>`
}
