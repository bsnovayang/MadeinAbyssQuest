import { formatDepth, layerAt } from '../core/depth'
import { canCamp, canDescend, encumbranceOfRun, loadOf } from '../core/run'
import type { NodeKind, RunState, Supplies } from '../core/types'
import { capacityOf } from '../core/weight'

/** 上一次動作造成的 HP 變化，供手寫修正式回饋使用（企劃書 16-1） */
export type HpDeltas = Record<string, number>

const KIND_LABEL: Readonly<Record<NodeKind, string>> = {
  empty: '無',
  forage: '採集',
  rest: '可紮營',
  obstacle: '地形',
  encounter: '遭遇',
  relic: '遺物',
  anchor: '錨點',
}

const SUPPLY_LABEL: Readonly<Record<keyof Supplies, string>> = {
  food: '食物',
  water: '水',
  rope: '繩索',
  medicine: '藥品',
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function depthBar(state: RunState): string {
  const layer = layerAt(state.depth)
  const span = layer.to === Infinity ? layer.step * 10 : layer.to - layer.from
  const progress = Math.min(100, ((state.depth - layer.from) / span) * 100)

  return `
    <div class="depth-bar">
      <div class="depth-bar__top">
        <span class="depth-bar__depth">${esc(formatDepth(state.depth))}</span>
        <span class="depth-bar__layer">第${layer.id}層　${esc(layer.name)}　·　第 ${state.daysElapsed} 日</span>
      </div>
      <div class="depth-bar__track">
        <div class="depth-bar__fill" style="width:${progress.toFixed(1)}%"></div>
      </div>
    </div>`
}

function party(state: RunState, deltas: HpDeltas): string {
  const rows = state.party
    .map((c) => {
      const dead = c.status === 'dead'
      const pct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0
      const delta = deltas[c.id] ?? 0
      const hpText =
        delta !== 0 && !dead
          ? `<s>${c.hp + delta}</s><span class="changed">${c.hp}</span> / ${c.maxHp}`
          : `${c.hp} / ${c.maxHp}`

      return `
        <div class="member ${dead ? 'member--dead' : ''}">
          <div class="member__row">
            <span class="member__name">${esc(c.name)}</span>
            <span class="member__hp">${hpText}</span>
          </div>
          <div class="member__track"><div class="member__fill" style="width:${pct.toFixed(0)}%"></div></div>
          ${c.immuneToCurse ? '<span class="member__note">機械之軀・不受負荷影響</span>' : ''}
        </div>`
    })
    .join('')

  return `<section><h2>隊伍</h2>${rows}</section>`
}

function supplies(state: RunState): string {
  const keys = Object.keys(SUPPLY_LABEL) as (keyof Supplies)[]
  const load = loadOf(state)
  const cap = capacityOf(state.party)
  const enc = encumbranceOfRun(state)
  // 超重時才顯示丟棄補給，避免平時誤觸
  const canShed = enc !== 'normal'

  const stats = keys
    .map((k) => {
      const v = state.supplies[k]
      const shed =
        canShed && v > 0
          ? `<button class="carried__drop" data-drop-supply="${k}" type="button">丟棄</button>`
          : ''
      return `
        <div class="stat ${v <= 0 ? 'stat--empty' : ''}">
          <span class="stat__label">${SUPPLY_LABEL[k]}</span>
          <span class="stat__value">${v}</span>
          ${shed}
        </div>`
    })
    .join('')
  const encNote =
    enc === 'critical' ? '　動彈不得' : enc === 'over' ? '　超重・耗水加快' : ''

  const items = state.carried
    .map(
      (i) => `
        <li>
          <span>${esc(i.name)}</span>
          <span>
            ${i.weight}kg
            <button class="carried__drop" data-drop="${esc(i.id)}" type="button">丟棄</button>
          </span>
        </li>`,
    )
    .join('')

  return `
    <section>
      <h2>補給</h2>
      <div class="stats">${stats}</div>
      <div class="load load--${enc}">負重　${load.toFixed(1)} / ${cap} kg${encNote}</div>
      ${items ? `<ul class="carried">${items}</ul>` : ''}
      ${state.exhaustion > 0 ? `<div class="load load--critical">力竭　${state.exhaustion}</div>` : ''}
    </section>`
}

function log(state: RunState): string {
  const entries = state.log
    .slice(-40)
    .map(
      (e) => `
        <li class="log__entry">
          <span class="log__depth">${esc(formatDepth(e.depth))}</span>
          <span class="log__text log__text--${e.tone}">${esc(e.text)}</span>
        </li>`,
    )
    .join('')

  return `<section><h2>探窟筆記</h2><ul class="log">${entries}</ul></section>`
}

function choices(state: RunState): string {
  if (state.over) {
    return `
      <div class="ended">
        <div class="ended__title">探索結束</div>
        <p class="ended__body">
          抵達的最深處是 ${esc(formatDepth(state.maxDepthReached))}。
          帶回地表的東西：沒有。
        </p>
        <div class="actions">
          <button class="action" data-restart="1" type="button">再一次</button>
        </div>
      </div>`
  }

  const blocked = !canDescend(state)
  const buttons = state.choices
    .map(
      (n) => `
        <button class="choice" data-node="${esc(n.id)}" type="button" ${blocked ? 'disabled' : ''}>
          <span class="choice__kind">${KIND_LABEL[n.kind]}</span>
          ${esc(n.label)}
        </button>`,
    )
    .join('')

  return `
    <section>
      <h2>往下</h2>
      <div class="choices">${buttons}</div>
      <div class="actions">
        <button class="action" data-camp="1" type="button" ${canCamp(state) ? '' : 'disabled'}>
          紮營（食物 −1）
        </button>
      </div>
    </section>`
}

export function render(state: RunState, deltas: HpDeltas): string {
  return `
    ${depthBar(state)}
    <div class="layout">
      <div class="col-left">
        ${party(state, deltas)}
        ${supplies(state)}
      </div>
      <div class="col-right">
        ${choices(state)}
        ${log(state)}
      </div>
    </div>
    <div class="seed">seed: ${esc(state.seed)}</div>`
}
