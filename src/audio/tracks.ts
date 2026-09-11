/**
 * 配樂曲目（企劃書 15-5b）。
 *
 * 三首共用一段主題旋律（上行三個音後停住），依場景換調、換速度、換樂器。
 * 只參考《來自深淵》配樂的氛圍，旋律一律原創。
 *
 * 寫譜規則：
 * 1. 每首最多 4 個聲部
 * 2. 各聲部小節數一致，才能無縫循環
 * 3. 旋律寫在第 1 聲部
 * 4. 用 %%MIDI program 指定樂器、%%MIDI control 7 指定音量，一般的 ABC 播放器也看得懂
 * 5. 每個聲部佔自己的音域，不要兩個樂器彈同一個音 —— 低於 D3 的音只交給一個聲部
 * 6. 音符加上釋音不能超過取樣長度（約 3.2 秒），長音用換音代替連結線
 */

/**
 * 城鎮：F 大調、3/4，主題的完整句子。直笛帶出孤兒院孩子的感覺。
 *
 * 音域分工：大提琴 F2～D3 ／ 弦樂 E3～A3 ／ 豎琴 C4～D5 ／ 直笛 C5 以上。
 * 前八小節只有旋律、豎琴、大提琴；弦樂在後八小節才進來，讓曲子有展開。
 */
const TOWN = `X:1
T:奧斯城
C:原創
M:3/4
L:1/8
Q:1/4=80
K:F
V:1 name="旋律"
%%MIDI program 74
%%MIDI control 7 110
c2 f2 g2 | a4 g2 | f2 a2 c'2 | b6 | a2 g2 f2 | g4 c2 | f2 e2 g2 | f6 |
c2 f2 g2 | a4 c'2 | d'2 c'2 a2 | b6 | a2 g2 f2 | g2 a2 b2 | a2 g2 e2 | f6 |
V:2 name="豎琴"
%%MIDI program 46
%%MIDI control 7 90
C F A c A F | C F A c A F | D F A d A F | D F B d B F | C F A c A F | C E G c G E | C E G c G E | C F A c A F |
C F A c A F | C F A c A F | D F B d B F | D G B d B G | C F A c A F | C E G c G E | C E G c G E | C F A c3 |
V:3 name="大提琴"
%%MIDI program 42
%%MIDI control 7 64
F,,4 z2 | F,,4 z2 | D,4 z2 | B,,4 z2 | F,,4 z2 | C,4 z2 | C,4 z2 | F,,4 z2 |
F,,4 C,2 | F,,4 C,2 | B,,4 D,2 | G,,4 D,2 | F,,4 C,2 | C,4 G,,2 | C,4 G,,2 | F,,6 |
V:4 name="弦樂"
%%MIDI program 48
%%MIDI control 7 50
z6 | z6 | z6 | z6 | z6 | z6 | z6 | z6 |
A,6 | A,3 G,3 | F,6 | G,6 | A,6 | G,6 | E,3 G,3 | F,6 |
`

/**
 * 探索：D 小調、4/4，主題放慢只用前半句。中段借用還原 B 帶出一點好奇。
 *
 * 音域分工：大提琴 D2～C3 ／ 豎琴 G3～B♭4（不再彈低音）／ 合唱 C4～F4（壓低音量）／ 長笛 F4 以上。
 */
const EXPLORE = `X:1
T:深淵之淵
C:原創
M:4/4
L:1/8
Q:1/4=92
K:Dmin
V:1 name="旋律"
%%MIDI program 73
%%MIDI control 7 110
A2 d2 e2 f2 | f6 e2 | d4 c4 | A8 | A2 d2 e2 f2 | g6 f2 | e4 d4 | d8 |
F2 G2 A2 c2 | d4 c2 A2 | G2 A2 =B2 c2 | d8 | f2 e2 d2 c2 | A4 G4 | F2 G2 A2 =B2 | A8 |
A2 d2 e2 f2 | a6 g2 | f4 d4 | d8 | A2 d2 e2 f2 | g4 f4 | e4 ^c4 | d8 |
V:2 name="合唱"
%%MIDI program 52
%%MIDI control 7 64
F8 | F8 | F8 | E8 | F8 | D8 | E8 | F8 |
C8 | D8 | D8 | F8 | F8 | E8 | D8 | E8 |
F8 | F8 | D8 | F8 | F8 | D8 | E8 | F8 |
V:3 name="豎琴"
%%MIDI program 46
%%MIDI control 7 85
A, D F A F D A, D | A, D F A F D A, D | B, D F B F D B, D | A, ^C E A E C A, C | A, D F A F D A, D | G, B, D G D B, G, B, | G, C E G E C G, C | A, D F A F D A, D |
A, C F A F C A, C | B, D F B F D B, D | G, =B, D G D =B, G, =B, | A, D F A F D A, D | B, D F B F D B, D | G, C E G E C G, C | G, =B, D G D =B, G, =B, | A, ^C E A E C A, C |
A, D F A F D A, D | A, C F A F C A, C | B, D F B F D B, D | A, D F A F D A, D | A, D F A F D A, D | G, B, D G D B, G, B, | A, ^C E A E C A, C | A, D F A F D A, D |
V:4 name="大提琴"
%%MIDI program 42
%%MIDI control 7 64
D,,6 z2 | D,,6 z2 | B,,6 z2 | A,,6 z2 | D,,6 z2 | G,,6 z2 | C,6 z2 | D,,6 z2 |
F,,6 z2 | B,,6 z2 | G,,6 z2 | D,,6 z2 | B,,6 z2 | C,6 z2 | G,,6 z2 | A,,6 z2 |
D,,6 z2 | F,,6 z2 | B,,6 z2 | D,,6 z2 | D,,6 z2 | G,,6 z2 | A,,6 z2 | D,,8 |
`

