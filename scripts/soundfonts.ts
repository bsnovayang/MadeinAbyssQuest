/**
 * 音色檔瘦身：只抽出配樂實際用到的音，放進 public/soundfonts 隨遊戲部署。
 *
 *   npm run soundfonts
 *
 * 改過 src/audio/tracks.ts 的譜就要重跑一次（測試會檢查有沒有漏掉的音）。
 * MusyngKite 每個樂器原本約 3MB、88 個音，一首曲子通常只用到十幾個。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseAbc } from '../src/audio/abc'
import { instrumentInfo, noteName } from '../src/audio/sampler'
import { TRACKS } from '../src/audio/tracks'

const SOUNDFONT = 'MusyngKite'
const SOURCE = `https://gleitz.github.io/midi-js-soundfonts/${SOUNDFONT}`
const OUT_DIR = 'public/soundfonts'
const MANIFEST = 'src/audio/soundfont-manifest.ts'

const used = new Map<string, Set<number>>()
for (const track of TRACKS) {
  for (const voice of parseAbc(track.abc).voices) {
    const { file } = instrumentInfo(voice.program)
    const notes = used.get(file) ?? new Set<number>()
    used.set(file, notes)
    for (const note of voice.notes) for (const midi of note.midi) notes.add(midi)
  }
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const manifest: [string, string[]][] = []
let total = 0

for (const [file, midis] of [...used].sort(([a], [b]) => a.localeCompare(b))) {
  const res = await fetch(`${SOURCE}/${file}-mp3.js`)
  if (!res.ok) throw new Error(`讀不到 ${file}（${res.status}）`)
  const text = await res.text()

  const table: Record<string, string> = {}
  for (const midi of [...midis].sort((a, b) => a - b)) {
    const name = noteName(midi)
    const m = new RegExp(`"${name}"\\s*:\\s*"data:audio/mp3;base64,([^"]+)"`).exec(text)
    if (!m?.[1]) throw new Error(`${file} 沒有 ${name} 這個音`)
    table[name] = m[1]
  }

  const json = JSON.stringify(table)
  writeFileSync(join(OUT_DIR, `${file}.json`), json)
  total += json.length
  manifest.push([file, Object.keys(table)])
  console.log(
    `${file.padEnd(20)} ${String(midis.size).padStart(3)} 個音  ${(json.length / 1024).toFixed(0)} KB`,
  )
}

const body = manifest
  .map(([file, notes]) => `  ${file}: [${notes.map((n) => `'${n}'`).join(', ')}],`)
  .join('\n')

writeFileSync(
  MANIFEST,
  `// 由 npm run soundfonts 產生，不要手動修改。
// 記錄 public/soundfonts 裡每個樂器打包了哪些音，測試用它檢查配樂有沒有漏音。

export const BUNDLED_NOTES: Readonly<Record<string, readonly string[]>> = {
${body}
}
`,
)

console.log(`合計 ${(total / 1024 / 1024).toFixed(2)} MB（${SOUNDFONT}）`)
