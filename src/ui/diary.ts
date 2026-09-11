import { formatDepth, layerAt } from '../core/depth'
import { unlockedPages, type DiaryState } from '../core/diary'
import { decayStage } from '../core/perception'
import { DIARY_PAGES, type DiaryLine } from '../data/diary'

/**
 * 日記的閱讀畫面（主線劇情.md 2b）。像翻一本真的日記：一次一頁、可以翻目錄。
 * 還沒解鎖的頁在目錄裡是空白頁 —— 玩家知道後面還有。
 */

export type DiaryView = { mode: 'page'; index: number } | { mode: 'toc' }

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function lineHtml(line: DiaryLine): string {
  if (typeof line === 'string') return `<p>${esc(line)}</p>`
  return `<p class="diary__foreign">${esc(line.text)}</p>`
}

const footer = (extra: string) => `
  <div class="diary__foot">
    ${extra}
    <button class="diary__link" data-diary="close" type="button">關閉</button>
  </div>`

function pageHtml(diary: DiaryState, index: number): string {
  const pages = unlockedPages(diary)
  const at = Math.max(0, Math.min(pages.length - 1, index))
  const current = pages[at]
  if (!current) return `<p class="hint">日記還是空的。</p>${footer('')}`

  const { def, entry } = current
  // 在奧斯城寫的就寫奧斯城；在入口寫的，寫那一層的名字
  const where =
    entry.depth > 0
      ? formatDepth(entry.depth)
      : def.unlock.kind === 'start'
        ? '奧斯城'
        : layerAt(0).name

  const dots =
    pages.length <= 12
      ? `<span class="diary__dots" aria-hidden="true">${pages
          .map((_, i) => (i === at ? '●' : '○'))
          .join('')}</span>`
      : ''

  return `
    <div class="diary__head">
      <span class="diary__chapter">${esc(def.chapter)}</span>
      <span class="diary__count">${at + 1} / ${pages.length}</span>
    </div>
    <article class="diary__page diary__page--decay-${decayStage(entry.depth)}">
      <div class="diary__stamp">第 ${entry.day} 日　${esc(where)}</div>
      <h3 class="diary__title">${esc(def.title)}</h3>
      ${def.lines({ party: entry.party }).map(lineHtml).join('')}
    </article>
    <div class="diary__nav">
      <button class="diary__turn" data-diary="prev" type="button" ${at === 0 ? 'disabled' : ''}>‹ 上一頁</button>
      ${dots}
      <button class="diary__turn" data-diary="next" type="button" ${at >= pages.length - 1 ? 'disabled' : ''}>下一頁 ›</button>
    </div>
    ${footer('<button class="diary__link" data-diary="toc" type="button">目錄</button>')}`
}

function tocHtml(diary: DiaryState): string {
  const pages = unlockedPages(diary)
  const chapters: { name: string; items: string[] }[] = []

  for (const def of DIARY_PAGES) {
    let chapter = chapters[chapters.length - 1]
    if (!chapter || chapter.name !== def.chapter) {
      chapter = { name: def.chapter, items: [] }
      chapters.push(chapter)
    }

    const index = pages.findIndex((p) => p.def.id === def.id)
    if (index < 0) {
      chapter.items.push('<li class="diary__locked">（空白頁）</li>')
      continue
    }
    const unread = !diary.read.includes(def.id)
    chapter.items.push(`
      <li>
        <button class="diary__entry" data-diary-goto="${index}" type="button">
          ${esc(def.title)}${unread ? '<span class="diary__unread" aria-label="未讀"></span>' : ''}
        </button>
      </li>`)
  }

  return `
    <div class="diary__head">
      <span class="diary__chapter">目錄</span>
      <span class="diary__count">${pages.length} / ${DIARY_PAGES.length}</span>
    </div>
    <div class="diary__toc">
      ${chapters
        .map(
          (c) => `
            <section>
              <h3 class="diary__toc-chapter">${esc(c.name)}</h3>
              <ul>${c.items.join('')}</ul>
            </section>`,
        )
        .join('')}
    </div>
    ${footer('')}`
}

export function renderDiary(diary: DiaryState, view: DiaryView): string {
  return `
    <div class="diary__card" role="dialog" aria-label="日記">
      ${view.mode === 'toc' ? tocHtml(diary) : pageHtml(diary, view.index)}
    </div>`
}
