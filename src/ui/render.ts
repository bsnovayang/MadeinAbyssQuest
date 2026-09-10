import { distributeBurden, forecast, hasWardRelic, tierFor } from '../core/curse'
import { formatDepth, layerAt } from '../core/depth'
import {
  canCamp,
  canMove,
  canUseAnchor,
  encumbranceOfRun,
  escapeRelics,
  loadOf,
  totalValue,
} from '../core/run'
import type { NodeKind, RunState, Supplies } from '../core/types'
import { capacityOf } from '../core/weight'
import { relicById } from '../data/relics'

export type HpDeltas = Record<string, number>

export interface UiState {
  deltas: HpDeltas
  muted: boolean
}

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

// ─── 深度計 ──────────────────────────────────────────────────

function depthBar(state: RunState, ui: UiState): string {
  const layer = layerAt(state.depth)
  const span = layer.to === Infinity ? layer.step * 10 : layer.to - layer.from
  const progress = Math.min(100, Math.max(0, ((state.depth - layer.from) / span) * 100))
  const up = state.direction === 'up'
  const tier = tierFor(state.depth)

  return `
    <div class="depth-bar">
      <div class="depth-bar__top">
        <span class="depth-bar__depth">
          ${up ? '<span class="depth-bar__arrow">↑</span>' : ''}${esc(formatDepth(state.depth))}
        </span>
        <span class="depth-bar__layer">
          第${layer.id}層　${esc(layer.name)}　·　第 ${state.daysElapsed} 日
          <button class="mute" data-mute="1" type="button" title="音效">${ui.muted ? '🔇' : '🔊'}</button>
        </span>
      </div>
      <div class="depth-bar__track">
        <div class="depth-bar__fill" style="width:${progress.toFixed(1)}%"></div>
      </div>
      ${
        up
          ? `<div class="depth-bar__curse">歸途　最深抵達 ${esc(formatDepth(state.maxDepthReached))}　·　${esc(tier.name)}</div>`
          : ''
      }
    </div>`
}

// ─── 隊伍 ────────────────────────────────────────────────────

function forecastLabel(steps: number): string {
  if (!Number.isFinite(steps)) return '<span class="fc fc--safe">機械之軀</span>'
  if (steps <= 1) return '<span class="fc fc--doom">☠ 下一個節點撐不住</span>'
  if (steps <= 3) return `<span class="fc fc--warn">⚠ ${steps} 節點後危險</span>`
  return `<span class="fc">還能撐 ${steps} 節點</span>`
}

function party(state: RunState, ui: UiState): string {
  const up = state.direction === 'up'
  const fc = up ? forecast(state) : {}
  const share = up ? distributeBurden(state) : {}
  const canWard = hasWardRelic(state)

  const rows = state.party
    .map((c) => {
      const gone = c.status !== 'alive'
      const pct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0
      const tPct = c.maxTolerance > 0 ? (c.tolerance / c.maxTolerance) * 100 : 0
      const delta = ui.deltas[c.id] ?? 0

      const hpText =
        delta !== 0 && !gone
          ? `<s>${c.hp + delta}</s><span class="changed ${delta > 0 ? 'changed--up' : ''}">${c.hp}</span> / ${c.maxHp}`
          : `${c.hp} / ${c.maxHp}`

      const statusNote =
        c.status === 'lost'
          ? '<span class="member__note member__note--grim">留在深淵</span>'
          : c.status === 'dead'
            ? ''
            : c.immuneToCurse
              ? '<span class="member__note">機械之軀・不受負荷影響</span>'
              : ''

      const isTarget = state.burden.mode === 'ward' && state.burden.targetId === c.id
      const wardBtn =
        up && canWard && !gone && !c.immuneToCurse
          ? `<button class="ward ${isTarget ? 'ward--on' : ''}" data-ward="${esc(c.id)}" type="button">${isTarget ? '承受中' : '讓他承受'}</button>`
          : ''

      const medBtn =
        up && !gone && state.supplies.medicine > 0 && c.tolerance < c.maxTolerance
          ? `<button class="ward" data-med="${esc(c.id)}" type="button">用藥</button>`
          : ''

      const toleranceRow =
        up && !gone
          ? `
            <div class="member__tol">
              <div class="member__track member__track--tol">
                <div class="member__fill member__fill--tol" style="width:${tPct.toFixed(0)}%"></div>
              </div>
              <div class="member__fc">
                ${forecastLabel(fc[c.id] ?? Infinity)}
                ${(share[c.id] ?? 0) > 0 ? `<span class="fc fc--cost">−${share[c.id]}/步</span>` : ''}
              </div>
            </div>`
          : ''

      return `
        <div class="member ${gone ? 'member--gone' : ''} ${isTarget ? 'member--ward' : ''}">
          <div class="member__row">
            <span class="member__name">${esc(c.name)}</span>
            <span class="member__hp">${hpText}</span>
          </div>
          <div class="member__track"><div class="member__fill" style="width:${pct.toFixed(0)}%"></div></div>
          ${toleranceRow}
          ${statusNote}
          <div class="member__btns">${wardBtn}${medBtn}</div>
        </div>`
    })
    .join('')

  const burdenRow =
    up && canWard
      ? `<div class="burden">
           承受方式
           <button class="ward ${state.burden.mode === 'spread' ? 'ward--on' : ''}" data-burden="spread" type="button">平均分攤</button>
           <span class="burden__hint">避咒之籠：可指定一人扛下全部</span>
         </div>`
      : ''

  return `<section><h2>隊伍</h2>${rows}${burdenRow}</section>`
}

