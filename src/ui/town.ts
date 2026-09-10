import { afflictionById, describeAfflictions, effectiveStats } from '../core/affliction'
import { formatDepth } from '../core/depth'
import {
  availableMembers,
  bondBetween,
  bondBonus,
  hireCost,
  loadoutCost,
  PARTY_SIZE,
  SUPPLY_PRICE,
  type MetaState,
  type RunSummary,
} from '../core/meta'
import { traitsOf } from '../core/traits'
import type { Character, SupplyKey } from '../core/types'
import { suppliesWeight } from '../core/weight'

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function summaryPanel(summary: RunSummary | null): string {
  if (!summary) return ''

  const lines: string[] = []
  if (summary.surfaced) {
    lines.push(`帶回的東西值 ${summary.earned}。`)
    if (summary.refunded > 0) lines.push(`沒用完的補給賣回了 ${summary.refunded}。`)
    if (summary.survivors.length) lines.push(`回來的人：${summary.survivors.join('、')}。`)
  } else {
    lines.push('沒有人回來。')
  }
  if (summary.buried.length) lines.push(`帶回安葬：${summary.buried.join('、')}。`)
  if (summary.dead.length) lines.push(`死在深淵裡：${summary.dead.join('、')}。`)
  if (summary.lost.length) lines.push(`留在深淵：${summary.lost.join('、')}。`)
  for (const a of summary.newAfflictions) {
    const def = afflictionById(a.affliction)
    lines.push(`${a.name}留下了痕跡 —— ${def?.name ?? a.affliction}。${def?.desc ?? ''}`)
  }

  return `
    <section class="report ${summary.surfaced ? 'report--warm' : ''}">
      <h2>上一趟</h2>
      ${lines.map((l) => `<p class="report__line">${esc(l)}</p>`).join('')}
    </section>`
}

function traitLine(c: Character): string {
  const traits = traitsOf(c)
  if (traits.length === 0) return ''
  return `<span class="roster__traits">${traits
    .map(
      (t) =>
        `<span class="trait ${t.signature ? 'trait--signature' : ''}" title="${esc(t.desc)}">${esc(t.name)}</span>`,
    )
    .join('')}</span>`
}

function memberCard(c: Character, selected: string[], meta: MetaState): string {
  const chosen = selected.includes(c.id)
  const stats = effectiveStats(c)
  const party = selected
    .map((id) => meta.roster.find((r) => r.id === id))
    .filter((m): m is Character => !!m)

  const bonus = chosen ? bondBonus(c, party) : 0
  const marks = describeAfflictions(c)

  const bondList = Object.entries(c.bonds)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => {
      const other = meta.roster.find((r) => r.id === id)
      if (!other) return ''
      const gone = other.status !== 'alive'
      return `<span class="bond ${gone ? 'bond--gone' : ''}">${esc(other.name)} ${n}</span>`
    })
    .join('')

  const cures = c.afflictions
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .map((id) => {
      const def = afflictionById(id)
      if (!def || def.cureCost <= 0) return ''
      const can = meta.funds >= def.cureCost
      return `<button class="ward" data-cure="${esc(c.id)}:${esc(id)}" type="button" ${can ? '' : 'disabled'}>治療${esc(def.name)} ${def.cureCost}</button>`
    })
    .join('')

  return `
    <div class="roster__card ${chosen ? 'roster__card--on' : ''}">
      <button class="roster__pick" data-pick="${esc(c.id)}" type="button">
        <span class="roster__name">${esc(c.name)}</span>
        <span class="roster__stats">
          HP ${stats.maxHp}　耐受 ${stats.maxTolerance}${bonus > 0 ? `<span class="bonus">+${bonus}</span>` : ''}　負重 ${stats.carryCapacity}
        </span>
        ${c.immuneToCurse ? '<span class="member__note">機械之軀・不受負荷影響</span>' : ''}
        ${traitLine(c)}
        ${marks.length ? `<span class="roster__afflictions">${marks.map(esc).join('・')}</span>` : ''}
        ${bondList ? `<span class="roster__bonds">羈絆　${bondList}</span>` : ''}
      </button>
      ${cures ? `<div class="member__btns">${cures}</div>` : ''}
    </div>`
}

