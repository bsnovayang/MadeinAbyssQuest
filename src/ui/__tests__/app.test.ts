// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from '../app'
import { isMuted } from '../audio'
import { createMeta, deployParty } from '../../core/meta'
import { createRun } from '../../core/run'

let root: HTMLDivElement
let app: App

function click(selector: string): void {
  const el = root.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`找不到 ${selector}`)
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
}

function exists(selector: string): boolean {
  return !!root.querySelector(selector)
}

/** 走真實的動線：先選人，再到補給頁出發 */
function goto(tab: string): void {
  click(`.tab[data-tab="${tab}"]`)
}

function departWith(...ids: string[]): void {
  goto('party')
  for (const id of ids) click(`[data-pick="${id}"]`)
  goto('supply')
  click('[data-depart]')
}

beforeEach(async () => {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  app = createApp(root, { pace: 0, seed: () => 'test-seed' })
  await app.start()
})

describe('奧斯城', () => {
  it('一開始停在第一步的名冊，而不是探索畫面', () => {
    expect(app.snapshot().view).toBe('town')
    expect(app.snapshot().tab).toBe('party')
    expect(exists('[data-pick]')).toBe(true)
    expect(exists('.tab--on[data-tab="party"]')).toBe(true)
    // 出發在第二步，不在這一頁
    expect(exists('[data-depart]')).toBe(false)
  })

  it('點選隊員會被記錄下來', () => {
    click('[data-pick="riko"]')
    expect(app.snapshot().selected).toEqual(['riko'])

    click('[data-pick="reg"]')
    expect(app.snapshot().selected).toEqual(['riko', 'reg'])

    // 再點一次取消
    click('[data-pick="riko"]')
    expect(app.snapshot().selected).toEqual(['reg'])
  })

  it('點名字裡的文字也算點到那個人', () => {
    const span = root.querySelector<HTMLElement>('[data-pick="riko"] .roster__name')
    expect(span).not.toBeNull()
    span!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(app.snapshot().selected).toEqual(['riko'])
  })

  it('沒選人時走不到下一步，而且說得出原因', () => {
    const next = root.querySelector('[data-tab="supply"].action')!
    expect(next.hasAttribute('disabled')).toBe(true)
    expect(next.querySelector('.action__why')?.textContent).toContain('還沒有決定誰要下去')
    expect(root.querySelector('.hint--depart')?.textContent).toContain('點名冊上的人')
  })

  it('選了人之後才走得到補給頁，按鈕顯示人數', () => {
    click('[data-pick="riko"]')
    expect(root.querySelector('[data-tab="supply"].action')?.hasAttribute('disabled')).toBe(
      false,
    )
    expect(root.querySelector('.hint--depart')).toBeNull()

    goto('supply')
    expect(app.snapshot().tab).toBe('supply')
    expect(root.querySelector('[data-depart]')?.textContent).toContain('1 人')
  })

  it('★選好人、備好補給之後會真的出發', () => {
    departWith('riko', 'reg')

    expect(app.snapshot().view).toBe('run')
    expect(app.snapshot().run?.party).toHaveLength(2)
    expect(exists('[data-node]')).toBe(true)
  })

  it('分頁可以自由切換，回城時回到第一步', () => {
    goto('records')
    expect(app.snapshot().tab).toBe('records')
    expect(root.textContent).toContain('墓地')

    goto('orphanage')
    expect(exists('[data-hire]')).toBe(true)

    goto('party')
    expect(exists('[data-pick]')).toBe(true)
  })

  it('最多只能帶 4 個人', () => {
    for (const id of ['riko', 'reg', 'urna', 'tobi']) click(`[data-pick="${id}"]`)
    expect(app.snapshot().selected).toHaveLength(4)
  })
})

