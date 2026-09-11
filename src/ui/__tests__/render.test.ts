import { describe, expect, it } from 'vitest'
import { createBattle } from '../../core/battle'
import { makeNode } from '../../core/map'
import { createMeta, deployParty, type RunSummary } from '../../core/meta'
import type { NodeKind } from '../../core/types'
import { settingsPanel } from '../controls'
import { renderDiary } from '../diary'
import { createDiary, unlockReached } from '../../core/diary'
import { renderTown } from '../town'
import { beginAscent, createRun, moveTo } from '../../core/run'
import type { HpDeltas } from '../render'
import { omenLevel, render } from '../render'
import type { PanelState } from '../panels'

/** 面板預設收合，測試需要看內容就全部展開 */
const allOpen = (): PanelState => ({
  explicit: { relics: true, party: true, supply: true, quests: true, notes: true },
})

const ui = (deltas: HpDeltas = {}) => ({ deltas, panels: allOpen() })

describe('render', () => {
  it('起始畫面包含深度計、隊伍與抉擇', () => {
    const s = createRun('render')
    const html = render(s, ui())
    expect(html).toContain('depth-bar__depth')
    expect(html).toContain('莉可')
    expect(html).toContain('class="choice"')
    expect(html).toContain('探窟筆記')
    expect(html).toContain('開始撤離')
  })

  it('HP 變化以手寫修正呈現，而非飄字', () => {
    const s = createRun('delta')
    const riko = s.party[0]!
    riko.hp = 14
    const html = render(s, ui({ [riko.id]: 8 }))
    expect(html).toContain('<s>22</s>')
    expect(html).toContain('>14</span>')
    // 受傷不是回復，不能用綠色
    expect(html).not.toContain('changed--up')
  })

  it('隊伍面板收著時，受傷寫在狀態列上', () => {
    const s = createRun('wound')
    const riko = s.party[0]!
    riko.hp = 14
    const html = render(s, { deltas: { [riko.id]: 8 } })

    expect(html).toContain('class="wound ')
    expect(html).toContain('莉可 −8')
  })

  it('隊伍面板展開時不重複寫在狀態列', () => {
    const s = createRun('wound-open')
    const riko = s.party[0]!
    riko.hp = 14
    expect(render(s, ui({ [riko.id]: 8 }))).not.toContain('class="wound')
  })

  it('回復在狀態列上寫成加號', () => {
    const s = createRun('wound-heal')
    const riko = s.party[0]!
    riko.hp = 10
    const html = render(s, { deltas: { [riko.id]: -4 } })

    expect(html).toContain('wound--up')
    expect(html).toContain('莉可 +4')
  })

  describe('日記的閱讀畫面', () => {
    it('一頁寫著章節、標題、日數與地點', () => {
      const html = renderDiary(createDiary(), { mode: 'page', index: 0 })
      expect(html).toContain('序章　鈴聲')
      expect(html).toContain('第 1 日　奧斯城')
      expect(html).toContain('這本筆記，就從今天開始寫')
      expect(html).toContain('1 / 1')
    })

    it('目錄裡還沒解鎖的頁是空白頁 —— 玩家知道後面還有', () => {
      const html = renderDiary(createDiary(), { mode: 'toc' })
      expect(html).toContain('鈴聲')
      expect(html).toContain('（空白頁）')
    })

    it('第五層以下的頁，有一行不是莉可寫的', () => {
      const diary = createDiary()
      unlockReached(diary, 12500, { day: 30, depth: 12500, party: ['莉可'] })
      const pages = diary.entries.length
      const html = renderDiary(diary, { mode: 'page', index: pages - 1 })
      expect(html).toContain('diary__foreign')
      expect(html).toContain('diary__page--decay-5')
    })
  })

  it('標題列有日記，未讀頁數顯示成紅點；戰鬥中不能打開', () => {
    const s = createRun('diary-btn')
    expect(render(s, { ...ui(), diaryUnread: 3 })).toMatch(/data-diary="open"[\s\S]*?>3<\/span>/)

    s.battle = createBattle(1, s.party, 1)
    expect(render(s, ui())).toMatch(/data-diary="open"[\s\S]*?disabled/)
  })

  describe('行動之前就看得到會花掉什麼', () => {
    function withNode(kind: NodeKind, ids = ['riko', 'reg', 'urna', 'tobi']) {
      const s = createRun('hint', { party: deployParty(createMeta(), ids) })
      const [node] = makeNode(s.rngState, 99, 60, kind)
      s.choices = [node]
      return s
    }

    it('每走一步的消耗寫在選項上方', () => {
      expect(render(withNode('empty'), ui())).toContain('每走一步：水 −1')
    })

    it('撤離時加上每人要付的耐受', () => {
      const s = createRun('hint-up')
      s.depth = 8000
      s.maxDepthReached = 8000
      beginAscent(s)
      expect(render(s, ui())).toContain('每人耐受 −3')
    })

    it('地形：有繩索寫繩索 −1，沒繩索寫會受傷', () => {
      const s = withNode('obstacle', ['riko', 'urna'])
      expect(render(s, ui())).toContain('繩索 −1')
      s.supplies.rope = 0
      expect(render(s, ui())).toContain('沒有繩索：全員 −3 HP')
    })

    it('雷格在的時候，地形寫伸縮臂可以通過', () => {
      expect(render(withNode('obstacle'), ui())).toContain('伸縮臂可以通過')
    })

    it('沒有測繪的隊伍看不出前方是什麼', () => {
      expect(render(withNode('encounter', ['riko', 'reg']), ui())).toContain('看不出前方是什麼')
    })

    it('按得下去的紮營也寫出效果', () => {
      expect(render(createRun('camp-fx'), ui())).toContain('食物 −1・HP 回 30%')
    })
  })

  describe('負荷預兆', () => {
    /** 在第四層撤離（每步負荷 3），只讓托比陷入危險，其他人撐得很久 */
    function ascending(tobiTolerance: number, tobiHp = 16) {
      const s = createRun('omen')
      s.depth = 8000
      s.maxDepthReached = 8000
      beginAscent(s)
      for (const c of s.party) {
        c.tolerance = c.maxTolerance = 99
        c.hp = c.maxHp = 99
      }
      const tobi = s.party[3]!
      tobi.tolerance = tobiTolerance
      tobi.hp = tobiHp
      return s
    }

    it('下潛時沒有預兆', () => {
      expect(omenLevel(createRun('omen-down'))).toBe(0)
    })

    it('看的是會不會倒下：快歸零淡淡暗角、3 步內倒下加深、下一步倒下最強', () => {
      expect(omenLevel(ascending(99, 99))).toBe(0)
      // 3 步後耐受歸零，但 HP 還多
      expect(omenLevel(ascending(9, 99))).toBe(1)
      // 耐受已歸零，每步 −6：HP 12 撐 2 步
      expect(omenLevel(ascending(0, 12))).toBe(2)
      // HP 6，下一步就倒下
      expect(omenLevel(ascending(0, 6))).toBe(3)
    })

    /** 回報的問題：耐受已經扣到 0，還一直寫「下一個節點撐不住」 */
    it('耐受歸零但還撐得住的人，寫的是每步扣多少 HP，不是撐不住', () => {
      const html = render(ascending(0, 99), ui())
      expect(html).toContain('耐受歸零・每步 −6 HP')
      expect(html).not.toContain('下一步就會倒下')
      expect(omenLevel(ascending(0, 99))).toBeLessThan(3)
    })

    it('真的快倒下的人才是 ☠，而且寫出第幾步', () => {
      const html = render(ascending(0, 12), ui())
      expect(html).toContain('☠ 托比　2 步後倒下')
    })

    it('探索結束就不再有預兆', () => {
      const s = ascending(0, 6)
      s.over = true
      expect(omenLevel(s)).toBe(0)
    })
  })

  it('標題列只放一個齒輪 —— 聲音設定收在裡面，小手機才不會擠到斷行', () => {
    const html = render(createRun('gear'), ui())
    expect(html).toContain('data-settings')
    expect(html).not.toContain('data-mute')
  })

  it('設定選單：音樂與音效各自的開關和音量，關著的滑桿停用', () => {
    const html = settingsPanel({ musicMuted: true, sfxMuted: false, musicVolume: 0.3, sfxVolume: 0.9 })
    expect(html).toContain('data-volume="music"')
    expect(html).toContain('data-volume="sfx"')
    expect(html).toMatch(/value="30"\s+data-volume="music"[\s\S]*?disabled/)
    expect(html).toContain('>90</span>')
    expect(html).toMatch(/mute mute--off"\s+data-mute="music"/)
    expect(html).not.toMatch(/mute--off"\s+data-mute="sfx"/)
  })

  it('晉升像印章一樣蓋在結算的最後', () => {
    const summary: RunSummary = {
      surfaced: true,
      earned: 300,
      refunded: 0,
      questsDone: [],
      questsFailed: [],
      daysSpent: 2,
      promoted: '藍笛',
      basesOpened: [],
      relicsKept: [],
      aftermath: [],
      survivors: ['莉可'],
      dead: [],
      lost: [],
      buried: [],
      newAfflictions: [],
    }
    const html = renderTown({ meta: createMeta(), selected: [], summary, freshSummary: true })
    expect(html).toContain('report--fresh')
    expect(html).toContain('report__line--stamp')
    expect(html).toContain('全員平安回來了')
    expect(html).toContain('data-funds')
  })

  it('放過火葬砲後，狀態列一直看得到回城的檢修費', () => {
    const s = createRun('bill')
    expect(render(s, ui())).not.toContain('回城檢修')

    s.aftermath.push({ kind: 'repair', charId: 'reg', skillId: 'incinerate', amount: 200 })
    s.aftermath.push({ kind: 'repair', charId: 'reg', skillId: 'incinerate', amount: 200 })
    expect(render(s, ui())).toContain('火葬砲 2 發・回城檢修 400')
  })

  it('回到地表的畫面提醒要付的檢修費', () => {
    const s = createRun('bill-end')
    s.over = true
    s.endReason = 'surfaced'
    s.aftermath.push({ kind: 'repair', charId: 'reg', skillId: 'incinerate', amount: 200 })
    expect(render(s, ui())).toContain('回城要付檢修費 200')
  })

  it('戰鬥在最後一擊結束時，可以先停在戰鬥畫面', () => {
    const s = createRun('final-blow')
    const battle = createBattle(1, s.party, 1)
    battle.over = 'win'
    battle.awaiting = null

    const html = render(s, { ...ui(), finalBattle: battle })
    expect(html).toContain('timeline')
    expect(html).toContain('周圍安靜下來了')
  })

  it('死亡的隊員被劃掉', () => {
    const s = createRun('death')
    const tobi = s.party[3]!
    tobi.hp = 0
    tobi.status = 'dead'
    expect(render(s, ui())).toContain('member--gone')
  })

  it('撤離時顯示耐受度與預兆', () => {
    const s = createRun('ascent')
    s.depth = 8000
    s.maxDepthReached = 8000
    beginAscent(s)
    const tobi = s.party[3]!
    tobi.tolerance = 1

    const html = render(s, ui())
    expect(html).toContain('歸途')
    expect(html).toContain('member__fill--tol')
    expect(html).toContain('倒下') // 預兆必須看得見
    expect(html).toContain('/步') // 每步的代價也要看得見
  })

  it('行李裡看得到戰利品值多少 —— 否則沒辦法決定該丟什麼', () => {
    const s = createRun('value')
    s.carried.push({
      id: 'l1',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 250,
      identified: true,
    })
    const html = render(s, ui())
    expect(html).toContain('獸骨結晶')
    expect(html).toContain('帶回地表可換 250')
  })

  it('持有脫離型遺物時顯示效果與代價', () => {
    const s = createRun('relic')
    s.carried.push({
      id: 'r1',
      name: '不動之楔',
      weight: 6,
      kind: 'relic',
      value: 900,
      identified: true,
      relicId: 'immovable-wedge',
    })
    const html = render(s, ui())
    expect(html).toContain('不動之楔')
    // 只寫代價不寫效果，等於叫玩家別按
    expect(html).toContain('全隊立即返回地表')
    expect(html).toContain('隨機一名隊友被留在原地')
  })

  it('持有常駐型遺物時說明怎麼用', () => {
    const s = createRun('ward-usage')
    s.carried.push({
      id: 'w1',
      name: '避咒之籠',
      weight: 5,
      kind: 'relic',
      value: 1200,
      identified: true,
      relicId: 'ward-basket',
    })
    const html = render(s, ui())
    expect(html).toContain('撤離時在隊伍面板指定承受的人')
  })

  it('回到地表時結算帶回的價值與名字', () => {
    const s = createRun('surfaced')
    s.over = true
    s.endReason = 'surfaced'
    s.maxDepthReached = 3400
    s.party[3]!.status = 'lost'
    s.carried.push({
      id: 'l1',
      name: '獸骨結晶',
      weight: 3,
      kind: 'loot',
      value: 250,
      identified: true,
    })

    const html = render(s, ui())
    expect(html).toContain('回到了奧斯城')
    expect(html).toContain('3,400m')
    expect(html).toContain('250')
    expect(html).toContain('沒有回來：托比')
  })

  it('全滅時不顯示戰利品價值', () => {
    const s = createRun('wiped')
    s.over = true
    s.endReason = 'wiped'
    expect(render(s, ui())).toContain('探索結束')
  })

  it('嚴重超重時抉擇按鈕停用', () => {
    const s = createRun('blocked')
    s.carried.push({
      id: 'anvil',
      name: '不可能的重物',
      weight: 999,
      kind: 'loot',
      value: 0,
      identified: true,
    })
    expect(render(s, ui())).toContain('disabled')
  })

  it('多步下潛後仍可正常渲染', () => {
    const s = createRun('walk')
    for (let i = 0; i < 15 && !s.over && s.choices[0]; i++) {
      moveTo(s, s.choices[0].id)
    }
    expect(() => render(s, ui())).not.toThrow()
  })
})
