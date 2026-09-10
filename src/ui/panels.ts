/**
 * 收合面板。
 *
 * 原則：畫面上預設只留「必要資訊 + 動作按鈕」，其餘點了才展開。
 * 探索的每一步都是一次決策，捲動找不到選項就是設計失敗。
 */
export type PanelId = 'relics' | 'party' | 'supply' | 'quests' | 'notes' | 'battlelog'

export interface PanelState {
  /** 明確被使用者開關過的面板。沒有紀錄的就用預設 */
  explicit: Partial<Record<PanelId, boolean>>
}

export function createPanelState(): PanelState {
  return { explicit: {} }
}

export function isPanelOpen(state: PanelState, id: PanelId, fallback: boolean): boolean {
  return state.explicit[id] ?? fallback
}

export function togglePanel(state: PanelState, id: PanelId, fallback: boolean): void {
  state.explicit[id] = !isPanelOpen(state, id, fallback)
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export function panel(
  id: PanelId,
  title: string,
  note: string,
  open: boolean,
  body: string,
): string {
  return `
    <section class="panel ${open ? 'panel--open' : ''}">
      <button class="panel__head" data-panel="${id}" type="button" aria-expanded="${open}">
        <span class="panel__arrow">${open ? '▾' : '▸'}</span>
        <span class="panel__title">${esc(title)}</span>
        ${note ? `<span class="panel__note">${esc(note)}</span>` : ''}
      </button>
      ${open ? `<div class="panel__body">${body}</div>` : ''}
    </section>`
}