describe('探索', () => {
  beforeEach(() => {
    departWith('riko', 'reg')
  })

  it('點一個節點會往下推進', async () => {
    const before = app.snapshot().run!.depth
    click('[data-node]')
    await Promise.resolve()
    expect(app.snapshot().run!.depth).toBeGreaterThan(before)
  })

  it('可以宣告撤離，畫面切換成歸途', async () => {
    click('[data-ascent]')
    await Promise.resolve()
    expect(app.snapshot().run!.direction).toBe('up')
    expect(root.innerHTML).toContain('歸途')
    expect(root.classList.contains('mood--ascent')).toBe(true)
  })

  it('探索結束後可以回到奧斯城並完成結算', async () => {
    const run = app.snapshot().run!
    run.over = true
    run.endReason = 'surfaced'
    for (const c of run.party) c.status = 'alive'
    app.handleClick(new window.MouseEvent('click'))

    // 直接重繪出結束畫面再按鈕
    click('[data-node],[data-ascent]')
    await Promise.resolve()
  })
})

/**
 * 一個畫面原則：預設只留必要資訊與動作按鈕。
 * 探索的每一步都是一次決策，捲動找不到選項就是設計失敗。
 */
describe('探索畫面的收合', () => {
  beforeEach(() => departWith('riko', 'reg'))

  it('預設看得到選項與動作，看不到隊伍細節與筆記', () => {
    expect(exists('[data-node]')).toBe(true)
    expect(exists('[data-ascent]')).toBe(true)

    // 面板存在，但內容收著
    expect(exists('[data-panel="party"]')).toBe(true)
    expect(exists('.member__name')).toBe(false)
    expect(exists('.log__entry')).toBe(false)
    expect(exists('.stats')).toBe(false)
  })

  it('點面板標題才展開，再點收合', () => {
    click('[data-panel="party"]')
    expect(exists('.member__name')).toBe(true)

    click('[data-panel="party"]')
    expect(exists('.member__name')).toBe(false)
  })

  it('必要的數字仍然常駐在狀態列', () => {
    const vitals = root.querySelector('.vitals')?.textContent ?? ''
    expect(vitals).toContain('人')
    expect(vitals).toContain('水')
    expect(vitals).toContain('kg')
  })

  it('撤離時隊伍自動展開 —— 用藥與轉嫁都在那裡', async () => {
    click('[data-ascent]')
    await new Promise((r) => setTimeout(r, 0))
    expect(exists('.member__name')).toBe(true)
    expect(exists('.member__fc')).toBe(true)
  })

  /**
   * 不只是版面 —— 不動之楔按下去就永久失去一名隊友，
   * 這種東西不該是隨手誤觸得到的大按鈕。
   */
  it('遺物收在面板裡，展開才按得到', () => {
    app.snapshot().run!.carried.push({
      id: 'r1',
      name: '不動之楔',
      weight: 6,
      kind: 'relic',
      value: 900,
      identified: true,
      relicId: 'immovable-wedge',
    })
    click('[data-panel="supply"]') // 觸發重繪

    const head = root.querySelector('[data-panel="relics"]')!
    expect(head.textContent).toContain('遺物')
    expect(head.textContent).toContain('1')
    expect(exists('[data-relic]')).toBe(false)

    click('[data-panel="relics"]')
    expect(exists('[data-relic]')).toBe(true)
    expect(root.querySelector('.relic')?.textContent).toContain('全隊立即返回地表')
  })

  it('快要害死人的事情會浮到狀態列', () => {
    const run = app.snapshot().run!
    run.exhaustion = 3
    click('[data-panel="supply"]')
    expect(root.querySelector('.alerts')?.textContent).toContain('力竭')
  })
})

describe('淡出提示', () => {
  it('行動之後會出現提示，而不是把紀錄攤在畫面上', async () => {
    departWith('riko', 'reg')
    expect(root.querySelectorAll('.toast').length).toBe(0)

    click('[data-node]')
    await new Promise((r) => setTimeout(r, 0))
    expect(root.querySelectorAll('.toast').length).toBeGreaterThan(0)
  })

  it('展開面板不會讓提示重播', async () => {
    departWith('riko', 'reg')
    click('[data-node]')
    await new Promise((r) => setTimeout(r, 0))
    const before = root.querySelectorAll('.toast').length

    click('[data-panel="notes"]')
    expect(root.querySelectorAll('.toast').length).toBe(before)
  })

  it('回到城裡就把提示清乾淨', async () => {
    departWith('riko', 'reg')
    click('[data-node]')
    await new Promise((r) => setTimeout(r, 0))

    const run = app.snapshot().run!
    run.over = true
    run.endReason = 'surfaced'
    click('[data-panel="notes"]')
    click('[data-return]')
    expect(root.querySelectorAll('.toast').length).toBe(0)
  })
})

