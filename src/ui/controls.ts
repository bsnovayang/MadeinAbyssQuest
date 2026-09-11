/**
 * 設定：標題列只放一個齒輪，點開才看到音樂與音效的開關和音量。
 *
 * 有人喜歡音樂大聲、音效小聲，也有人相反，所以兩個分開調。
 * 收進齒輪也讓小手機的標題列不會擠到斷行。
 */

// Material Design 的 settings 圖示（Apache License 2.0）
const GEAR_PATH =
  'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z'

export function settingsButton(open: boolean): string {
  return `
    <button
      class="gear ${open ? 'gear--on' : ''}"
      data-settings="1"
      type="button"
      aria-label="設定"
      aria-expanded="${open ? 'true' : 'false'}"
      title="設定"
    ><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="${GEAR_PATH}"/></svg></button>`
}

// Material Design 的 menu_book 圖示（Apache License 2.0）
const BOOK_PATH =
  'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z'

/**
 * 日記：齒輪旁邊的一本書，紅點是未讀頁數（主線劇情.md 2b）。
 * 戰鬥中不能打開 —— 那不是讀日記的時候。
 */
export function diaryButton(unread: number, locked: boolean): string {
  const label = locked ? '日記（戰鬥中不能打開）' : unread > 0 ? `日記・${unread} 頁未讀` : '日記'
  return `
    <button
      class="gear diary-btn"
      data-diary="open"
      type="button"
      aria-label="${label}"
      title="${label}"
      ${locked ? 'disabled' : ''}
    ><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="${BOOK_PATH}"/></svg>${
      unread > 0 ? `<span class="diary-btn__badge">${unread > 9 ? '9+' : unread}</span>` : ''
    }</button>`
}

export interface SoundSettings {
  musicMuted: boolean
  sfxMuted: boolean
  /** 0～1 */
  musicVolume: number
  /** 0～1 */
  sfxVolume: number
}

function soundRow(kind: 'music' | 'sfx', label: string, muted: boolean, volume: number): string {
  const value = Math.round(volume * 100)
  return `
    <div class="settings__row ${muted ? 'settings__row--off' : ''}">
      <span class="settings__label">${label}</span>
      <input
        class="settings__slider"
        type="range"
        min="0"
        max="100"
        step="5"
        value="${value}"
        data-volume="${kind}"
        aria-label="${label}音量"
        ${muted ? 'disabled' : ''}
      />
      <span class="settings__value" data-volume-value="${kind}">${value}</span>
      <button
        class="mute ${muted ? 'mute--off' : ''}"
        data-mute="${kind}"
        type="button"
        aria-pressed="${muted ? 'false' : 'true'}"
      >${muted ? '已關閉' : '開啟中'}</button>
    </div>`
}

export function settingsPanel(s: SoundSettings): string {
  return `
    <div class="settings__card" role="dialog" aria-label="設定">
      <div class="settings__head">
        <span class="settings__title">設定</span>
        <button class="settings__close" data-settings-close="1" type="button">關閉</button>
      </div>
      ${soundRow('music', '音樂', s.musicMuted, s.musicVolume)}
      ${soundRow('sfx', '音效', s.sfxMuted, s.sfxVolume)}
      <p class="settings__note">設定只記在這台裝置上。</p>
    </div>`
}
