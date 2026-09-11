import './style.css'
import { createApp, type AudioPort } from './ui/app'
import {
  ensureAudio,
  hush,
  isMusicMuted,
  isSfxMuted,
  playSfx,
  setScene,
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
}

const app = createApp(root, {
  audio,
  save: (data) => void saveGame(data),
  load: loadGame,
  clear: () => void clearGame(),
})

void app.start()