describe('戰鬥', () => {
  /** act() 是非同步的，點完要讓 microtask 跑完才看得到結果 */
  const flush = () => new Promise((r) => setTimeout(r, 0))

  /** 一路往下走到打起來為止 */
  async function untilBattle(): Promise<boolean> {
    departWith('riko', 'reg', 'urna', 'tobi')
    for (let i = 0; i < 40; i++) {
      if (app.snapshot().run?.battle) return true
      const node = root.querySelector('[data-node]')
      if (!node) return false
      node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flush()
    }
    return !!app.snapshot().run?.battle
  }

  it('遭遇會切到戰鬥畫面，而且看得到行動順序', async () => {
    expect(await untilBattle()).toBe(true)
    expect(exists('.timeline')).toBe(true)
    expect(root.querySelectorAll('.tl').length).toBeGreaterThan(1)
    expect(exists('.skill')).toBe(true)
    expect(exists('[data-flee]')).toBe(true)
    // 打起來的時候不能繼續探索
    expect(exists('[data-node]')).toBe(false)
  })

  it('可以點敵人選定目標', async () => {
    expect(await untilBattle()).toBe(true)
    const foe = root.querySelector('.unit--enemy')!
    const id = foe.getAttribute('data-target')!
    foe.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(root.querySelector(`[data-target="${id}"]`)?.classList.contains('unit--target')).toBe(
      true,
    )
  })

  it('撤退會結束戰鬥並回到探索', async () => {
    expect(await untilBattle()).toBe(true)
    click('[data-flee]')
    await flush()
    expect(app.snapshot().run?.battle).toBeNull()
    expect(exists('.timeline')).toBe(false)
    expect(exists('[data-node]')).toBe(true)
  })
})

describe('委託', () => {
  beforeEach(() => goto('quests'))

  it('公告板列出委託，看得到報酬、深度與期限', () => {
    const cards = root.querySelectorAll('.quest')
    expect(cards.length).toBeGreaterThan(0)
    const first = cards[0]!
    expect(first.querySelector('.quest__reward')?.textContent?.trim()).toBeTruthy()
    expect(first.querySelector('.quest__desc')?.textContent?.trim()).toBeTruthy()
    expect(first.querySelector('.quest__meta')?.textContent).toContain('剩')
  })

  it('承接之後移到已承接區，且最多兩張', () => {
    const ids = [...root.querySelectorAll('[data-take]')].map((b) =>
      b.getAttribute('data-take'),
    )
    click(`[data-take="${ids[0]}"]`)
    expect(app.snapshot().meta.quests.filter((q) => q.state === 'taken')).toHaveLength(1)
    expect(exists('.quest--taken')).toBe(true)

    click(`[data-take="${ids[1]}"]`)
    expect(app.snapshot().meta.quests.filter((q) => q.state === 'taken')).toHaveLength(2)

    // 額滿之後承接鈕停用
    expect(
      [...root.querySelectorAll('[data-take]')].every((b) => b.hasAttribute('disabled')),
    ).toBe(true)
  })

  it('可以放棄已承接的委託', () => {
    const id = root.querySelector('[data-take]')!.getAttribute('data-take')!
    click(`[data-take="${id}"]`)
    click(`[data-abandon="${id}"]`)
    expect(app.snapshot().meta.quests.filter((q) => q.state === 'taken')).toHaveLength(0)
  })

  it('顯示晉升進度，而且說清楚階級不限制深度', () => {
    const text = root.textContent ?? ''
    expect(text).toContain('紅笛')
    expect(text).toContain('晉升蒼笛')
    expect(text).toContain('階級不限制你能下潛多深')
  })

  it('在城裡待一天會推進日期', () => {
    const day = app.snapshot().meta.day
    click('[data-rest]')
    expect(app.snapshot().meta.day).toBe(day + 1)
  })

  it('承接的委託在探索中看得見進度', () => {
    const id = root.querySelector('[data-take]')!.getAttribute('data-take')!
    click(`[data-take="${id}"]`)
    departWith('riko')
    click('[data-panel="quests"]')
    expect(exists('.runquests')).toBe(true)
    expect(root.querySelector('.runquests__title')?.textContent?.trim()).toBeTruthy()
  })
})

