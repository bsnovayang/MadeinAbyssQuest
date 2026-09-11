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
