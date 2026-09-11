import type { LogTone } from '../core/types'

export interface ToastLine {
  text: string
  tone: LogTone
  /** 撿到東西：旁邊畫個小塗鴉（企劃書 16-4） */
  doodle?: boolean
}

const LIFETIME = 4600
const MAX_VISIBLE = 4

/**
 * 一次行動的結果用淡出提示呈現，而不是永遠佔著版面的紀錄清單。
 *
 * 它活在重繪之外的容器裡，因此展開面板之類的操作不會讓提示重播。
 */
export function showToasts(host: HTMLElement, lines: readonly ToastLine[]): void {
  for (const line of lines) {
    const el = document.createElement('div')
    el.className = `toast toast--${line.tone}${line.doodle ? ' toast--find' : ''}`
    el.textContent = line.text
    host.appendChild(el)

    // 重大事件停留得久一點（企劃書 16-6：重要的事情要慢）
    const life = line.tone === 'grim' ? LIFETIME * 1.6 : LIFETIME
    setTimeout(() => el.remove(), life)
  }

  while (host.childElementCount > MAX_VISIBLE) {
    host.firstElementChild?.remove()
  }
}

export function clearToasts(host: HTMLElement): void {
  host.replaceChildren()
}