// ─── 補給 ────────────────────────────────────────────────────

function supplies(state: RunState): string {
  const keys = Object.keys(SUPPLY_LABEL) as (keyof Supplies)[]
  const load = loadOf(state)
  const cap = capacityOf(state.party)
  const enc = encumbranceOfRun(state)
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

  const encNote = enc === 'critical' ? '　動彈不得' : enc === 'over' ? '　超重・耗水加快' : ''

  const items = state.carried
    .map((i) => {
      const def = i.relicId ? relicById(i.relicId) : undefined
      const corpse = i.kind === 'corpse'
      return `
        <li class="${corpse ? 'carried--corpse' : ''}">
          <span>
            ${esc(i.name)}
            ${def ? `<span class="carried__note">${esc(def.effect)}</span>` : ''}
            ${corpse ? '<span class="carried__note">帶回地表才能安葬</span>' : ''}
          </span>
          <span class="carried__meta">
            ${i.weight}kg
            <button class="carried__drop" data-drop="${esc(i.id)}" type="button">
              ${corpse ? '留下' : '丟棄'}
            </button>
          </span>
        </li>`
    })
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

// ─── 行動 ────────────────────────────────────────────────────

function ended(state: RunState): string {
  const survived = state.party.filter((c) => c.status === 'alive')
  const lost = state.party.filter((c) => c.status !== 'alive')
  const surfaced = state.endReason === 'surfaced'

  const body = surfaced
    ? `
      <p class="ended__body">
        最深抵達 ${esc(formatDepth(state.maxDepthReached))}。
        帶回地表的東西值 ${totalValue(state)}。
      </p>
      <p class="ended__body">回來的人：${survived.map((c) => esc(c.name)).join('、') || '沒有'}。</p>
      ${lost.length ? `<p class="ended__body ended__body--grim">沒有回來：${lost.map((c) => esc(c.name)).join('、')}。</p>` : ''}`
    : `
      <p class="ended__body">
        最深抵達 ${esc(formatDepth(state.maxDepthReached))}。帶回地表的東西：沒有。
      </p>`

  return `
    <div class="ended ${surfaced ? 'ended--warm' : ''}">
      <div class="ended__title">${surfaced ? '回到了奧斯城' : '探索結束'}</div>
      ${body}
      <div class="actions">
        <button class="action action--key" data-return="1" type="button">回到奧斯城</button>
      </div>
    </div>`
}

function actions(state: RunState): string {
  if (state.over) return ended(state)

  const up = state.direction === 'up'
  const blocked = !canMove(state)

  const buttons = state.choices
    .map(
      (n) => `
        <button class="choice" data-node="${esc(n.id)}" type="button" ${blocked ? 'disabled' : ''}>
          <span class="choice__kind">${KIND_LABEL[n.kind]}</span>
          ${esc(n.label)}
        </button>`,
    )
    .join('')

  const relicButtons = escapeRelics(state)
    .map((i) => {
      const def = relicById(i.relicId ?? '')
      if (!def) return ''
      return `
        <button class="relic" data-relic="${esc(i.id)}" type="button">
          <span class="relic__name">${esc(def.name)}</span>
          <span class="relic__effect">${esc(def.effect)}</span>
          <span class="relic__cost">代價　${esc(def.cost)}</span>
        </button>`
    })
    .join('')

  return `
    <section>
      <h2>${up ? '往上' : '往下'}</h2>
      <div class="choices">${buttons}</div>
      <div class="actions">
        <button class="action" data-camp="1" type="button" ${canCamp(state) ? '' : 'disabled'}>
          紮營（食物 −1）
        </button>
        <button class="action" data-anchor="1" type="button" ${canUseAnchor(state) ? '' : 'disabled'}>
          使用錨點・上升一層（繩索 −1）
        </button>
        ${
          up
            ? `<button class="action" data-descend="1" type="button">還是再往下</button>`
            : `<button class="action action--key" data-ascent="1" type="button">開始撤離</button>`
        }
      </div>
      ${relicButtons ? `<div class="relics"><h2>遺物脫離</h2>${relicButtons}</div>` : ''}
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

export function render(state: RunState, ui: UiState): string {
  return `
    ${depthBar(state, ui)}
    <div class="layout">
      <div class="col-left">
        ${party(state, ui)}
        ${supplies(state)}
      </div>
      <div class="col-right">
        ${actions(state)}
        ${log(state)}
      </div>
    </div>
    <div class="seed">seed: ${esc(state.seed)}</div>`
}
