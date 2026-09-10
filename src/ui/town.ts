import { afflictionById, describeAfflictions, effectiveStats } from '../core/affliction'
import { formatDepth } from '../core/depth'
import {
  activeQuests,
  availableMembers,
  bondBetween,
  bondBonus,
  currentRank,
  departCost,
  departFee,
  hireCost,
  identifyCost,
  isFit,
  loadoutCost,
  nextRank,
  openQuests,
  PARTY_SIZE,
  rosterCap,
  sellValue,
  SUPPLY_PRICE,
  takeDownWeight,
  unlockedBases,
  type MetaState,
  type RunSummary,
} from '../core/meta'
import { MAX_ACTIVE_QUESTS, type Quest } from '../core/quests'
import { baseFee } from '../data/bases'
import { relicById } from '../data/relics'
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
  lines.push(`這一趟花了 ${summary.daysSpent} 天。`)
  for (const q of summary.questsDone) lines.push(`委託達成：${q.title}　+${q.reward}`)
  for (const t of summary.questsFailed) lines.push(`委託沒有交差：${t}`)

  if (summary.surfaced) {
    lines.push(`帶回的東西值 ${summary.earned}。`)
    if (summary.refunded > 0) lines.push(`沒用完的補給賣回了 ${summary.refunded}。`)
    if (summary.survivors.length) lines.push(`回來的人：${summary.survivors.join('、')}。`)
  } else {
    lines.push('沒有人回來。')
  }
  for (const r of summary.relicsKept) lines.push(`帶回了${r}，收進倉庫。`)
  for (const a of summary.aftermath) lines.push(a)
  if (summary.buried.length) lines.push(`帶回安葬：${summary.buried.join('、')}。`)
  if (summary.dead.length) lines.push(`死在深淵裡：${summary.dead.join('、')}。`)
  if (summary.lost.length) lines.push(`留在深淵：${summary.lost.join('、')}。`)
  for (const a of summary.newAfflictions) {
    const def = afflictionById(a.affliction)
    lines.push(`${a.name}留下了痕跡 —— ${def?.name ?? a.affliction}。${def?.desc ?? ''}`)
  }
  if (summary.promoted) lines.push(`組合承認了你的資格。現在是${summary.promoted}。`)
  for (const b of summary.basesOpened) {
    lines.push(`${b}開放了。下一趟可以直接從那裡出發。`)
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

/** 展開後的隊員頁：介紹、能力、特質、損傷、羈絆 */
function memberDetail(c: Character, meta: MetaState): string {
  const stats = effectiveStats(c)
  const delta = (base: number, eff: number) =>
    eff === base ? `${eff}` : `${eff}<span class="detail__base">（基礎 ${base}）</span>`

  const traits = traitsOf(c)
  const afflictionCounts = new Map<string, number>()
  for (const id of c.afflictions) afflictionCounts.set(id, (afflictionCounts.get(id) ?? 0) + 1)

  const bonds = Object.entries(c.bonds)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const other = meta.roster.find((r) => r.id === id)
      if (!other) return ''
      const gone = other.status !== 'alive'
      return `<li class="${gone ? 'bond--gone' : ''}">${esc(other.name)}　一起活著回來過 ${n} 次${
        gone ? '　（已經不在了）' : ''
      }</li>`
    })
    .join('')

  return `
    <div class="detail">
      ${c.bio ? `<p class="detail__bio">${esc(c.bio)}</p>` : ''}

      <dl class="detail__stats">
        <div><dt>HP</dt><dd>${delta(c.maxHp, stats.maxHp)}</dd></div>
        <div><dt>耐受度</dt><dd>${delta(c.maxTolerance, stats.maxTolerance)}</dd></div>
        <div><dt>負重</dt><dd>${delta(c.carryCapacity, stats.carryCapacity)}</dd></div>
      </dl>

      ${
        c.immuneToCurse
          ? '<p class="detail__note">機械之軀 —— 上升負荷對他完全無效。</p>'
          : ''
      }

      ${
        traits.length
          ? `<h3 class="detail__h">能力與特質</h3>
             <ul class="detail__list">
               ${traits
                 .map(
                   (t) =>
                     `<li><span class="trait ${t.signature ? 'trait--signature' : ''}">${esc(t.name)}</span>${esc(t.desc)}</li>`,
                 )
                 .join('')}
             </ul>`
          : ''
      }

      ${
        afflictionCounts.size
          ? `<h3 class="detail__h">永久損傷</h3>
             <ul class="detail__list">
               ${[...afflictionCounts.entries()]
                 .map(([id, n]) => {
                   const def = afflictionById(id)
                   if (!def) return ''
                   const cure =
                     def.cureCost > 0
                       ? `<button class="ward" data-cure="${esc(c.id)}:${esc(id)}" type="button" ${
                           meta.funds >= def.cureCost ? '' : 'disabled'
                         }>治療 ${def.cureCost}</button>`
                       : '<span class="detail__base">無法治療</span>'
                   return `<li><span class="trait trait--bad">${esc(def.name)}${n > 1 ? `×${n}` : ''}</span>${esc(def.desc)} ${cure}</li>`
                 })
                 .join('')}
             </ul>`
          : ''
      }

      ${bonds ? `<h3 class="detail__h">羈絆</h3><ul class="detail__list detail__list--bonds">${bonds}</ul>` : ''}
    </div>`
}

