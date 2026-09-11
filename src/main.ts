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
  save: (data) => void saveGame(data),
  load: loadGame,
  clear: () => void clearGame(),
})

void app.start()
