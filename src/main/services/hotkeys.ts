import { globalShortcut } from 'electron'
import { getSettings } from './settings'
import { toggleRecording } from './recorder'
import { saveReplay, toggleReplayBuffer } from './replayBuffer'
import { toast } from './events'

/**
 * Global hotkey registration. Re-run `registerHotkeys` after any settings
 * change; it always unregisters first so bindings never stack up.
 */

export function registerHotkeys(): void {
  globalShortcut.unregisterAll()

  const { hotkeys } = getSettings()

  const bindings: { accelerator: string; label: string; action: () => void }[] = [
    {
      accelerator: hotkeys.toggleRecording.accelerator,
      label: 'Start/stop recording',
      action: () => void toggleRecording()
    },
    {
      accelerator: hotkeys.saveReplay.accelerator,
      label: 'Save instant replay',
      action: () => void saveReplay()
    },
    {
      accelerator: hotkeys.toggleReplayBuffer.accelerator,
      label: 'Toggle instant replay',
      action: () => void toggleReplayBuffer()
    }
  ]

  for (const binding of bindings) {
    if (!binding.accelerator) continue
    try {
      const ok = globalShortcut.register(binding.accelerator, binding.action)
      if (!ok) {
        console.warn(`[hotkeys] ${binding.accelerator} is already taken by another app`)
        toast('error', `Hotkey ${binding.accelerator} is in use by another app`)
      }
    } catch (err) {
      console.error(`[hotkeys] invalid accelerator ${binding.accelerator}`, err)
    }
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
