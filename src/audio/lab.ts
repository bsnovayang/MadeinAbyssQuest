import { parseAbc, type AbcTune } from './abc'
import { AdaptiveTrack, MusicBus } from './music'
import { instrumentInfo, noteName, SOUNDFONTS, type SoundSource } from './sampler'
import { BUNDLED_NOTES } from './soundfont-manifest'
import { DRAFTS } from './drafts'
import { SFX_LABELS, SFX_NAMES, SfxBank } from './sfx'
import { TRACKS } from './tracks'

/**
 * 音樂實驗室（開發用頁面，不會部署）。
 * 用遊戲實際的播放方式試聽 ABC 譜：真實樂器取樣、每個聲部可以個別控制。
 */

const mount = document.querySelector<HTMLDivElement>('#lab')
if (!mount) throw new Error('#lab not found')
const root = mount

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

function el<T extends HTMLElement>(selector: string): T {
  const found = root.querySelector<T>(selector)
  if (!found) throw new Error(`${selector} not found`)
  return found
}

const state = {
  abc: TRACKS[0]?.abc ?? '',
  soundfont: 'MusyngKite' as SoundSource,
  tune: null as AbcTune | null,
  status: '選一首曲目，按「載入並播放」。第一次會下載音色檔，每個樂器約 3MB。',
  loading: false,
  voiceOn: {} as Record<string, boolean>,
  voiceVolume: {} as Record<string, number>,
  labels: {} as Record<string, string>,
  warmth: 100,
  reverb: 35,
  volume: 80,
}

let ctx: AudioContext | null = null
let bus: MusicBus | null = null
let sfx: SfxBank | null = null
let track: AdaptiveTrack | null = null
let descendTimers: ReturnType<typeof setTimeout>[] = []

root.innerHTML = `
  <header class="lab-head">
    <h1>音樂實驗室</h1>
    <p>ABC 譜 → 真實樂器取樣 → 每個聲部可以個別控制。開發用頁面，不會部署到 GitHub Pages。</p>
  </header>

  <section class="lab-card">
    <h2>寫譜規則</h2>
    <ol>
      <li>每首最多 4 個聲部</li>
      <li>各聲部小節數一致，才能無縫循環（對不上時下面會警告）</li>
      <li>旋律寫在第 1 聲部</li>
      <li>用 <code>%%MIDI program 編號</code> 指定樂器、<code>%%MIDI control 7 0～127</code> 指定音量</li>
      <li>每個聲部佔自己的音域，不要兩個樂器彈同一個音；低音只交給一個聲部</li>
      <li>音符加上餘音不能超過約 3.2 秒（取樣長度）</li>
    </ol>
  </section>

  <section class="lab-card">
    <h2>譜</h2>
    <div class="lab-row">
      <label>曲目
        <select id="track">
          <optgroup label="目前版本">
            ${TRACKS.map((t) => `<option value="${t.id}">${esc(t.label)}・${esc(t.when)}</option>`).join('')}
          </optgroup>
          <optgroup label="對照">
            ${DRAFTS.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}
          </optgroup>
        </select>
      </label>
    </div>
    <textarea id="abc" spellcheck="false" rows="16"></textarea>
    <p class="hint">可以直接修改，或貼上自己寫的譜，按「載入並播放」就會用這份譜。換曲目會覆蓋目前的內容。</p>
  </section>

  <section class="lab-card">
    <div class="lab-row">
      <label>音色庫
        <select id="soundfont">
          ${SOUNDFONTS.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="primary" data-act="play">載入並播放</button>
      <button type="button" data-act="stop">停止</button>
    </div>
    <p id="status" class="status"></p>
    <div id="info"></div>
  </section>

  <section class="lab-card">
    <h2>聲部</h2>
    <p class="hint">拖音量找到喜歡的比例後，把滑桿旁邊那行貼回譜裡對應聲部的樂器設定下面。</p>
    <div id="voices"></div>
    <div class="lab-row">
      <button type="button" data-act="descend">模擬越潛越深（聲部一個一個消失）</button>
      <button type="button" data-act="all-on">全部恢復</button>
    </div>
  </section>

  <section class="lab-card">
    <h2>混音</h2>
    <label class="slider">暖度 <input id="warmth" type="range" min="0" max="100" /></label>
    <label class="slider">殘響 <input id="reverb" type="range" min="0" max="100" /></label>
    <label class="slider">音量 <input id="volume" type="range" min="0" max="100" /></label>
    <div class="lab-row">
      <button type="button" data-act="hush">負荷發作（音樂靜止 1.4 秒）</button>
    </div>
  </section>

  <section class="lab-card">
    <h2>材質音效</h2>
    <p class="hint">遊戲裡的音效都是即時合成的，不需要音檔。每次播放會有一點隨機變化。</p>
    <div class="lab-row">
      ${SFX_NAMES.map((n) => `<button type="button" data-sfx="${n}">${esc(SFX_LABELS[n])}</button>`).join('')}
    </div>
    <div class="lab-row">
      <button type="button" data-sfx="pencil" data-strength="1.6">重擊的鉛筆（力道 1.6）</button>
      <button type="button" data-sfx="coin" data-strength="1.4">結算的硬幣（力道 1.4）</button>
    </div>
  </section>`

