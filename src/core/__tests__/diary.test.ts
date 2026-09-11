import { describe, expect, it } from 'vitest'
import { LAYERS } from '../depth'
import {
  createDiary,
  markRead,
  unlockedPages,
  unlockPage,
  unlockReached,
  unreadCount,
} from '../diary'
import { createMeta, normalizeMeta, type MetaState } from '../meta'
import { DIARY_PAGES } from '../../data/diary'

const ctx = (depth: number) => ({ day: 5, depth, party: ['莉可', '雷格'] })

describe('日記', () => {
  it('新的遊戲就有一頁序章，還沒讀過', () => {
    const diary = createDiary()
    expect(diary.entries.map((e) => e.pageId)).toEqual(['prologue'])
    expect(unreadCount(diary)).toBe(1)
  })

  it('一趟連過三層，就一次解鎖三頁；再來一次不會重複', () => {
    const diary = createDiary()
    const first = unlockReached(diary, 3000, ctx(3000))
    expect(first.map((e) => e.pageId)).toEqual(['reach-1', 'reach-2', 'reach-3'])
    expect(unlockReached(diary, 3000, ctx(3000))).toEqual([])
    expect(unreadCount(diary)).toBe(4)
  })

  it('記下解鎖當下的日數與隊伍；已經走過的層，深度記在那一層的入口', () => {
    const diary = createDiary()
    unlockReached(diary, 3000, ctx(3000))

    const layer2 = diary.entries.find((e) => e.pageId === 'reach-2')!
    const layer3 = diary.entries.find((e) => e.pageId === 'reach-3')!
    expect(layer2).toMatchObject({ day: 5, depth: LAYERS[1]!.from, party: ['莉可', '雷格'] })
    expect(layer3.depth).toBe(3000)
  })

  it('依故事的順序排，不是依解鎖的先後', () => {
    const diary = createDiary()
    unlockPage(diary, 'reach-3', ctx(3000))
    unlockPage(diary, 'reach-1', ctx(100))
    expect(unlockedPages(diary).map((p) => p.def.id)).toEqual(['prologue', 'reach-1', 'reach-3'])
  })

  it('讀過就不算未讀', () => {
    const diary = createDiary()
    markRead(diary, 'prologue')
    markRead(diary, 'prologue')
    expect(unreadCount(diary)).toBe(0)
    expect(diary.read).toEqual(['prologue'])
  })

  it('每一層都有第一次抵達的一頁，而且每一頁都寫得出內容', () => {
    for (let layer = 1; layer <= LAYERS.length; layer++) {
      expect(
        DIARY_PAGES.some((p) => p.unlock.kind === 'reach' && p.unlock.layer === layer),
        `第 ${layer} 層`,
      ).toBe(true)
    }
    for (const page of DIARY_PAGES) {
      expect(page.lines({ party: ['莉可', '雷格'] }).length, page.id).toBeGreaterThan(0)
    }
  })

  it('舊存檔沒有日記，讀取時補上序章', () => {
    const meta = createMeta()
    delete (meta as Partial<MetaState>).diary
    expect(normalizeMeta(meta).diary.entries.map((e) => e.pageId)).toEqual(['prologue'])
  })
})
