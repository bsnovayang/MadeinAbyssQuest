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

/**
 * 行動順序條（企劃書 12-1）。
 * 玩家看得到「三個行動之後那個東西會動」，牽制才有意義。
 */
function timeline(b: BattleState): string {
  const upcoming = forecast(b, 7)

  return `
    <div class="timeline">
      <div class="timeline__label">行動順序</div>
      <ol class="timeline__list">
        ${upcoming
          .map(
            (c, i) => `
              <li class="tl ${c.side === 'enemy' ? 'tl--enemy' : ''} ${i === 0 ? 'tl--now' : ''}">
                ${esc(c.name)}${c.charging > 0 ? '<span class="tl__charge">蓄力</span>' : ''}
              </li>`,
          )
          .join('')}
      </ol>
    </div>`
}

function unitRow(c: Combatant, selected: string | null): string {
  const pct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0
  const def = c.enemyId ? enemyById(c.enemyId) : undefined
  const down = c.status === 'down'

  return `
    <button
      class="unit ${c.side === 'enemy' ? 'unit--enemy' : ''} ${down ? 'unit--down' : ''} ${
        selected === c.id ? 'unit--target' : ''
      }"
      data-target="${esc(c.id)}"
      type="button"
      ${down ? 'disabled' : ''}
    >
      <span class="unit__row">
        <span class="unit__name">${esc(c.name)}</span>
        <span class="unit__hp">${c.hp} / ${c.maxHp}</span>
      </span>
      <span class="unit__track"><span class="unit__fill" style="width:${pct.toFixed(0)}%"></span></span>
      ${c.charging > 0 ? '<span class="unit__note">正在聚集力量</span>' : ''}
      ${def && c.side === 'enemy' && selected === c.id ? `<span class="unit__desc">${esc(def.desc)}</span>` : ''}
    </button>`
}

export function renderBattle(b: BattleState, selected: string | null, medicine: number): string {
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

  return `
    <div class="battle">
      ${timeline(b)}

      <section>
        <h2>擋在前面的東西</h2>
        <div class="units">${living(b, 'enemy')
          .concat(b.combatants.filter((c) => c.side === 'enemy' && c.status === 'down'))
          .map((c) => unitRow(c, selected))
          .join('')}</div>
      </section>

      <section>
        <h2>隊伍</h2>
        <div class="units">${b.combatants
          .filter((c) => c.side === 'party')
          .map((c) => unitRow(c, selected))
          .join('')}</div>
      </section>

      <section>
        <h2>${actor ? `輪到${esc(actor.name)}` : '……'}</h2>
        <div class="skills">${commands}</div>
        <div class="actions">
          <button class="action" data-flee="1" type="button">撤退</button>
        </div>
        <p class="hint">逃跑永遠是有效的選項。深淵不是競技場。</p>
      </section>
    </div>`
}