const abcInput = el<HTMLTextAreaElement>('#abc')
const trackSelect = el<HTMLSelectElement>('#track')
const soundfontSelect = el<HTMLSelectElement>('#soundfont')
abcInput.value = state.abc
soundfontSelect.value = state.soundfont

function infoHtml(): string {
  const tune = state.tune
  if (!tune) return ''
  const unknown = tune.voices.filter((v) => !instrumentInfo(v.program).known)

  // 瘦身版只有配樂用到的音，改過的譜可能用到沒打包的音
  const missing =
    state.soundfont === 'bundled'
      ? tune.voices.flatMap((v) => {
          const bundled = BUNDLED_NOTES[instrumentInfo(v.program).file] ?? []
          const absent = new Set(
            v.notes.flatMap((n) => n.midi.map(noteName)).filter((name) => !bundled.includes(name)),
          )
          return absent.size > 0 ? [`「${v.name}」少了 ${[...absent].join('、')}`] : []
        })
      : []

  return `
    <dl class="facts">
      <div><dt>曲名</dt><dd>${esc(tune.title || '（未命名）')}</dd></div>
      <div><dt>拍號</dt><dd>${tune.meter[0]}/${tune.meter[1]}</dd></div>
      <div><dt>速度</dt><dd>1/${Math.round(1 / tune.beat)} = ${tune.bpm}</dd></div>
      <div><dt>一輪</dt><dd>${tune.length.toFixed(1)} 秒</dd></div>
    </dl>
    ${
      tune.voices.length > 4
        ? `<p class="warn">有 ${tune.voices.length} 個聲部，超過 4 個。</p>`
        : ''
    }
    ${unknown
      .map((v) => `<p class="warn">「${esc(v.name)}」的音色 ${v.program} 還沒對應，暫時用鋼琴代替。</p>`)
      .join('')}
    ${
      missing.length > 0
        ? `<p class="warn">瘦身版缺音，這些音會不出聲：${esc(missing.join('；'))}。改好譜後執行 npm run soundfonts 重新打包。</p>`
        : ''
    }`
}

const volumeLine = (volume: number) => `%%MIDI control 7 ${Math.round(volume * 127)}`

function voicesHtml(): string {
  const tune = state.tune
  if (!tune) return '<p class="hint">還沒載入。</p>'

  return tune.voices
    .map((v, index) => {
      const on = state.voiceOn[v.id] ?? true
      const volume = state.voiceVolume[v.id] ?? v.volume
      const label = state.labels[v.id] ?? instrumentInfo(v.program).label
      const mismatch = Math.abs(v.length - tune.length) > 0.01
      return `
        <div class="voice ${on ? '' : 'voice--off'}">
          <div class="voice__row">
            <span class="voice__name">${index + 1}. ${esc(v.name)}</span>
            <span class="voice__inst">${esc(label)}・${v.notes.length} 個音</span>
          </div>
          ${
            mismatch
              ? `<p class="warn">這個聲部長 ${v.length.toFixed(2)} 秒，和曲子的 ${tune.length.toFixed(2)} 秒對不上 —— 小節數可能寫錯了。</p>`
              : ''
          }
          <label class="slider">音量
            <input type="range" min="0" max="100" value="${Math.round(volume * 100)}"
              data-voice-volume="${esc(v.id)}" ${track ? '' : 'disabled'} />
            <code data-volume-line="${esc(v.id)}">${volumeLine(volume)}</code>
          </label>
          <button type="button" data-act="voice" data-voice="${esc(v.id)}" ${track ? '' : 'disabled'}>
            ${on ? '關掉這個聲部' : '恢復'}
          </button>
        </div>`
    })
    .join('')
}

function renderDynamic(): void {
  el('#status').textContent = state.status
  el('#info').innerHTML = infoHtml()
  el('#voices').innerHTML = voicesHtml()
  el<HTMLButtonElement>('button[data-act="play"]').disabled = state.loading
}

function applyMix(): void {
  bus?.setWarmth(state.warmth / 100)
  bus?.setReverb(state.reverb / 100)
  bus?.setVolume(state.volume / 100)
}

function clearDescend(): void {
  for (const t of descendTimers) clearTimeout(t)
  descendTimers = []
}

