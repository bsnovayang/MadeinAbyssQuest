import './style.css'
import { createApp, type AudioPort } from './ui/app'
import { ensureAudio, hush, isMuted, setScene, setWarmth, swell, toggleMute } from './ui/audio'
import { clearGame, loadGame, saveGame } from './ui/storage'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('#app not found')

const audio: AudioPort = {
  ensure: ensureAudio,
  setScene,
  setWarmth,
  swell,
  hush,
  toggleMute,
  isMuted,
}

const app = createApp(root, {
  audio,
  save: (data) => void saveGame(data),
  load: loadGame,
  clear: () => void clearGame(),
})

void app.start()