const SUPPLY_LABEL: Readonly<Record<SupplyKey, string>> = {
  food: '食物',
  water: '水',
  rope: '繩索',
  medicine: '藥品',
}

/**
 * 補給商。錢限制前期買不買得起，負重限制全程帶不帶得動 ——
 * 兩者一起，「帶多少下去」才是一個真的決策（企劃書 8-1）。
 */
function supplyShop(meta: MetaState, selected: string[]): string {
  const keys = Object.keys(SUPPLY_LABEL) as SupplyKey[]
  const cost = loadoutCost(meta.loadout)
  const weight = suppliesWeight(meta.loadout)
  const party = selected
    .map((id) => meta.roster.find((c) => c.id === id))
    .filter((c): c is Character => !!c)
  const capacity = party.reduce((sum, c) => sum + effectiveStats(c).carryCapacity, 0)
  const spare = capacity - weight

  const rows = keys
    .map((k) => {
      const n = meta.loadout[k]
      const canAdd = cost + SUPPLY_PRICE[k] <= meta.funds
      return `
        <div class="buy">
          <span class="buy__name">${SUPPLY_LABEL[k]}<span class="buy__unit">${SUPPLY_PRICE[k]}／個</span></span>
          <span class="buy__controls">
            <button class="ward" data-buy="${k}:-1" type="button" ${n > 0 ? '' : 'disabled'}>−</button>
            <span class="buy__count">${n}</span>
            <button class="ward" data-buy="${k}:1" type="button" ${canAdd ? '' : 'disabled'}>＋</button>
          </span>
        </div>`
    })
    .join('')

  return `
    <section>
      <h2>補給商</h2>
      <div class="buys">${rows}</div>
      <div class="buy__total">
        合計 ${cost}　·　重量 ${weight.toFixed(1)}kg
        ${
          capacity > 0
            ? `／隊伍可負重 ${capacity}kg<span class="${spare < 0 ? 'buy__over' : 'buy__spare'}">　${
                spare < 0 ? `超重 ${(-spare).toFixed(1)}kg` : `戰利品空間 ${spare.toFixed(1)}kg`
              }</span>`
            : ''
        }
      </div>
      ${
        capacity > 0 && spare < 0
          ? '<p class="hint">補給就已經超重了，一步也走不動。少帶一點，或多帶一個人。</p>'
          : ''
      }
      <p class="hint">沒用完的補給回來後會以半價賣回。全滅的話什麼都不剩。</p>
    </section>`
}

function graveyard(meta: MetaState): string {
  if (meta.graveyard.length === 0) return ''

  const rows = meta.graveyard
    .slice()
    .reverse()
    .map(
      (g) => `
        <li class="grave">
          <span class="grave__name">${esc(g.name)}</span>
          <span class="grave__where">
            ${esc(formatDepth(g.depth))}　${g.cause === 'lost' ? '留在深淵' : g.buried ? '已安葬' : '死於深淵'}
          </span>
        </li>`,
    )
    .join('')

  return `
    <section>
      <h2>墓地　${meta.graveyard.length}</h2>
      <ul class="graves">${rows}</ul>
    </section>`
}

/**
 * 孤兒院展示的是人，不是抽獎。
 * 你要帶下去可能會死的孩子，至少該先看見他是誰。
 */