function stopTrack(): void {
  clearDescend()
  track?.stop()
  track?.disconnect()
  track = null
}

async function play(): Promise<void> {
  if (state.loading) return

  const tune = parseAbc(state.abc)
  if (tune.voices.length === 0 || tune.length <= 0) {
    state.status = '譜裡沒有讀到任何音符。'
    renderDynamic()
    return
  }

  const audio = (ctx ??= new AudioContext())
  await audio.resume()
  const mix = (bus ??= new MusicBus(audio))
  applyMix()

  stopTrack()
  state.tune = tune
  state.loading = true
  state.labels = {}
  state.voiceOn = Object.fromEntries(tune.voices.map((v) => [v.id, true]))
  state.voiceVolume = Object.fromEntries(tune.voices.map((v) => [v.id, v.volume]))
  state.status = '載入音色中…'
  renderDynamic()

  try {
    const loaded = await AdaptiveTrack.load(audio, tune, state.soundfont, (voice, label) => {
      state.labels[voice.id] = label
      state.status = `已載入：${Object.values(state.labels).join('、')}`
      renderDynamic()
    })
    loaded.connect(mix)
    loaded.start()
    track = loaded
    state.status = '播放中。'
  } catch (err) {
    // 音色檔從網路讀取，這裡是真正會失敗的邊界
    state.status = `載入失敗：${err instanceof Error ? err.message : String(err)}`
  } finally {
    state.loading = false
    renderDynamic()
  }
}

function toggleVoice(id: string): void {
  if (!track) return
  const on = !(state.voiceOn[id] ?? true)
  state.voiceOn[id] = on
  track.setVoice(id, on, on ? 1.2 : 2.5)
  renderDynamic()
}

/** 從最後一個聲部開始淡出，旋律留到最後（暫緩的功能，先留著試聽） */
function descend(): void {
  const tune = state.tune
  if (!track || !tune) return
  clearDescend()
  const order = [...tune.voices].reverse().slice(0, -1)
  order.forEach((voice, k) => {
    descendTimers.push(
      setTimeout(() => {
        if (!track) return
        state.voiceOn[voice.id] = false
        track.setVoice(voice.id, false, 3)
        renderDynamic()
      }, k * 3500),
    )
  })
}

function allOn(): void {
  clearDescend()
  const tune = state.tune
  if (!track || !tune) return
  for (const v of tune.voices) {
    state.voiceOn[v.id] = true
    track.setVoice(v.id, true, 1.2)
  }
  renderDynamic()
}

root.addEventListener('click', (ev) => {
  const sfxButton = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-sfx]')
  if (sfxButton?.dataset.sfx) {
    const audio = (ctx ??= new AudioContext())
    void audio.resume()
    sfx ??= new SfxBank(audio)
    sfx.play(sfxButton.dataset.sfx as (typeof SFX_NAMES)[number], Number(sfxButton.dataset.strength ?? 1))
    return
  }

  const button = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]')
  if (!button || button.disabled) return

  switch (button.dataset.act) {
    case 'play':
      void play()
      break
    case 'stop':
      stopTrack()
      state.status = '已停止。'
      renderDynamic()
      break
    case 'hush':
      bus?.hush(1400)
      break
    case 'voice':
      if (button.dataset.voice) toggleVoice(button.dataset.voice)
      break
    case 'descend':
      descend()
      break
    case 'all-on':
      allOn()
      break
  }
})

// 音量滑桿不重畫整個聲部區，拖曳才不會中斷
root.addEventListener('input', (ev) => {
  const input = ev.target as HTMLInputElement
  const id = input.dataset.voiceVolume
  if (id === undefined) return
  const volume = Number(input.value) / 100
  state.voiceVolume[id] = volume
  track?.setVoiceVolume(id, volume)
  const line = root.querySelector(`[data-volume-line="${CSS.escape(id)}"]`)
  if (line) line.textContent = volumeLine(volume)
})

trackSelect.addEventListener('change', () => {
  const chosen = [...TRACKS, ...DRAFTS].find((t) => t.id === trackSelect.value)
  if (!chosen) return
  state.abc = chosen.abc
  abcInput.value = chosen.abc
})

abcInput.addEventListener('input', () => {
  state.abc = abcInput.value
})

soundfontSelect.addEventListener('change', () => {
  state.soundfont = soundfontSelect.value as SoundSource
  renderDynamic()
})

for (const id of ['warmth', 'reverb', 'volume'] as const) {
  const input = el<HTMLInputElement>(`#${id}`)
  input.value = String(state[id])
  input.addEventListener('input', () => {
    state[id] = Number(input.value)
    applyMix()
  })
}

renderDynamic()