describe('休養', () => {
  it('傷勢未癒的人在名冊上看得到，但選不了', () => {
    const tobi = app.snapshot().meta.roster.find((c) => c.id === 'tobi')!
    tobi.hp = 1
    goto('records')
    goto('party')

    const card = root.querySelector('[data-pick="tobi"]')!
    expect(card.hasAttribute('disabled')).toBe(true)
    expect(card.textContent).toContain('傷勢未癒')

    click('[data-pick="tobi"]')
    expect(app.snapshot().selected).toEqual([])
  })
})

describe('隊員詳細', () => {
  it('展開後看得到介紹、能力與特質', () => {
    expect(exists('.detail')).toBe(false)
    click('[data-detail="riko"]')

    const detail = root.querySelector('.detail')!
    expect(detail.querySelector('.detail__bio')?.textContent).toContain('萊莎')
    expect(detail.textContent).toContain('耐受度')
    expect(detail.textContent).toContain('深淵知識') // 莉可的招牌能力
  })

  it('展開不會影響隊伍的選擇', () => {
    click('[data-detail="riko"]')
    expect(app.snapshot().selected).toEqual([])

    click('[data-pick="riko"]')
    expect(app.snapshot().selected).toEqual(['riko'])
    expect(exists('.detail')).toBe(true)
  })

  it('一次只展開一個，再按一次收合', () => {
    click('[data-detail="riko"]')
    click('[data-detail="reg"]')
    expect(root.querySelectorAll('.detail')).toHaveLength(1)
    expect(root.querySelector('.detail')?.textContent).toContain('機械人偶')

    click('[data-detail="reg"]')
    expect(exists('.detail')).toBe(false)
  })

  it('孤兒院的孩子也有來歷', () => {
    goto('orphanage')
    const bios = [...root.querySelectorAll('.applicant .roster__name')]
    expect(bios.length).toBeGreaterThan(0)
    expect(app.snapshot().meta.applicants.every((c) => c.bio.length > 0)).toBe(true)
  })
})

describe('遺物與鑑定師', () => {
  function stock(identified = false): void {
    app.snapshot().meta.vault.push({
      id: 'v1',
      name: identified ? '不動之楔' : '鏽色的楔子',
      weight: 6,
      kind: 'relic',
      value: 900,
      identified,
      relicId: 'immovable-wedge',
    })
    goto('vault')
  }

  it('倉庫空的時候說得清楚為什麼', () => {
    goto('vault')
    expect(root.textContent).toContain('倉庫是空的')
  })

  it('未鑑定的只看得到外觀，不會洩漏是什麼', () => {
    stock()
    const card = root.querySelector('.applicant')!
    expect(card.textContent).toContain('鏽色的楔子')
    expect(card.textContent).not.toContain('不動之楔')
    expect(card.textContent).not.toContain('隨機一名隊友')
  })

  it('鑑定要花錢，之後才看得到效果與代價', () => {
    stock()
    app.snapshot().meta.funds = 9999
    goto('vault')

    click('[data-identify="v1"]')
    const card = root.querySelector('.applicant')!
    expect(card.textContent).toContain('不動之楔')
    expect(card.textContent).toContain('隨機一名隊友被留在原地')
    expect(app.snapshot().meta.funds).toBeLessThan(9999)
  })

  it('可以變賣，未鑑定的價錢比較差', () => {
    stock()
    const before = app.snapshot().meta.funds
    click('[data-sell="v1"]')
    expect(app.snapshot().meta.vault).toHaveLength(0)
    expect(app.snapshot().meta.funds).toBe(before + 270)
  })

  it('可以指定帶下去，出發時會進背包', () => {
    stock(true)
    click('[data-take-down="v1"]')
    expect(app.snapshot().meta.takeDown).toEqual(['v1'])

    departWith('riko', 'reg')
    expect(app.snapshot().run?.carried.some((i) => i.relicId === 'immovable-wedge')).toBe(true)
    expect(app.snapshot().meta.vault).toHaveLength(0)
  })
})

