/**
 * 對照用的舊版曲目，只給音樂實驗室用，不會進遊戲。
 *
 * 第一版去掉弦樂與大提琴 —— 試聽時覺得比完整第一版好聽，
 * 留著和新編曲比較，確認新版真的有比較好。
 */

const TOWN_V1 = `X:1
T:奧斯城（初版，去掉弦樂與大提琴）
M:3/4
L:1/8
Q:1/4=80
K:F
V:1 name="旋律"
%%MIDI program 74
c2 f2 g2 | a4 g2 | f2 a2 c'2 | b6 | a2 g2 f2 | g4 c2 | f2 e2 g2 | f6 |
c2 f2 g2 | a4 c'2 | d'2 c'2 a2 | b6 | a2 g2 f2 | g2 a2 b2 | a2 g2 e2 | f6 |
V:2 name="豎琴"
%%MIDI program 46
F, C F A F C | F, C F A F C | D, A, D F D A, | B,, F, B, D B, F, | F, C F A F C | C, G, C E C G, | C, G, C E C G, | F, C F A F C |
F, C F A F C | F, C F A F C | B,, F, B, D B, F, | G,, D, G, B, G, D, | F, C F A F C | C, G, C E C G, | C, G, C E C G, | F, C F A3 |
`

const EXPLORE_V1 = `X:1
T:深淵之淵（初版，去掉大提琴）
M:4/4
L:1/8
Q:1/4=92
K:Dmin
V:1 name="旋律"
%%MIDI program 73
A2 d2 e2 f2 | f6 e2 | d4 c4 | A8 | A2 d2 e2 f2 | g6 f2 | e4 d4 | d8 |
F2 G2 A2 c2 | d4 c2 A2 | G2 A2 =B2 c2 | d8 | f2 e2 d2 c2 | A4 G4 | F2 G2 A2 =B2 | A8 |
A2 d2 e2 f2 | a6 g2 | f4 d4 | d8 | A2 d2 e2 f2 | g4 f4 | e4 ^c4 | d8 |
V:2 name="合唱"
%%MIDI program 52
F8 | F8 | F8 | E8 | F8 | D8 | E8 | F8 |
C8 | D8 | D8 | F8 | F8 | E8 | D8 | E8 |
F8 | F8 | D8 | F8 | F8 | D8 | E8 | F8 |
V:3 name="豎琴"
%%MIDI program 46
D, A, D F D A, D F | D, A, D F D A, D F | B,, F, B, D B, F, B, D | A,, E, A, ^C A, E, A, ^C | D, A, D F D A, D F | G,, D, G, B, G, D, G, B, | C, G, C E C G, C E | D, A, D F D A, D F |
F, C F A F C F A | B,, F, B, D B, F, B, D | G,, D, G, =B, G, D, G, =B, | D, A, D F D A, D F | B,, F, B, D B, F, B, D | C, G, C E C G, C E | G,, D, G, =B, G, D, G, =B, | A,, E, A, ^C A, E, A, ^C |
D, A, D F D A, D F | F, C F A F C F A | B,, F, B, D B, F, B, D | D, A, D F D A, D F | D, A, D F D A, D F | G,, D, G, B, G, D, G, B, | A,, E, A, ^C A, E, A, ^C | D, A, D F D A, D F |
`

const BATTLE_V1 = `X:1
T:遭遇（初版，去掉弦樂與大提琴）
M:4/4
L:1/8
Q:1/4=132
K:Dmin
V:1 name="旋律"
%%MIDI program 68
A2 d2 e2 f2 | z2 f2 e2 d2 | ^c4 A4 | z8 | A2 d2 e2 f2 | z2 g2 f2 e2 | f4 d4 | d4 z4 |
d2 f2 a2 f2 | g2 b2 a2 g2 | f2 a2 g2 f2 | e4 ^c4 | d2 f2 a2 d'2 | ^c'4 a4 | b2 a2 g2 e2 | d4 z4 |
V:2 name="定音鼓"
%%MIDI program 47
D,,2 z D,, A,,2 z2 | D,,2 z D,, A,,2 z2 | A,,2 z A,, A,,2 z2 | A,,2 A,,2 A,,2 A,,2 | D,,2 z D,, A,,2 z2 | G,,2 z G,, D,,2 z2 | B,,2 z B,, F,,2 z2 | D,,2 z D,, A,,2 z2 |
D,,2 z D,, A,,2 z2 | G,,2 z G,, D,,2 z2 | D,,2 z D,, A,,2 z2 | A,,2 z A,, A,,2 z2 | D,,2 z D,, A,,2 z2 | A,,2 z A,, A,,2 z2 | G,,2 z G,, D,,2 z2 | D,,2 D,,2 D,,4 |
`

export const DRAFTS: readonly { id: string; label: string; abc: string }[] = [
  { id: 'town-v1', label: '城鎮・初版去掉弦樂與大提琴', abc: TOWN_V1 },
  { id: 'explore-v1', label: '探索・初版去掉大提琴', abc: EXPLORE_V1 },
  { id: 'battle-v1', label: '戰鬥・初版去掉弦樂與大提琴', abc: BATTLE_V1 },
]
