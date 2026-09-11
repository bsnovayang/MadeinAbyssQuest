import { LAYERS, layerAt } from './depth'
import { DIARY_PAGES, diaryPageById, type DiaryPageDef } from '../data/diary'

/**
 * 日記的狀態（主線劇情.md 2b）。
 *
 * 解鎖的頁會記下當下的日數、深度與隊伍 —— 同一頁的寫法依此改變，
 * 而且日記讀起來才像真的日記。跨場次保存。
 */

export interface DiaryEntry {
  pageId: string
  /** 解鎖當下的遊戲日數 */
  day: number
  /** 解鎖當下的深度。0 = 在奧斯城或深淵的入口 */
  depth: number
  /** 解鎖當下還活著的隊員 */
  party: string[]
}

export interface DiaryState {
  entries: DiaryEntry[]
  /** 讀過的頁 */
  read: string[]
}

export interface UnlockContext {
  day: number
  depth: number
  party: string[]
}

export function createDiary(): DiaryState {
  const diary: DiaryState = { entries: [], read: [] }
  unlockPage(diary, 'prologue', { day: 1, depth: 0, party: ['莉可'] })
  return diary
}

/** 舊存檔沒有日記，讀取時補上 */
export function normalizeDiary(diary: DiaryState | undefined): DiaryState {
  if (!diary) return createDiary()
  diary.entries ??= []
  diary.read ??= []
  return diary
}

export function isUnlocked(diary: DiaryState, pageId: string): boolean {
  return diary.entries.some((e) => e.pageId === pageId)
}

/** 已經解鎖或不存在的頁回傳 null */
export function unlockPage(
  diary: DiaryState,
  pageId: string,
  ctx: UnlockContext,
): DiaryEntry | null {
  if (!diaryPageById(pageId) || isUnlocked(diary, pageId)) return null
  const entry: DiaryEntry = { pageId, day: ctx.day, depth: ctx.depth, party: [...ctx.party] }
  diary.entries.push(entry)
  return entry
}

/**
 * 抵達過的每一層都有一頁。一趟連過三層，就一次解鎖三頁。
 * 已經走過的層，深度記在那一層的入口 —— 「第一次抵達」的那個地方。
 */
export function unlockReached(
  diary: DiaryState,
  maxDepth: number,
  ctx: UnlockContext,
): DiaryEntry[] {
  const deepest = layerAt(maxDepth).id
  const out: DiaryEntry[] = []

  for (const def of DIARY_PAGES) {
    if (def.unlock.kind !== 'reach' || def.unlock.layer > deepest) continue
    const layer = LAYERS[def.unlock.layer - 1]
    const passed = layer && ctx.depth >= layer.to
    const entry = unlockPage(diary, def.id, { ...ctx, depth: passed ? layer.from : ctx.depth })
    if (entry) out.push(entry)
  }
  return out
}

/** 解鎖的頁，依故事的順序排，不是依解鎖的先後 */
export function unlockedPages(diary: DiaryState): { def: DiaryPageDef; entry: DiaryEntry }[] {
  return DIARY_PAGES.flatMap((def) => {
    const entry = diary.entries.find((e) => e.pageId === def.id)
    return entry ? [{ def, entry }] : []
  })
}

export function unreadCount(diary: DiaryState): number {
  return diary.entries.filter((e) => !diary.read.includes(e.pageId)).length
}

export function markRead(diary: DiaryState, pageId: string): void {
  if (!diary.read.includes(pageId)) diary.read.push(pageId)
}