describe('紀錄頁', () => {
  beforeEach(() => goto('records'))

  it('顯示下潛次數、生還次數、最深抵達與累計收益', () => {
    const text = root.textContent ?? ''
    expect(text).toContain('下潛次數')
    expect(text).toContain('活著回來')
    expect(text).toContain('最深抵達')
    expect(text).toContain('累計帶回')
  })

  it('墓地與清除紀錄都在同一頁', () => {
    expect(root.textContent).toContain('墓地')
    expect(exists('[data-wipe]')).toBe(true)
  })

  it('留在深淵的人會單獨列出', () => {
    expect(root.textContent).not.toContain('還在下面的人')

    app.snapshot().meta.lostSouls.push({ name: '托比', depth: 8000 })
    goto('records')
    expect(root.textContent).toContain('還在下面的人')
    expect(root.textContent).toContain('托比')
  })
})

describe('補給商', () => {
  beforeEach(() => {
    click('[data-pick="riko"]')
    goto('supply')
  })

  it('加減會改變數量、花費與重量', () => {
    const before = app.snapshot().meta.loadout.food
    click('[data-buy="food:1"]')
    expect(app.snapshot().meta.loadout.food).toBe(before + 1)

    click('[data-buy="food:-1"]')
    expect(app.snapshot().meta.loadout.food).toBe(before)

    expect(root.querySelector('.buy__total')?.textContent).toContain('kg')
  })

  it('買不起就不能再加', () => {
    const meta = app.snapshot().meta
    meta.funds = 0
    click('[data-buy="food:-1"]')

    const add = root.querySelector('[data-buy="food:1"]')!
    expect(add.hasAttribute('disabled')).toBe(true)

    const before = app.snapshot().meta.loadout.food
    click('[data-buy="food:1"]')
    expect(app.snapshot().meta.loadout.food).toBe(before)
  })

  it('出發時才付補給的錢', () => {
    const meta = app.snapshot().meta
    const funds = meta.funds
    click('[data-depart]')

    expect(app.snapshot().meta.funds).toBeLessThan(funds)
    expect(app.snapshot().run?.supplies.food).toBe(meta.loadout.food)
  })

  it('沒錢買補給時說得出原因', () => {
    const meta = app.snapshot().meta
    meta.funds = 0
    goto('supply')

    const depart = root.querySelector('[data-depart]')!
    expect(depart.hasAttribute('disabled')).toBe(true)
    expect(depart.querySelector('.action__why')?.textContent).toContain('付不起')
  })
})

describe('資訊揭露', () => {
  it('帶著測繪士才看得出前方是什麼', () => {
    departWith('urna') // 烏爾娜有測繪
    expect(root.querySelector('.choice__kind')?.textContent?.trim()).not.toBe('？')
    expect(exists('.choice__kind--unknown')).toBe(false)
  })

  it('沒有測繪士就只剩筆記上的描述', () => {
    departWith('tobi') // 托比只是學徒
    expect(exists('.choice__kind--unknown')).toBe(true)
    expect(root.querySelector('.choice__kind')?.textContent?.trim()).toBe('？')
    // 描述本身仍然看得見，那才是判斷的依據
    expect(root.querySelector('.choice')?.textContent?.trim().length).toBeGreaterThan(2)
  })
})