/**
 * 戰鬥：D 小調、4/4，主題切碎。緊張，但不英勇。
 *
 * 合奏弦樂起音太慢，快速反覆會糊成一片，所以反覆型改用撥弦；大提琴拿掉，低音交給定音鼓。
 * 後八小節加入壓低音量的顫弓弦樂，把緊張感往上推。
 * 音域分工：定音鼓 F2～B♭2 ／ 撥弦 D3～B♭4 ／ 顫弓 C♯4～A4 ／ 雙簧管 A4 以上。
 */
const BATTLE = `X:1
T:遭遇
C:原創
M:4/4
L:1/8
Q:1/4=132
K:Dmin
V:1 name="旋律"
%%MIDI program 68
%%MIDI control 7 110
A2 d2 e2 f2 | z2 f2 e2 d2 | ^c4 A4 | z8 | A2 d2 e2 f2 | z2 g2 f2 e2 | f4 d4 | d4 z4 |
d2 f2 a2 f2 | g2 b2 a2 g2 | f2 a2 g2 f2 | e4 ^c4 | d2 f2 a2 d'2 | ^c'4 a4 | b2 a2 g2 e2 | d4 z4 |
V:2 name="撥弦"
%%MIDI program 45
%%MIDI control 7 95
D, D D, D A, A D, D | D, D D, D A, A D, D | A, A A, A E, E A, A | A, A A, A E, E A, A | D, D D, D A, A D, D | G, G G, G D, D G, G | B, B B, B F, F B, B | D, D D, D A, A D, D |
D, D D, D A, A D, D | G, G G, G D, D G, G | D, D D, D A, A D, D | A, A A, A E, E A, A | D, D D, D A, A D, D | A, A A, A E, E A, A | G, G G, G D, D G, G | D, D D, D A, A D, D |
V:3 name="顫弓"
%%MIDI program 44
%%MIDI control 7 50
z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 |
F8 | G8 | A8 | ^C8 | D8 | E8 | D8 | D4 z4 |
V:4 name="定音鼓"
%%MIDI program 47
%%MIDI control 7 85
D,,2 z D,, A,,2 z2 | D,,2 z D,, A,,2 z2 | A,,2 z A,, A,,2 z2 | A,,2 A,,2 A,,2 A,,2 | D,,2 z D,, A,,2 z2 | G,,2 z G,, D,,2 z2 | B,,2 z B,, F,,2 z2 | D,,2 z D,, A,,2 z2 |
D,,2 z D,, A,,2 z2 | G,,2 z G,, D,,2 z2 | D,,2 z D,, A,,2 z2 | A,,2 z A,, A,,2 z2 | D,,2 z D,, A,,2 z2 | A,,2 z A,, A,,2 z2 | G,,2 z G,, D,,2 z2 | D,,2 D,,2 D,,4 |
`

export type TrackId = 'town' | 'explore' | 'battle'

export interface TrackDef {
  id: TrackId
  label: string
  /** 什麼時候播放 */
  when: string
  abc: string
}

export const TRACKS: readonly TrackDef[] = [
  { id: 'town', label: '城鎮', when: '奧斯城的所有分頁', abc: TOWN },
  { id: 'explore', label: '探索', when: '下潛，以及撤離歸途（歸途時壓低暖度）', abc: EXPLORE },
  { id: 'battle', label: '戰鬥', when: '遭遇敵人時', abc: BATTLE },
]
