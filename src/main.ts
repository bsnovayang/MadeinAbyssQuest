import './style.css'
import { createApp, type AudioPort } from './ui/app'
import {
  ensureAudio,
  getMusicVolume,
  getSfxVolume,
  hush,
  isMusicMuted,
  isSfxMuted,
  playSfx,
  setMusicVolume,
  setScene,
  setSfxVolume,
  setWarmth,
  swell,
  toggleMusic,
  toggleSfx,
} from './ui/audio'
import { clearGame, loadGame, saveGame } from './ui/storage'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('#app not found')

const audio: AudioPort = {
  ensure: ensureAudio,
  setScene,
  setWarmth,
  swell,
  hush,
  sfx: playSfx,
  toggleMusic,
  isMusicMuted,
  toggleSfx,
  isSfxMuted,
  setMusicVolume,
  setSfxVolume,
  musicVolume: getMusicVolume,
  sfxVolume: getSfxVolume,
}

const app = createApp(root, {
  audio,
  // F2 測試選單：本機開發時開，線上網址要帶 ?debug 才開
  debug:
    ['localhost', '127.0.0.1'].includes(location.hostname) ||
    new URLSearchParams(location.search).has('debug'),
  save: (data) => void saveGame(data),
  load: loadGame,
  clear: () => void clearGame(),
})

void app.start()