describe('孤兒院', () => {
  beforeEach(() => goto('orphanage'))

  it('先看見人是誰，才決定要不要帶走', () => {
    const cards = root.querySelectorAll('.applicant')
    expect(cards).toHaveLength(3)
    for (const card of cards) {
      expect(card.querySelector('.roster__name')?.textContent?.trim()).toBeTruthy()
      expect(card.querySelector('.roster__stats')?.textContent).toContain('耐受')
      expect(card.querySelector('.applicant__cost')?.textContent?.trim()).toBeTruthy()
    }
  })

  it('沒錢時不會招募，也會說明原因', () => {
    app.snapshot().meta.funds = 0
    goto('orphanage')
    const before = app.snapshot().meta.roster.length

    const btn = root.querySelector('[data-hire]')!
    expect(btn.hasAttribute('disabled')).toBe(true)
    expect(btn.querySelector('.action__why')?.textContent).toContain('資金不足')

    click('[data-hire]')
    expect(app.snapshot().meta.roster).toHaveLength(before)
  })

  it('有錢時帶走的是你點的那一個，名額由新的人補上', () => {
    const meta = app.snapshot().meta
    meta.funds = 99999
    goto('orphanage')

    const target = root.querySelector('.applicant')!
    const name = target.querySelector('.roster__name')!.textContent!.trim()
    const id = target.querySelector('[data-hire]')!.getAttribute('data-hire')!

    click(`[data-hire="${id}"]`)

    expect(app.snapshot().meta.roster.some((c) => c.name === name)).toBe(true)
    expect(app.snapshot().meta.applicants).toHaveLength(3)
    expect(app.snapshot().meta.applicants.some((c) => c.id === id)).toBe(false)
    expect(app.snapshot().meta.funds).toBeLessThan(99999)
  })
})

describe('清除紀錄', () => {
  beforeEach(() => goto('records'))

  it('要按兩次才會真的清除', () => {
    const meta = app.snapshot().meta
    meta.funds = 500
    meta.graveyard.push({ name: '托比', depth: 4000, cause: 'dead', buried: false, runIndex: 1 })
    goto('records')

    click('[data-wipe]')
    expect(exists('[data-wipe-confirm]')).toBe(true)
    // 這一步還沒有動到任何東西
    expect(app.snapshot().meta.funds).toBe(500)
    expect(app.snapshot().meta.graveyard).toHaveLength(1)

    click('[data-wipe-confirm]')
    expect(app.snapshot().meta.funds).not.toBe(500)
    expect(app.snapshot().meta.graveyard).toHaveLength(0)
    expect(app.snapshot().selected).toEqual([])
    expect(app.snapshot().view).toBe('town')
  })

  it('可以反悔', () => {
    const meta = app.snapshot().meta
    meta.funds = 500
    click('[data-wipe]')
    click('[data-wipe-cancel]')

    expect(exists('[data-wipe-confirm]')).toBe(false)
    expect(exists('[data-wipe]')).toBe(true)
    expect(app.snapshot().meta.funds).toBe(500)
  })

  it('清除會通知外部的存檔層', async () => {
    let cleared = 0
    const r2 = document.createElement('div')
    document.body.appendChild(r2)
    const a2 = createApp(r2, { pace: 0, seed: () => 's', clear: () => cleared++ })
    await a2.start()

    const hit = (sel: string) =>
      r2
        .querySelector<HTMLElement>(sel)!
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

    hit('.tab[data-tab="records"]')
    hit('[data-wipe]')
    hit('[data-wipe-confirm]')
    expect(cleared).toBe(1)
  })
})

/**
 * 停用而不說原因的按鈕是死路 —— 玩家分不出那是壞掉還是刻意的。
 * 這條規則實際上就是「出發下潛沒反應」那份回報的根源。
 */
describe('停用的按鈕都要說得出原因', () => {
  function assertAllExplained(): void {
    const disabled = [...root.querySelectorAll('button.action[disabled]')]
    for (const b of disabled) {
      expect(b.querySelector('.action__why'), `未說明原因：${b.textContent?.trim()}`).not.toBeNull()
    }
  }

  it('奧斯城', () => {
    expect(root.querySelectorAll('button.action[disabled]').length).toBeGreaterThan(0)
    assertAllExplained()
  })

  it('探索途中', () => {
    departWith('riko')
    expect(root.querySelectorAll('button.action[disabled]').length).toBeGreaterThan(0)
    assertAllExplained()
  })
})

