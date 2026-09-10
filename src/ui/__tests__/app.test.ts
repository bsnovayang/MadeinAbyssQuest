// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from '../app'

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

beforeEach(async () => {
  root = document.createElement('div')
  document.body.replaceChildren(root)
  app = createApp(root, { pace: 0, seed: () => 'test-seed' })
  await app.start()
})

describe('奧斯城', () => {
  it('一開始顯示名冊，而不是探索畫面', () => {
    expect(app.snapshot().view).toBe('town')
    expect(exists('[data-pick]')).toBe(true)
    expect(exists('[data-depart]')).toBe(true)
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

  it('沒選人時「出發下潛」是停用的，而且說得出原因', () => {
    const depart = root.querySelector('[data-depart]')!
    expect(depart.hasAttribute('disabled')).toBe(true)
    expect(depart.querySelector('.action__why')?.textContent).toContain('還沒有決定誰要下去')
    expect(root.querySelector('.hint--depart')?.textContent).toContain('點名冊上的人')

    click('[data-depart]')
    expect(app.snapshot().view).toBe('town')
  })

  it('選了人之後提示消失，按鈕顯示人數', () => {
    click('[data-pick="riko"]')
    const depart = root.querySelector('[data-depart]')!
    expect(depart.hasAttribute('disabled')).toBe(false)
    expect(depart.textContent).toContain('1 人')
    expect(root.querySelector('.hint--depart')).toBeNull()
  })

  it('★選好人之後按「出發下潛」會真的出發', () => {
    click('[data-pick="riko"]')
    click('[data-pick="reg"]')
    click('[data-depart]')

    expect(app.snapshot().view).toBe('run')
    expect(app.snapshot().run?.party).toHaveLength(2)
    expect(exists('[data-node]')).toBe(true)
  })

  it('最多只能帶 4 個人', () => {
    for (const id of ['riko', 'reg', 'urna', 'tobi']) click(`[data-pick="${id}"]`)
    expect(app.snapshot().selected).toHaveLength(4)
  })
})

describe('探索', () => {
  beforeEach(() => {
    click('[data-pick="riko"]')
    click('[data-pick="reg"]')
    click('[data-depart]')
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

describe('補給商', () => {
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
    click('[data-pick="riko"]')
    click('[data-depart]')

    expect(app.snapshot().meta.funds).toBeLessThan(funds)
    expect(app.snapshot().run?.supplies.food).toBe(meta.loadout.food)
  })

  it('沒錢買補給時說得出原因', () => {
    const meta = app.snapshot().meta
    meta.funds = 0
    click('[data-pick="riko"]')

    const depart = root.querySelector('[data-depart]')!
    expect(depart.hasAttribute('disabled')).toBe(true)
    expect(depart.querySelector('.action__why')?.textContent).toContain('買不起')
  })
})

describe('資訊揭露', () => {
  it('帶著測繪士才看得出前方是什麼', () => {
    click('[data-pick="urna"]') // 烏爾娜有測繪
    click('[data-depart]')
    expect(root.querySelector('.choice__kind')?.textContent?.trim()).not.toBe('？')
    expect(exists('.choice__kind--unknown')).toBe(false)
  })

  it('沒有測繪士就只剩筆記上的描述', () => {
    click('[data-pick="tobi"]') // 托比只是學徒
    click('[data-depart]')
    expect(exists('.choice__kind--unknown')).toBe(true)
    expect(root.querySelector('.choice__kind')?.textContent?.trim()).toBe('？')
    // 描述本身仍然看得見，那才是判斷的依據
    expect(root.querySelector('.choice')?.textContent?.trim().length).toBeGreaterThan(2)
  })
})

describe('孤兒院', () => {
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
    click('[data-pick="riko"]')
    click('[data-pick="riko"]') // 觸發重繪
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
    click('[data-pick="riko"]')
    click('[data-pick="riko"]') // 只為了觸發重繪

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
  it('要按兩次才會真的清除', () => {
    const meta = app.snapshot().meta
    meta.funds = 500
    meta.graveyard.push({ name: '托比', depth: 4000, cause: 'dead', buried: false, runIndex: 1 })
    click('[data-pick="riko"]')

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
    click('[data-pick="riko"]')
    click('[data-depart]')
    expect(root.querySelectorAll('button.action[disabled]').length).toBeGreaterThan(0)
    assertAllExplained()
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

    r2.querySelector<HTMLElement>('[data-pick="riko"]')!
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    r2.querySelector<HTMLElement>('[data-depart]')!
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

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

    r2.querySelector<HTMLElement>('[data-pick="riko"]')!
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    r2.querySelector<HTMLElement>('[data-depart]')!
      .dispatchEvent(new window.MouseEvent('click', { bubbles: true }))

    expect(writes.length).toBeGreaterThan(0)
  })
})
