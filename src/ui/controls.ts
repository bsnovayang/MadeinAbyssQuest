/**
 * 音樂與音效的兩個開關，城鎮與探索的狀態列共用。
 * 用文字而不是圖示 —— 喇叭圖示分不出關的是音樂還是音效。
 */
export function soundToggles(musicMuted: boolean, sfxMuted: boolean): string {
  const button = (kind: 'music' | 'sfx', label: string, muted: boolean) => `
    <button
      class="mute ${muted ? 'mute--off' : ''}"
      data-mute="${kind}"
      type="button"
      aria-pressed="${muted ? 'false' : 'true'}"
      title="${label}${muted ? '已關閉，點一下打開' : '已打開，點一下關閉'}"
    >${label}</button>`

  return `<span class="sound">${button('music', '音樂', musicMuted)}${button('sfx', '音效', sfxMuted)}</span>`
}