function memberCard(
  c: Character,
  selected: string[],
  meta: MetaState,
  expanded: string | null,
): string {
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

  const open = expanded === c.id
  const fit = isFit(c)

  return `
    <div class="roster__card ${chosen ? 'roster__card--on' : ''} ${open ? 'roster__card--open' : ''} ${
      fit ? '' : 'roster__card--unfit'
    }">
      <button class="roster__pick" data-pick="${esc(c.id)}" type="button" ${fit ? '' : 'disabled'}>
        <span class="roster__name">${esc(c.name)}</span>
        <span class="roster__stats">
          HP ${c.hp}／${stats.maxHp}　耐受 ${stats.maxTolerance}${bonus > 0 ? `<span class="bonus">+${bonus}</span>` : ''}　負重 ${stats.carryCapacity}
        </span>
        ${fit ? '' : '<span class="roster__afflictions">傷勢未癒・需要休養</span>'}
        ${c.immuneToCurse ? '<span class="member__note">機械之軀・不受負荷影響</span>' : ''}
        ${traitLine(c)}
        ${marks.length ? `<span class="roster__afflictions">${marks.map(esc).join('・')}</span>` : ''}
        ${bondList ? `<span class="roster__bonds">羈絆　${bondList}</span>` : ''}
      </button>
      <div class="member__btns">
        <button class="ward" data-detail="${esc(c.id)}" type="button">
          ${open ? '收合' : '詳細'}
        </button>
      </div>
      ${open ? memberDetail(c, meta) : ''}
    </div>`
}

/**
 * 出發地點。基地省的是時間，不是代價 ——
 * 從 7,000m 出發，回程仍然得穿越中間的每一層。
 */