function orphanage(meta: MetaState): string {
  const cards = meta.applicants
    .map((c) => {
      const cost = hireCost(c)
      const afford = meta.funds >= cost
      return `
        <div class="applicant">
          <div class="applicant__row">
            <span class="roster__name">${esc(c.name)}</span>
            <span class="applicant__cost ${afford ? '' : 'applicant__cost--no'}">${cost}</span>
          </div>
          <span class="roster__stats">HP ${c.maxHp}　耐受 ${c.maxTolerance}　負重 ${c.carryCapacity}</span>
          ${traitLine(c)}
          <button class="action" data-hire="${esc(c.id)}" type="button" ${afford ? '' : 'disabled'}>
            帶他走
            ${afford ? '' : '<span class="action__why">資金不足</span>'}
          </button>
        </div>`
    })
    .join('')

  return `
    <section>
      <h2>孤兒院</h2>
      <p class="hint">費用依能力而定。他們都還沒有下去過。</p>
      <div class="applicants">${cards}</div>
    </section>`
}

function dangerZone(wiping: boolean): string {
  if (!wiping) {
    return `
      <section class="danger">
        <button class="wipe" data-wipe="1" type="button">清除所有紀錄</button>
      </section>`
  }

  return `
    <section class="danger danger--armed">
      <p class="hint">真的要清除嗎？名冊、羈絆、資金，還有墓地上的每一個名字，都會一起消失。</p>
      <div class="actions">
        <button class="action" data-wipe-confirm="1" type="button">確定清除</button>
        <button class="action action--key" data-wipe-cancel="1" type="button">取消</button>
      </div>
    </section>`
}

export function renderTown(
  meta: MetaState,
  selected: string[],
  summary: RunSummary | null,
  muted: boolean,
  wiping = false,
): string {
  const available = availableMembers(meta)
  const cost = loadoutCost(meta.loadout)
  const affordable = cost <= meta.funds
  const canDepart = selected.length > 0 && selected.length <= PARTY_SIZE && affordable
  const departWhy = selected.length === 0 ? '還沒有決定誰要下去' : '買不起這批補給'

  const pairs = selected
    .flatMap((a, i) =>
      selected.slice(i + 1).map((b) => {
        const ca = meta.roster.find((c) => c.id === a)
        const cb = meta.roster.find((c) => c.id === b)
        if (!ca || !cb) return null
        const n = bondBetween(ca, cb)
        return n > 0 ? `${ca.name}與${cb.name} ${n}` : null
      }),
    )
    .filter((s): s is string => !!s)

  return `
    <div class="depth-bar">
      <div class="depth-bar__top">
        <span class="depth-bar__depth">奧斯城</span>
        <span class="depth-bar__layer">
          資金 ${meta.funds}　·　第 ${meta.runIndex + 1} 趟
          <button class="mute" data-mute="1" type="button" title="音效">${muted ? '🔇' : '🔊'}</button>
        </span>
      </div>
    </div>

    <div class="layout">
      <div class="col-left">
        ${summaryPanel(summary)}
        ${supplyShop(meta, selected)}
        ${orphanage(meta)}
        ${graveyard(meta)}
        ${dangerZone(wiping)}
      </div>

      <div class="col-right">
        <section>
          <h2>名冊　選 ${selected.length} / ${PARTY_SIZE}</h2>
          <div class="roster">${available.map((c) => memberCard(c, selected, meta)).join('')}</div>
          ${
            pairs.length
              ? `<p class="roster__hint">一起活著回來過：${esc(pairs.join('、'))}</p>`
              : ''
          }
          <div class="actions">
            <button class="action action--key" data-depart="1" type="button" ${canDepart ? '' : 'disabled'}>
              ${canDepart ? `出發下潛（${selected.length} 人・補給 ${cost}）` : '出發下潛'}
              ${canDepart ? '' : `<span class="action__why">${departWhy}</span>`}
            </button>
          </div>
          ${canDepart ? '' : '<p class="hint hint--depart">點名冊上的人把他們編進隊伍。最多四個人。</p>'}
          ${
            available.length === 0
              ? '<p class="hint">名冊上一個人也不剩了。孤兒院還會再送人來。</p>'
              : ''
          }
        </section>
      </div>
    </div>`
}
