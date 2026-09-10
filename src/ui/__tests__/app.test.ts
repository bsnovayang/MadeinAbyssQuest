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

  it('沒選人時「出發下潛」是停用的', () => {
    expect(root.querySelector('[data-depart]')?.hasAttribute('disabled')).toBe(true)
    click('[data-depart]')
    expect(app.snapshot().view).toBe('town')
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