function departurePicker(meta: MetaState): string {
  const bases = unlockedBases(meta)
  if (bases.length === 0) {
    return `
      <section>
        <h2>出發地點</h2>
        <p class="hint">
          目前只能從地表走下去。抵達某一層並且活著回來，那一層的前線基地就會開放。
        </p>
      </section>`
  }

  const option = (depth: number, name: string, desc: string, fee: number) => {
    const on = meta.departDepth === depth
    const afford = meta.funds >= loadoutCost(meta.loadout) + fee
    return `
      <button class="depart ${on ? 'depart--on' : ''}" data-depart-at="${depth}" type="button" ${
        afford || on ? '' : 'disabled'
      }>
        <span class="depart__row">
          <span class="depart__name">${esc(name)}</span>
          <span class="depart__fee">${fee > 0 ? `維護費 ${fee}` : '免費'}</span>
        </span>
        <span class="depart__desc">${esc(desc)}</span>
      </button>`
  }

  return `
    <section>
      <h2>出發地點</h2>
      ${option(0, '地表・奧斯城', '從深淵之淵的入口走下去。慢，但不用錢。', 0)}
      ${bases
        .map((b) => option(b.depth, `${b.name}　${formatDepth(b.depth)}`, b.desc, baseFee(b.depth)))
        .join('')}
      <p class="hint">從基地出發省下的是路途，不是代價 —— 回程仍然要穿越中間的每一層。</p>
    </section>`
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
  const spendable = meta.funds - departFee(meta)
  const weight = suppliesWeight(meta.loadout)
  const party = selected
    .map((id) => meta.roster.find((c) => c.id === id))
    .filter((c): c is Character => !!c)
  const capacity = party.reduce((sum, c) => sum + effectiveStats(c).carryCapacity, 0)
  const spare = capacity - weight

  const rows = keys
    .map((k) => {
      const n = meta.loadout[k]
      const canAdd = cost + SUPPLY_PRICE[k] <= spendable
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
  if (meta.graveyard.length === 0) {
    return `
      <section>
        <h2>墓地</h2>
        <p class="hint">還沒有人留在下面。</p>
      </section>`
  }

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
      <p class="hint">
        費用依能力而定。他們都還沒有下去過。
        名冊 ${meta.roster.filter((c) => c.status === 'alive').length} / ${rosterCap(meta)} 人
      </p>
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

export type TownTab = 'quests' | 'party' | 'supply' | 'orphanage' | 'vault' | 'records'

/**
 * 鑑定師。
 *
 * 鑑定的價值不只是「告訴你那是什麼」，也是「讓你賣得掉」——
 * 未鑑定的遺物只值三成，所以就算玩家背熟了外觀，鑑定仍然有意義。
 */
function vault(meta: MetaState): string {
  if (meta.vault.length === 0) {
    return `
      <section>
        <h2>遺物</h2>
        <p class="hint">倉庫是空的。深淵裡撿到的東西，要活著帶回來才算。</p>
      </section>`
  }

  const rows = meta.vault
    .map((i) => {
      const def = i.relicId ? relicById(i.relicId) : undefined
      const cost = identifyCost(i)
      const taking = meta.takeDown.includes(i.id)

      const body = i.identified
        ? `
          <span class="roster__stats">${esc(def?.effect ?? '')}</span>
          <span class="relic__cost">代價　${esc(def?.cost ?? '')}</span>`
        : '<span class="roster__stats">還不知道是什麼。鑑定過才賣得到好價錢。</span>'

      return `
        <div class="applicant ${taking ? 'applicant--taking' : ''}">
          <div class="applicant__row">
            <span class="roster__name">${esc(i.name)}</span>
            <span class="applicant__cost">${i.weight}kg</span>
          </div>
          ${body}
          <div class="member__btns">
            ${
              i.identified
                ? ''
                : `<button class="ward" data-identify="${esc(i.id)}" type="button" ${
                    meta.funds >= cost ? '' : 'disabled'
                  }>鑑定 ${cost}</button>`
            }
            <button class="ward ${taking ? 'ward--on' : ''}" data-take-down="${esc(i.id)}" type="button">
              ${taking ? '帶下去' : '留在城裡'}
            </button>
            <button class="ward" data-sell="${esc(i.id)}" type="button">變賣 ${sellValue(i)}</button>
          </div>
        </div>`
    })
    .join('')

  const weight = takeDownWeight(meta)

  return `
    <section>
      <h2>遺物　${meta.vault.length}</h2>
      <p class="hint">未鑑定的只值三成。帶下去的遺物會佔負重，而且死在下面就再也拿不回來。</p>
      <div class="applicants">${rows}</div>
      ${weight > 0 ? `<div class="buy__total">要帶下去的重量　${weight.toFixed(1)}kg</div>` : ''}
    </section>`
}

function questCard(q: Quest, meta: MetaState, taken: boolean): string {
  const daysLeft = q.deadline - meta.day
  const full = activeQuests(meta).length >= MAX_ACTIVE_QUESTS

  return `
    <div class="quest ${taken ? 'quest--taken' : ''}">
      <div class="quest__row">
        <span class="quest__title">${esc(q.title)}</span>
        <span class="quest__reward">${q.reward}</span>
      </div>
      <p class="quest__desc">${esc(q.desc)}</p>
      <div class="quest__row">
        <span class="quest__meta">
          ${q.minDepth > 0 ? `需抵達 ${esc(formatDepth(q.minDepth))}　·　` : ''}剩 ${daysLeft} 日
        </span>
        ${
          taken
            ? `<button class="ward" data-abandon="${esc(q.id)}" type="button">放棄</button>`
            : `<button class="ward" data-take="${esc(q.id)}" type="button" ${full ? 'disabled' : ''}>承接</button>`
        }
      </div>
    </div>`
}

function questBoard(meta: MetaState): string {
  const taken = activeQuests(meta)
  const open = openQuests(meta)
  const rank = currentRank(meta)
  const next = nextRank(meta)

  const promotion = next
    ? `
      <section>
        <h2>階級　${esc(rank.name)}</h2>
        <p class="quest__desc">${esc(rank.desc)}</p>
        <dl class="detail__stats detail__stats--wide">
          <div>
            <dt>晉升${esc(next.name)}・委託</dt>
            <dd>${meta.questsCompleted} / ${next.quests}</dd>
          </div>
          <div>
            <dt>晉升${esc(next.name)}・深度</dt>
            <dd>${esc(formatDepth(meta.deepestReached))} / ${esc(formatDepth(next.depth))}</dd>
          </div>
        </dl>
        <p class="hint">達成之後回到地表就會自動晉升。階級不限制你能下潛多深，它決定的是接得到什麼委託。</p>
      </section>`
    : `
      <section>
        <h2>階級　${esc(rank.name)}</h2>
        <p class="quest__desc">${esc(rank.desc)}</p>
      </section>`

  return `
    ${promotion}

    <section>
      <h2>已承接　${taken.length} / ${MAX_ACTIVE_QUESTS}</h2>
      ${
        taken.length
          ? taken.map((q) => questCard(q, meta, true)).join('')
          : '<p class="hint">還沒有接下任何委託。空手下去也可以，只是沒有人會付錢。</p>'
      }
    </section>

    <section>
      <h2>公告板</h2>
      ${open.map((q) => questCard(q, meta, false)).join('')}
      <div class="actions">
        <button class="action" data-rest="1" type="button">在城裡待一天</button>
      </div>
      <p class="hint">等待會讓傷勢好轉，也會讓委託過期。</p>
    </section>`
}

function records(meta: MetaState): string {
  const rate =
    meta.runIndex > 0 ? Math.round((meta.runsSurvived / meta.runIndex) * 100) : null

  const lost = meta.lostSouls
    .map(
      (s) => `
        <li class="grave">
          <span class="grave__name">${esc(s.name)}</span>
          <span class="grave__where">${esc(formatDepth(s.depth))}　還在下面</span>
        </li>`,
    )
    .join('')

  return `
    <section>
      <h2>紀錄</h2>
      <dl class="detail__stats detail__stats--wide">
        <div><dt>下潛次數</dt><dd>${meta.runIndex}</dd></div>
        <div><dt>活著回來</dt><dd>${meta.runsSurvived}${rate === null ? '' : `<span class="detail__base">（${rate}%）</span>`}</dd></div>
        <div><dt>最深抵達</dt><dd>${esc(formatDepth(meta.deepestReached))}</dd></div>
        <div><dt>累計帶回</dt><dd>${meta.totalEarned}</dd></div>
      </dl>
    </section>

    ${
      lost
        ? `<section>
             <h2>還在下面的人　${meta.lostSouls.length}</h2>
             <p class="hint">他們沒有被帶回來。深淵裡有東西還在叫著這些名字。</p>
             <ul class="graves">${lost}</ul>
           </section>`
        : ''
    }`
}

/** 準備一趟探索是有順序的：先決定誰去，才決定帶多少 */
function tabBar(tab: TownTab, meta: MetaState, selected: string[]): string {
  const tabs: { id: TownTab; label: string; note: string }[] = [
    { id: 'quests', label: '① 委託', note: `${activeQuests(meta).length}/${MAX_ACTIVE_QUESTS}` },
    { id: 'party', label: '② 隊伍', note: `${selected.length}/${PARTY_SIZE}` },
    { id: 'supply', label: '③ 補給', note: `${loadoutCost(meta.loadout)}` },
    { id: 'orphanage', label: '孤兒院', note: `${meta.applicants.length}` },
    { id: 'vault', label: '遺物', note: `${meta.vault.length}` },
    { id: 'records', label: '紀錄', note: `${meta.graveyard.length}` },
  ]

  return `
    <nav class="tabs">
      ${tabs
        .map(
          (t) => `
            <button class="tab ${t.id === tab ? 'tab--on' : ''}" data-tab="${t.id}" type="button">
              ${t.label}<span class="tab__note">${esc(t.note)}</span>
            </button>`,
        )
        .join('')}
    </nav>`
}

export interface TownView {
  meta: MetaState
  selected: string[]
  summary: RunSummary | null
  muted: boolean
  wiping?: boolean
  tab?: TownTab
  /** 目前展開詳細資料的隊員 */
  expanded?: string | null
}

export function renderTown(view: TownView): string {
  const { meta, selected, summary, muted } = view
  const wiping = view.wiping ?? false
  const tab = view.tab ?? 'party'
  const expanded = view.expanded ?? null

  const available = availableMembers(meta)
  const cost = departCost(meta)
  const affordable = cost <= meta.funds
  const canDepart = selected.length > 0 && selected.length <= PARTY_SIZE && affordable
  const departWhy = selected.length === 0 ? '還沒有決定誰要下去' : '付不起這趟的花費'

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

  const partyPage = `
    ${summaryPanel(summary)}
    <section>
      <h2>名冊　選 ${selected.length} / ${PARTY_SIZE}</h2>
      <div class="roster">${available
        .map((c) => memberCard(c, selected, meta, expanded))
        .join('')}</div>
      ${pairs.length ? `<p class="roster__hint">一起活著回來過：${esc(pairs.join('、'))}</p>` : ''}
      ${
        available.length === 0
          ? '<p class="hint">名冊上一個人也不剩了。到孤兒院看看。</p>'
          : ''
      }
      <div class="actions">
        <button class="action action--key" data-tab="supply" type="button" ${selected.length > 0 ? '' : 'disabled'}>
          下一步・準備補給
          ${selected.length > 0 ? '' : '<span class="action__why">還沒有決定誰要下去</span>'}
        </button>
      </div>
      ${selected.length > 0 ? '' : '<p class="hint hint--depart">點名冊上的人把他們編進隊伍。最多四個人。</p>'}
    </section>`

  const supplyPage = `
    ${supplyShop(meta, selected)}
    ${departurePicker(meta)}
    <section>
      <div class="actions">
        <button class="action" data-tab="party" type="button">回到隊伍</button>
        <button class="action action--key" data-depart="1" type="button" ${canDepart ? '' : 'disabled'}>
          ${
            canDepart
              ? `出發下潛（${selected.length} 人・共 ${cost}${
                  meta.departDepth > 0 ? `・自 ${esc(formatDepth(meta.departDepth))}` : ''
                }）`
              : '出發下潛'
          }
          ${canDepart ? '' : `<span class="action__why">${departWhy}</span>`}
        </button>
      </div>
    </section>`

  const pages: Record<TownTab, string> = {
    quests: questBoard(meta),
    party: partyPage,
    supply: supplyPage,
    orphanage: orphanage(meta),
    vault: vault(meta),
    records: `${records(meta)}${graveyard(meta)}${dangerZone(wiping)}`,
  }

  return `
    <div class="depth-bar">
      <div class="depth-bar__top">
        <span class="depth-bar__depth">奧斯城</span>
        <span class="depth-bar__layer">
          ${esc(currentRank(meta).name)}　·　資金 ${meta.funds}　·　第 ${meta.day} 日
          <button class="mute" data-mute="1" type="button" title="音效">${muted ? '🔇' : '🔊'}</button>
        </span>
      </div>
      ${tabBar(tab, meta, selected)}
    </div>

    <div class="town-page">${pages[tab]}</div>`
}
