/**
 * 測試選單（F2）。只在本機開發、或網址帶 ?debug 時啟用。
 *
 * 回饋效果大多藏在「特定情況」裡 —— 撤離到快撐不住、進入新的一層、最後一擊 ——
 * 正常玩要花好幾分鐘才碰得到。這裡直接把情況製造出來，方便反覆看效果。
 */

export type DebugView = 'town' | 'explore' | 'battle' | 'ended'

export interface DebugContext {
  view: DebugView
  /** 下潛中（跳層只在下潛時有意義） */
  descending: boolean
}

interface DebugAction {
  id: string
  label: string
  /** 不能用時的原因 */
  blocked?: string | null
}

function section(title: string, actions: DebugAction[]): string {
  return `
    <div class="debug__section">
      <div class="debug__title">${title}</div>
      <div class="debug__grid">
        ${actions
          .map(
            (a) => `
              <button class="debug__btn" data-debug="${a.id}" type="button" ${a.blocked ? 'disabled' : ''} title="${a.blocked ?? ''}">
                ${a.label}
              </button>`,
          )
          .join('')}
      </div>
    </div>`
}

export function debugMenu(ctx: DebugContext): string {
  const head = `
    <div class="debug__head">
      <span>測試選單・F2</span>
      <button class="debug__close" data-debug="close" type="button">關閉</button>
    </div>`

  const diary = section('日記', [
    { id: 'diary-all', label: '解鎖全部日記' },
    { id: 'diary-unread', label: '全部變回未讀' },
  ])

  if (ctx.view === 'town') {
    return `${head}${section('奧斯城', [
      { id: 'funds', label: '資金 +5000' },
      { id: 'vault-relic', label: '倉庫多一件未鑑定遺物' },
      { id: 'summary', label: '模擬回城結算（含晉升）' },
    ])}${diary}`
  }

  if (ctx.view === 'ended') {
    return `${head}<p class="debug__hint">探索已經結束，回到奧斯城後再測。</p>`
  }

  if (ctx.view === 'battle') {
    return `${head}${section('戰鬥', [
      { id: 'foe-charge', label: '敵人開始蓄力' },
      { id: 'foe-weak', label: '敵人只剩 1 血' },
      { id: 'party-weak', label: '我方只剩 1 血' },
    ])}`
  }

  const layerBlocked = ctx.descending ? null : '撤離中不能往下跳'
  return `${head}
    ${section('負荷預兆（自動開始撤離）', [
      { id: 'omen-1', label: '輕：快歸零' },
      { id: 'omen-2', label: '中：3 步內倒下' },
      { id: 'omen-3', label: '重：下一步倒下' },
      { id: 'seizure', label: '立刻發作' },
    ])}
    ${section('探索', [
      { id: 'layer-2', label: '跳到第 2 層', blocked: layerBlocked },
      { id: 'layer-3', label: '跳到第 3 層', blocked: layerBlocked },
      { id: 'layer-4', label: '跳到第 4 層', blocked: layerBlocked },
      { id: 'layer-5', label: '跳到第 5 層', blocked: layerBlocked },
      { id: 'layer-6', label: '跳到第 6 層', blocked: layerBlocked },
      { id: 'encounter', label: '下一步遇敵' },
      { id: 'relic', label: '下一步撿到遺物' },
      { id: 'hurt', label: '全隊受傷' },
      { id: 'restore', label: '全部補滿' },
    ])}
    ${diary}`
}