describe('音效', () => {
  it('預設是關閉的 —— 難聽的音樂比沒有音樂更傷氣氛', () => {
    expect(isMuted()).toBe(true)
  })
})

/**
 * RunState 一路長出了 echoes、battle、aftermath ——
 * 每加一個欄位，舊存檔就多一種炸掉的方式。
 * 存檔是系統邊界，補齊要在讀取時做。
 */
describe('舊存檔', () => {
  async function bootWith(run: unknown): Promise<{ app: App; hit: (sel: string) => void }> {
    const r2 = document.createElement('div')
    document.body.appendChild(r2)
    const meta = createMeta()
    const a2 = createApp(r2, {
      pace: 0,
      seed: () => 's',
      load: () => Promise.resolve({ version: 1 as const, meta, run: run as never }),
    })
    await a2.start()
    return {
      app: a2,
      hit: (sel) =>
        r2
          .querySelector<HTMLElement>(sel)!
          .dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    }
  }

  it('缺少 aftermath 的舊存檔照樣能結算回城', async () => {
    const base = createRun('legacy', { party: deployParty(createMeta(), ['riko', 'reg']) })
    base.over = true
    base.endReason = 'surfaced'

    // 模擬舊版本存下來的資料
    const legacy = { ...base } as Record<string, unknown>
    delete legacy.aftermath
    delete legacy.echoes
    delete legacy.battle

    const { app: a2, hit } = await bootWith(legacy)
    expect(a2.snapshot().view).toBe('run')

    // 這一步以前會丟 run.aftermath is not iterable
    expect(() => hit('[data-return]')).not.toThrow()
    expect(a2.snapshot().view).toBe('town')
  })

  it('隊員缺少後來才加的欄位也不會炸', async () => {
    const base = createRun('legacy2', { party: deployParty(createMeta(), ['riko']) })
    for (const c of base.party) {
      delete (c as unknown as Record<string, unknown>).traits
      delete (c as unknown as Record<string, unknown>).bio
    }

    const { app: a2 } = await bootWith(base)
    expect(a2.snapshot().run?.party[0]?.traits).toEqual([])
    expect(a2.snapshot().run?.party[0]?.bio).toBe('')
  })
})

describe('韌性', () => {
  it('音效壞掉也不能擋住遊戲', async () => {
    const boom = () => {
      throw new Error('AudioContext 不可用')
    }
    const r2 = document.createElement('div')
    document.body.appendChild(r2)
    const a2 = createApp(r2, {
      pace: 0,
      seed: () => 's',
      audio: {
        ensure: boom,
        setVoices: boom,
        setWarmth: boom,
        swell: boom,
        hush: boom,
        reset: boom,
        toggleMute: boom,
        isMuted: () => false,
      },
    })
    await a2.start()

    const hit = (sel: string) =>
      r2
        .querySelector<HTMLElement>(sel)!
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

    hit('[data-pick="riko"]')
    expect(a2.snapshot().selected).toEqual(['riko'])
  })

  it('存檔壞掉也不能擋住遊戲', async () => {
    const r2 = document.createElement('div')
    document.body.appendChild(r2)
    const a2 = createApp(r2, {
      pace: 0,
      seed: () => 's',
      save: () => {
        throw new Error('IndexedDB 不可用')
      },
    })
    await a2.start()

    const hit = (sel: string) =>
      r2
        .querySelector<HTMLElement>(sel)!
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    hit('[data-pick="riko"]')
    hit('.tab[data-tab="supply"]')
    hit('[data-depart]')

    expect(a2.snapshot().view).toBe('run')
  })
})

describe('存檔', () => {
  it('動作之後會寫入存檔', async () => {
    const writes: unknown[] = []
    const r2 = document.createElement('div')
    document.body.appendChild(r2)
    const a2 = createApp(r2, { pace: 0, seed: () => 's', save: (d) => writes.push(d) })
    await a2.start()

    const hit = (sel: string) =>
      r2
        .querySelector<HTMLElement>(sel)!
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    hit('[data-pick="riko"]')
    hit('.tab[data-tab="supply"]')
    hit('[data-depart]')

    expect(writes.length).toBeGreaterThan(0)
  })
})
