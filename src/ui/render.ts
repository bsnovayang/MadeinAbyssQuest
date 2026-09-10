import { distributeBurden, forecast, hasWardRelic, tierFor } from '../core/curse'
import { formatDepth, layerAt } from '../core/depth'
import { decayStage, distort, reliabilityAt } from '../core/perception'
import { hashSeed } from '../core/rng'
import {
  canCamp,
  canMove,
  canUseAnchor,
  encumbranceOfRun,
  escapeRelics,
  loadOf,
  totalValue,
} from '../core/run'
import { partyBehaviors } from '../core/traits'
import type { NodeKind, RunState, Supplies } from '../core/types'
import { capacityOf } from '../core/weight'
import { relicById } from '../data/relics'
import { renderBattle } from './battle'
import {
  createPanelState,
  isPanelOpen,
  panel,
  type PanelState,
} from './panels'

export type HpDeltas = Record<string, number>

export interface UiState {
  deltas: HpDeltas
  muted: boolean
  /** 這一趟承接的委託與目前進度 */
  quests?: { title: string; progress: string }[]
  /** 戰鬥中選定的目標 */
  target?: string | null
  panels?: PanelState
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

// ─── 狀態列：唯一永遠看得見的東西 ────────────────────────────

/**
 * 只有「快要害死人」的事情才有資格常駐畫面。
 * 其餘一律收進面板 —— 捲動找不到選項就是設計失敗。
 */
function alerts(state: RunState): string[] {
  const out: string[] = []
  const enc = encumbranceOfRun(state)

  if (enc === 'critical') out.push('背得太重，一步也走不動')
  else if (enc === 'over') out.push('超重，耗水加快')

  if (state.exhaustion > 0) out.push(`力竭 ${state.exhaustion}`)

  if (state.direction === 'up') {
    const fc = forecast(state)
    for (const c of state.party) {
      if (c.status !== 'alive') continue
      const steps = fc[c.id]
      if (steps === undefined || !Number.isFinite(steps)) continue
      if (steps <= 1) out.push(`☠ ${c.name}　下一個節點撐不住`)
      else if (steps <= 3) out.push(`⚠ ${c.name}　${steps} 節點後危險`)
    }
  }

  for (const c of state.party) {
    if (c.status === 'alive' && c.hp <= c.maxHp * 0.25) {
      out.push(`${c.name}　傷得很重`)
    }
  }

  return out
}

function statusBar(state: RunState, ui: UiState): string {
  const layer = layerAt(state.depth)
  const span = layer.to === Infinity ? layer.step * 10 : layer.to - layer.from
  const progress = Math.min(100, Math.max(0, ((state.depth - layer.from) / span) * 100))
  const up = state.direction === 'up'
  const trust = reliabilityAt(state.depth)

  const alive = state.party.filter((c) => c.status === 'alive')
  const hp = alive.reduce((a, c) => a + distort(c.hp, trust, `${c.id}:${c.hp}:${state.depth}`), 0)
  const maxHp = alive.reduce((a, c) => a + c.maxHp, 0)
  const load = loadOf(state)
  const cap = capacityOf(state.party)
  const enc = encumbranceOfRun(state)

  const warnings = alerts(state)

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
      <div class="vitals">
        <span>${alive.length} 人　${hp}/${maxHp}</span>
        <span>水 ${state.supplies.water}　食 ${state.supplies.food}　繩 ${state.supplies.rope}　藥 ${state.supplies.medicine}</span>
        <span class="vitals__load vitals__load--${enc}">${load.toFixed(0)}/${cap}kg</span>
      </div>
      ${
        up
          ? `<div class="depth-bar__curse">歸途　${esc(tierFor(state.depth).name)}</div>`
          : ''
      }
      ${
        warnings.length
          ? `<div class="alerts">${warnings.map((w) => `<span class="alert">${esc(w)}</span>`).join('')}</div>`
          : ''
      }
    </div>`
}

// ─── 面板內容 ────────────────────────────────────────────────

function forecastLabel(steps: number): string {
  if (!Number.isFinite(steps)) return '<span class="fc fc--safe">機械之軀</span>'
  if (steps <= 1) return '<span class="fc fc--doom">☠ 下一個節點撐不住</span>'
  if (steps <= 3) return `<span class="fc fc--warn">⚠ ${steps} 節點後危險</span>`
  return `<span class="fc">還能撐 ${steps} 節點</span>`
}

function partyBody(state: RunState, ui: UiState): string {
  const up = state.direction === 'up'
  const trust = reliabilityAt(state.depth)
  const fc = up ? forecast(state) : {}
  const share = up ? distributeBurden(state) : {}
  const canWard = hasWardRelic(state)

  return state.party
    .map((c) => {
      const gone = c.status !== 'alive'
      const shownHp = distort(c.hp, trust, `${c.id}:${c.hp}:${state.depth}`)
      const pct = c.maxHp > 0 ? (shownHp / c.maxHp) * 100 : 0
      const tPct = c.maxTolerance > 0 ? (c.tolerance / c.maxTolerance) * 100 : 0
      const delta = ui.deltas[c.id] ?? 0

      const hpText =
        delta !== 0 && !gone
          ? `<s>${c.hp + delta}</s><span class="changed ${delta > 0 ? 'changed--up' : ''}">${shownHp}</span> / ${c.maxHp}`
          : `${shownHp} / ${c.maxHp}`

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
}

function supplyBody(state: RunState): string {
  const keys = Object.keys(SUPPLY_LABEL) as (keyof Supplies)[]
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

  const items = state.carried
    .map((i) => {
      const def = i.relicId ? relicById(i.relicId) : undefined
      const corpse = i.kind === 'corpse'

      // 不知道值多少錢，就沒辦法決定該丟什麼
      const notes: string[] = []
      if (def) {
        notes.push(def.effect)
        notes.push(
          def.kind === 'escape'
            ? `代價　${def.cost}`
            : '撤離時在隊伍面板指定承受的人',
        )
      }
      if (corpse) notes.push('帶回地表才能安葬')
      else if (i.value > 0) notes.push(`帶回地表可換 ${i.value}`)

      return `
        <li class="${corpse ? 'carried--corpse' : ''}">
          <span>
            ${esc(i.name)}
            ${notes.map((n) => `<span class="carried__note">${esc(n)}</span>`).join('')}
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
    <div class="stats">${stats}</div>
    ${items ? `<ul class="carried">${items}</ul>` : '<p class="hint">背上什麼也沒有。</p>'}`
}

function questBody(ui: UiState): string {
  const quests = ui.quests ?? []
  if (quests.length === 0) return '<p class="hint">這一趟沒有接委託。</p>'

  return `
    <ul class="runquests">
      ${quests
        .map(
          (q) => `
            <li>
              <span class="runquests__title">${esc(q.title)}</span>
              <span class="runquests__progress">${esc(q.progress)}</span>
            </li>`,
        )
        .join('')}
    </ul>`
}

function notesBody(state: RunState): string {
  return `
    <ul class="log">
      ${state.log
        .slice(-60)
        .reverse()
        .map(
          (e) => `
            <li class="log__entry">
              <span class="log__depth">${esc(formatDepth(e.depth))}</span>
              <span class="log__text log__text--${e.tone}">${esc(e.text)}</span>
            </li>`,
        )
        .join('')}
    </ul>`
}

// ─── 行動 ────────────────────────────────────────────────────

function reasonWhy(reason: string | null): string {
  return reason ? `<span class="action__why">${esc(reason)}</span>` : ''
}

function campBlockedBy(state: RunState): string | null {
  if (state.current.kind !== 'rest') return '這裡沒有地方生火'
  if (state.supplies.food < 1) return '沒有食物了'
  return null
}

function anchorBlockedBy(state: RunState): string | null {
  if (state.current.kind !== 'anchor') return '這裡沒有升降裝置'
  if (state.supplies.rope < 1) return '沒有繩索了'
  return null
}

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
  const up = state.direction === 'up'
  const blocked = !canMove(state)
  const survey = partyBehaviors(state.party).survey
  const trust = reliabilityAt(state.depth)

  /**
   * 標籤是「判讀」，會出錯；描述是「所見」，永遠誠實。
   * 因此深層的情報會說謊（企劃書 14-4），但玩家仍有判斷的依據。
   */
  const kindLabel = (n: (typeof state.choices)[number]): string => {
    if (!survey) return '？'
    if (trust >= 1) return KIND_LABEL[n.kind]
    const misread = hashSeed(`read:${n.id}:${n.depth}`) % 100 < (1 - trust) * 55
    if (!misread) return KIND_LABEL[n.kind]
    const kinds = Object.keys(KIND_LABEL) as NodeKind[]
    const wrong = kinds[hashSeed(`wrong:${n.id}`) % kinds.length] as NodeKind
    return KIND_LABEL[wrong]
  }

  const buttons = state.choices
    .map(
      (n) => `
        <button class="choice" data-node="${esc(n.id)}" type="button" ${blocked ? 'disabled' : ''}>
          <span class="choice__kind ${survey ? '' : 'choice__kind--unknown'}">${kindLabel(n)}</span>
          ${esc(n.label)}
        </button>`,
    )
    .join('')

  return `
    <section class="deck">
      <h2>${up ? '往上' : '往下'}</h2>
      <div class="choices">${buttons}</div>
      ${blocked ? '<p class="hint">背得太重了，一步也走不動。先丟掉一些東西。</p>' : ''}
      <div class="actions">
        <button class="action" data-camp="1" type="button" ${canCamp(state) ? '' : 'disabled'}>
          紮營
          ${reasonWhy(campBlockedBy(state))}
        </button>
        <button class="action" data-anchor="1" type="button" ${canUseAnchor(state) ? '' : 'disabled'}>
          錨點・上升一層
          ${reasonWhy(anchorBlockedBy(state))}
        </button>
        ${
          up
            ? `<button class="action" data-descend="1" type="button">還是再往下</button>`
            : `<button class="action action--key" data-ascent="1" type="button">開始撤離</button>`
        }
      </div>
    </section>`
}

/**
 * 遺物收在面板裡。
 *
 * 不只是為了版面 —— 不動之楔按下去就永久失去一名隊友，
 * 這種東西不該是隨手誤觸得到的大按鈕。多一次展開是刻意的防呆。
 */
function relicBody(state: RunState): string {
  const buttons = escapeRelics(state)
    .map((i) => {
      const def = relicById(i.relicId ?? '')
      if (!def) return ''
      // 只寫代價不寫效果，等於叫玩家別按
      return `
        <button class="relic" data-relic="${esc(i.id)}" type="button">
          <span class="relic__name">${esc(def.name)}</span>
          <span class="relic__effect">${esc(def.effect)}</span>
          <span class="relic__cost">代價　${esc(def.cost)}</span>
        </button>`
    })
    .join('')

  return `
    <p class="hint">按下去就直接回到地表，剩下的路不必走。但代價一定會發生。</p>
    <div class="relics">${buttons}</div>`
}

// ─── 組裝 ────────────────────────────────────────────────────

export function decayOf(state: RunState): number {
  return decayStage(state.depth)
}

export function render(state: RunState, ui: UiState): string {
  const panels = ui.panels ?? createPanelState()

  if (state.over) {
    return `${statusBar(state, ui)}<div class="town-page">${ended(state)}</div>`
  }

  if (state.battle) {
    return `
      ${statusBar(state, ui)}
      <div class="town-page">
        ${renderBattle(state.battle, ui.target ?? null, state.supplies.medicine)}
      </div>`
  }

  const up = state.direction === 'up'
  const alive = state.party.filter((c) => c.status === 'alive').length
  const questCount = ui.quests?.length ?? 0
  const relicCount = escapeRelics(state).length

  // 撤離時預設攤開隊伍，因為用藥與轉嫁都在那裡
  const open = (id: Parameters<typeof isPanelOpen>[1], fallback: boolean) =>
    isPanelOpen(panels, id, fallback)

  return `
    ${statusBar(state, ui)}
    <div class="town-page">
      ${actions(state)}
      ${relicCount ? panel('relics', '遺物・立刻脫離', `${relicCount}`, open('relics', false), relicBody(state)) : ''}
      ${panel('party', '隊伍', `${alive} 人`, open('party', up), partyBody(state, ui))}
      ${panel('supply', '補給與行李', `${state.carried.length} 件`, open('supply', false), supplyBody(state))}
      ${questCount ? panel('quests', '委託', `${questCount}`, open('quests', false), questBody(ui)) : ''}
      ${panel('notes', '探窟筆記', `${state.log.length}`, open('notes', false), notesBody(state))}
    </div>`
}
