/**
 * 日記頁（主線劇情.md 2b、3）。
 *
 * 劇情不在遊戲進行中強迫播放：達成條件就解鎖一頁，玩家自己翻開讀。
 * 這一版先放序章與每一層「第一次抵達」的頁面；
 * 主線委託、抉擇之後的頁面，之後照同樣的格式加進來。
 *
 * 文字全部原創，只沿用原作的世界與角色。
 */

/** 一行字。foreign = 不是莉可寫的（第五層以下，主線劇情.md 第 1 章） */
export type DiaryLine = string | { text: string; foreign: true }

export type DiaryUnlock = { kind: 'start' } | { kind: 'reach'; layer: number }

export interface DiaryContext {
  /** 解鎖當下還活著的隊員 */
  party: readonly string[]
}

export interface DiaryPageDef {
  id: string
  chapter: string
  title: string
  unlock: DiaryUnlock
  lines: (ctx: DiaryContext) => DiaryLine[]
}

const foreign = (text: string): DiaryLine => ({ text, foreign: true })

/** 「和誰一起」：解鎖當下的隊伍。莉可自己不寫進去 */
function withWhom(ctx: DiaryContext): string {
  const others = ctx.party.filter((name) => name !== '莉可')
  return others.length === 0 ? '一個人' : `和${others.join('、')}一起`
}

export const DIARY_PAGES: readonly DiaryPageDef[] = [
  {
    id: 'prologue',
    chapter: '序章　鈴聲',
    title: '鈴聲',
    unlock: { kind: 'start' },
    lines: () => [
      '奧斯城的鐘響了三次。那是有探窟隊回來的意思。',
      '我每次都會跑到大坑邊去看。回來的人有時候多，有時候少。',
      '媽媽是白笛。她下去了，很久很久沒有回來。',
      '院長說不要再等了。可是深淵那麼深，說不定她只是還在路上。',
      '所以我要自己去看。',
      '這本筆記，就從今天開始寫。',
    ],
  },
  {
    id: 'reach-1',
    chapter: '序章　鈴聲',
    title: '第一次往下',
    unlock: { kind: 'reach', layer: 1 },
    lines: (ctx) => [
      `第一次用自己的腳走下去。${withWhom(ctx)}。`,
      '風是往下吹的，好像深淵在吸氣。',
      '岩壁上的苔蘚會發光。我摸了一下，手指亮了一整個下午。',
      '大家都說，真正的考驗是回程。',
      '我在這一頁寫大一點：往下走是自由的。往上走才要付出代價。',
    ],
  },
  {
    id: 'reach-2',
    chapter: '第一章　不動的試煉',
    title: '誘惑之森',
    unlock: { kind: 'reach', layer: 2 },
    lines: () => [
      '樹長得比奧斯城最高的塔還要高。枝葉之間，有東西一直在看我們。',
      '這一層所有的東西都很漂亮，漂亮得像在邀請人再往下一點。',
      '越漂亮的地方，越要記得回頭的路。',
      '聽說不動卿就守在這一層的某個地方。聽說她從來不笑。',
      '今天往上走的時候，第一次覺得頭有點暈。',
    ],
  },
  {
    id: 'reach-3',
    chapter: '第二章　斷崖上的營火',
    title: '大斷層',
    unlock: { kind: 'reach', layer: 3 },
    lines: () => [
      '整面都是懸崖。往下看是黑的，往上看也是黑的。',
      '繩索斷掉的聲音，在這裡可以迴響很久很久。',
      '晚上紮營的時候，好像聽見有人叫了一個名字。',
      '大家都說沒有聽見。',
      '我本來想把那個名字寫下來，後來沒有寫。我不敢。',
    ],
  },
  {
    id: 'reach-4',
    chapter: '第三章　杯底的醫者',
    title: '巨人之杯',
    unlock: { kind: 'reach', layer: 4 },
    lines: () => [
      '很大的東西在杯底睡著。我們在它的影子裡走了一整天。',
      '從這裡往上，每一步都像全身被針扎。回去的人會流血。',
      '聽說這一層住著會說話的東西，會替人治傷，也會收很奇怪的報酬。',
      '今天第一次在想：如果只有我能回去，我還要不要往下。',
      '沒有答案。先把這個問題寫在這裡，等哪一天回來看。',
    ],
  },
  {
    id: 'reach-5',
    chapter: '第四章　黎明的代價',
    title: '屍骸之海',
    unlock: { kind: 'reach', layer: 5 },
    lines: () => [
      '水很平靜，平靜得不像水。水底下有很多人。',
      '黎明卿的前線基地就在這一層。燈火很亮，亮得很有禮貌。',
      '從這一頁開始，我沒辦法保證寫在這裡的，都是我寫的。',
      foreign('還沒有到。還沒有到。還沒有到。'),
      '上面那一行，我不記得寫過。',
    ],
  },
  {
    id: 'reach-6',
    chapter: '第五章　回不去的地方',
    title: '回不去的地方',
    unlock: { kind: 'reach', layer: 6 },
    lines: () => [
      '從這裡往上，不是死，就是變成別的東西。',
      '我們站在那條線上，很久都沒有人說話。',
      '我想過把這本筆記留在這裡，讓後來的人知道我們來過。',
      foreign('名字留在這裡就好。'),
      '最後還是帶著。它是我唯一記得回家的方法。',
    ],
  },
  {
    id: 'reach-7',
    chapter: '終章　奈落之底',
    title: '奈落之底',
    unlock: { kind: 'reach', layer: 7 },
    lines: () => [
      '到了。',
      '這裡很安靜。安靜到可以聽見每一個沒有回去的人。',
      '我在那些聲音裡找媽媽的聲音。',
      '沒有找到。',
      '不知道這是好事，還是壞事。',
      '但我知道，我們還有要做的事。',
    ],
  },
]

export function diaryPageById(id: string): DiaryPageDef | undefined {
  return DIARY_PAGES.find((p) => p.id === id)
}
