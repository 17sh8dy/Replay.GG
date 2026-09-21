import { WebcamPreview } from '../components/WebcamPreview'
import { UpdatesGroup } from '../components/UpdatesGroup'
import { useEffect, useState, type ReactNode } from 'react'
import type {
  AccountState,
  AudioDevice,
  Encoder,
  QualityPreset,
  ResolutionPreset,
  Settings as ReplaySettings,
  VideoDevice
} from '@shared/types'
import { Icon } from '../components/Icon'
import { Button, Confirm, Select, Slider, Toggle } from '../components/ui'
import { HotkeyInput } from '../components/HotkeyInput'
import { useApp } from '../state/AppContext'
import { formatBytes } from '../lib/format'
import './Settings.css'

type Section = 'capture' | 'audio' | 'replay' | 'hotkeys' | 'storage' | 'general' | 'account'

const SECTIONS: { id: Section; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'capture', label: 'Capture', icon: 'monitor' },
  { id: 'audio', label: 'Audio', icon: 'speaker' },
  { id: 'replay', label: 'Instant Replay', icon: 'bolt' },
  { id: 'hotkeys', label: 'Hotkeys', icon: 'keyboard' },
  { id: 'storage', label: 'Storage', icon: 'disk' },
  { id: 'general', label: 'General', icon: 'settings' },
  /* Last, not first. Replay.gg records without an account and always will, and an account tab
     at the top of a settings list is how an optional thing starts reading as a required one. */
  { id: 'account', label: 'Nova Account', icon: 'star' }
]

export function Settings(): JSX.Element {
  const { settings, capabilities, storage, updateSettings, resetSettings, pushToast } = useApp()

  const [section, setSection] = useState<Section>('capture')
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [videoDevices, setVideoDevices] = useState<VideoDevice[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const [account, setAccount] = useState<AccountState | null>(null)

  /* Re-read Windows' device list whenever the Audio tab opens, so a mic or camera plugged in
     after launch appears without restarting the app. */
  useEffect(() => {
    if (section !== 'audio' && section !== 'capture') return
    void window.replay.system.audioDevices().then(setDevices)
    void window.replay.system.videoDevices().then(setVideoDevices)
  }, [section])

  /**
   * The account state, asked for ONLY while its tab is open.
   *
   * Nothing about accounts runs when nobody is looking at them: opening Settings on the
   * Capture tab makes no account call at all, and the app is completely inert on this front
   * for somebody who never visits the tab. While it IS open a sign-in is in flight, so it
   * polls — the main process is waiting on the browser, and this is how the code disappears
   * from the screen once it has been approved.
   */
  useEffect(() => {
    if (section !== 'account') return
    let alive = true
    const ask = (): void => {
      void window.replay.account.state().then((next) => alive && setAccount(next))
    }
    ask()
    const timer = setInterval(ask, 1500)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [section])

  if (!settings) return <div className="screen" />

  const deviceOptions = [
    { value: '', label: devices.length ? 'Select a device…' : 'No devices found' },
    ...devices.map((d) => ({ value: d.id, label: d.label }))
  ]
  const videoDeviceOptions = [
    { value: '', label: videoDevices.length ? 'Select a camera…' : 'No cameras found' },
    ...videoDevices.map((d) => ({ value: d.id, label: d.label }))
  ]
  const webcamPositionOptions: { value: ReplaySettings['webcam']['position']; label: string }[] = [
    { value: 'top-left', label: 'Top left' },
    { value: 'top-right', label: 'Top right' },
    { value: 'bottom-left', label: 'Bottom left' },
    { value: 'bottom-right', label: 'Bottom right' }
  ]

  const pickFolder = async (key: 'recordingsPath' | 'clipsPath'): Promise<void> => {
    const picked = await window.replay.settings.pickFolder()
    if (picked) await updateSettings({ storage: { [key]: picked } })
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Tune capture, audio and hotkeys.</p>
        </div>
        <Button onClick={() => setConfirmReset(true)}>Reset to defaults</Button>
      </header>

      <div className="settings">
        <nav className="settings__nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`settings__tab${section === s.id ? ' settings__tab--active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <Icon name={s.icon} size={17} />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings__panel">
          {section === 'capture' && (
            <>
            <Group title="Video">
              <Row
                label="Capture display"
                hint="Recording every monitor at once produces very wide files."
              >
                <Select
                  value={settings.capture.mode === 'display' ? settings.capture.displayId ?? '' : 'all'}
                  onChange={(v) =>
                    void updateSettings(
                      v === 'all'
                        ? { capture: { mode: 'game' } }
                        : { capture: { mode: 'display', displayId: v || null } }
                    )
                  }
                  options={[
                    { value: '', label: 'Primary display' },
                    ...(capabilities?.displays ?? []).map((d) => ({
                      value: d.id,
                      label: `${d.label} · ${d.width}×${d.height}`
                    })),
                    { value: 'all', label: 'All displays' }
                  ]}
                />
              </Row>

              <Row label="Quality" hint="Higher quality uses more disk space.">
                <Select<QualityPreset>
                  value={settings.capture.quality}
                  onChange={(quality) => void updateSettings({ capture: { quality } })}
                  options={[
                    { value: 'low', label: 'Low · 8 Mbps' },
                    { value: 'medium', label: 'Medium · 16 Mbps' },
                    { value: 'high', label: 'High · 30 Mbps' },
                    { value: 'ultra', label: 'Ultra · 60 Mbps' },
                    { value: 'custom', label: 'Custom' }
                  ]}
                />
              </Row>

              {settings.capture.quality === 'custom' && (
                <Row label="Bitrate">
                  <Slider
                    value={settings.capture.bitrate}
                    min={4}
                    max={150}
                    step={2}
                    onChange={(bitrate) => void updateSettings({ capture: { bitrate } })}
                    format={(v) => `${v} Mbps`}
                  />
                </Row>
              )}

              <Row label="Resolution">
                <Select<ResolutionPreset>
                  value={settings.capture.resolution}
                  onChange={(resolution) => void updateSettings({ capture: { resolution } })}
                  options={[
                    { value: 'native', label: 'Native (no scaling)' },
                    { value: '2160p', label: '2160p · 4K' },
                    { value: '1440p', label: '1440p' },
                    { value: '1080p', label: '1080p' },
                    { value: '720p', label: '720p' }
                  ]}
                />
              </Row>

              <Row label="Frame rate">
                <Select
                  value={String(settings.capture.fps)}
                  onChange={(v) => void updateSettings({ capture: { fps: Number(v) } })}
                  options={[
                    { value: '30', label: '30 FPS' },
                    { value: '60', label: '60 FPS (maximum)' }
                  ]}
                />
              </Row>

              <Row label="Encoder" hint="Hardware encoders keep your framerate stable in game.">
                <Select<Encoder>
                  value={settings.capture.encoder}
                  onChange={(encoder) => void updateSettings({ capture: { encoder } })}
                  options={[
                    { value: 'auto', label: 'Automatic (recommended)' },
                    ...(capabilities?.encoders ?? []).map((e) => ({
                      value: e.id,
                      label: e.available ? e.label : `${e.label} — unavailable`,
                      disabled: !e.available
                    }))
                  ]}
                />
              </Row>
            </Group>

              <Group title="Webcam">
                <Row label="Show webcam overlay">
                  <Toggle
                    checked={settings.webcam.enabled}
                    onChange={(enabled) =>
                      void updateSettings({
                        webcam: {
                          enabled,
                          ...(enabled && !settings.webcam.deviceId && videoDevices[0]
                            ? { deviceId: videoDevices[0].id }
                            : {})
                        }
                      })
                    }
                  />
                </Row>
                <Row label="Camera">
                  <Select
                    value={settings.webcam.deviceId ?? ''}
                    onChange={(deviceId) => void updateSettings({ webcam: { deviceId: deviceId || null } })}
                    options={videoDeviceOptions}
                  />
                </Row>
                <WebcamPreview
                  label={settings.webcam.deviceId}
                  enabled={settings.webcam.enabled}
                  size={settings.webcam.size}
                  position={settings.webcam.position}
                />
                <Row label="Position">
                  <Select
                    value={settings.webcam.position}
                    onChange={(position) => void updateSettings({ webcam: { position } })}
                    options={webcamPositionOptions}
                  />
                </Row>
                <Row label="Size" hint="How wide the overlay is, as a share of the recorded frame.">
                  <Slider
                    value={settings.webcam.size}
                    min={10}
                    max={45}
                    onChange={(size) => void updateSettings({ webcam: { size } })}
                    format={(v) => `${v}%`}
                  />
                </Row>
              </Group>
            </>
          )}

          {section === 'audio' && (
            <>
              <Group title="System audio">
                <Row label="Capture system audio">
                  <Toggle
                    checked={settings.audio.systemAudioEnabled}
                    onChange={(systemAudioEnabled) =>
                      void updateSettings({ audio: { systemAudioEnabled } })
                    }
                  />
                </Row>
                <Row
                  label="Device"
                  hint="Windows needs a loopback device (for example “Stereo Mix” or a virtual audio cable) to record game sound."
                >
                  <Select
                    value={settings.audio.systemAudioDeviceId ?? ''}
                    onChange={(systemAudioDeviceId) =>
                      void updateSettings({
                        audio: { systemAudioDeviceId: systemAudioDeviceId || null }
                      })
                    }
                    options={deviceOptions}
                  />
                </Row>
              </Group>

              <Group title="Microphone">
                <Row label="Capture microphone">
                  <Toggle
                    checked={settings.audio.microphoneEnabled}
                    onChange={(microphoneEnabled) => {
                      // Turning it on with no device chosen would record silence, so pick one.
                      const pick =
                        devices.find((d) => /mic/i.test(d.label)) ?? devices[0]
                      void updateSettings({
                        audio: {
                          microphoneEnabled,
                          ...(microphoneEnabled && !settings.audio.microphoneDeviceId && pick
                            ? { microphoneDeviceId: pick.id }
                            : {})
                        }
                      })
                    }}
                  />
                </Row>
                <Row label="Device">
                  <Select
                    value={settings.audio.microphoneDeviceId ?? ''}
                    onChange={(microphoneDeviceId) =>
                      void updateSettings({
                        audio: { microphoneDeviceId: microphoneDeviceId || null }
                      })
                    }
                    options={deviceOptions}
                  />
                </Row>
                <Row
                  label="Separate audio tracks"
                  hint="Keeps mic and game audio on their own tracks so you can edit them apart later."
                >
                  <Toggle
                    checked={settings.audio.separateTracks}
                    onChange={(separateTracks) => void updateSettings({ audio: { separateTracks } })}
                  />
                </Row>
              </Group>
            </>
          )}

          {section === 'replay' && (
            <Group title="Instant Replay">
              <Row
                label="Buffer length"
                hint="How much gameplay is held in memory, ready to save at any moment."
              >
                <Slider
                  value={settings.replayBuffer.length}
                  min={30}
                  max={900}
                  step={30}
                  onChange={(length) => void updateSettings({ replayBuffer: { length } })}
                  format={(v) => (v >= 60 ? `${Math.round(v / 60)} min` : `${v}s`)}
                />
              </Row>
              <Row label="Clip length" hint="How much is written when you hit the save hotkey.">
                <Slider
                  value={settings.replayBuffer.clipLength}
                  min={5}
                  max={Math.max(30, settings.replayBuffer.length)}
                  step={5}
                  onChange={(clipLength) => void updateSettings({ replayBuffer: { clipLength } })}
                  format={(v) => `${v}s`}
                />
              </Row>
            </Group>
          )}

          {section === 'hotkeys' && (
            <Group title="Global hotkeys" hint="These work even while a game has focus.">
              <Row label="Start / stop recording">
                <HotkeyInput
                  value={settings.hotkeys.toggleRecording.accelerator}
                  onChange={(accelerator) =>
                    void updateSettings({ hotkeys: { toggleRecording: { accelerator } } })
                  }
                />
              </Row>
              <Row label="Save instant replay">
                <HotkeyInput
                  value={settings.hotkeys.saveReplay.accelerator}
                  onChange={(accelerator) =>
                    void updateSettings({ hotkeys: { saveReplay: { accelerator } } })
                  }
                />
              </Row>
              <Row label="Toggle instant replay">
                <HotkeyInput
                  value={settings.hotkeys.toggleReplayBuffer.accelerator}
                  onChange={(accelerator) =>
                    void updateSettings({ hotkeys: { toggleReplayBuffer: { accelerator } } })
                  }
                />
              </Row>
            </Group>
          )}

          {section === 'storage' && (
            <>
              <Group title="Locations">
                <Row label="Recordings folder">
                  <div className="path-row">
                    <span className="path" title={settings.storage.recordingsPath}>
                      {settings.storage.recordingsPath}
                    </span>
                    <Button icon="folder" onClick={() => void pickFolder('recordingsPath')}>
                      Change
                    </Button>
                  </div>
                </Row>
                <Row label="Clips folder">
                  <div className="path-row">
                    <span className="path" title={settings.storage.clipsPath}>
                      {settings.storage.clipsPath}
                    </span>
                    <Button icon="folder" onClick={() => void pickFolder('clipsPath')}>
                      Change
                    </Button>
                  </div>
                </Row>
              </Group>

              <Group title="Usage">
                <div className="usage">
                  <div className="usage__item">
                    <span className="usage__value">
                      {storage ? formatBytes(storage.recordings) : '—'}
                    </span>
                    <span className="usage__label">Recordings</span>
                  </div>
                  <div className="usage__item">
                    <span className="usage__value">{storage ? formatBytes(storage.clips) : '—'}</span>
                    <span className="usage__label">Clips</span>
                  </div>
                  <div className="usage__item">
                    <span className="usage__value">{storage ? formatBytes(storage.free) : '—'}</span>
                    <span className="usage__label">Free on drive</span>
                  </div>
                </div>
                <Row
                  label="Rescan library"
                  hint="Picks up files added or removed outside the app."
                >
                  <Button
                    icon="refresh"
                    onClick={() => {
                      void window.replay.library.rescan()
                      pushToast('info', 'Rescanning your folders…')
                    }}
                  >
                    Rescan
                  </Button>
                </Row>
              </Group>
            </>
          )}

          {section === 'general' && (
            <>
              <Group title="Application">
                <Row
                  label="Keep running in the tray"
                  hint="Closing the window keeps hotkeys and Instant Replay alive."
                >
                  <Toggle
                    checked={settings.general.minimizeToTray}
                    onChange={(minimizeToTray) =>
                      void updateSettings({ general: { minimizeToTray } })
                    }
                  />
                </Row>
                <Row
                  label="Launch on startup"
                  hint={
                    capabilities && !capabilities.startupSupported
                      ? 'Available in the installed app — not in a development run.'
                      : 'Starts Replay.gg quietly in the tray when you sign in to Windows, so hotkeys and Instant Replay are ready. Takes effect at your next sign-in — no restart needed.'
                  }
                >
                  <Toggle
                    checked={settings.general.launchOnStartup}
                    disabled={capabilities ? !capabilities.startupSupported : true}
                    onChange={(launchOnStartup) =>
                      void updateSettings({ general: { launchOnStartup } })
                    }
                  />
                </Row>
                <Row label="Show notifications">
                  <Toggle
                    checked={settings.general.showNotifications}
                    onChange={(showNotifications) =>
                      void updateSettings({ general: { showNotifications } })
                    }
                  />
                </Row>
              </Group>

              <UpdatesGroup />

              <Group title="System">
                <Row label="ffmpeg">
                  <span className={capabilities?.ffmpegAvailable ? 'ok' : 'bad'}>
                    {capabilities?.ffmpegAvailable
                      ? capabilities.ffmpegPath
                      : 'Not found — recording is disabled'}
                  </span>
                </Row>
                <Row label="Displays">
                  <span className="muted">
                    {capabilities?.displays
                      .map((d) => `${d.width}×${d.height}`)
                      .join(', ') ?? '—'}
                  </span>
                </Row>
              </Group>
            </>
          )}

          {section === 'account' && <AccountSection state={account} onChange={setAccount} />}
        </div>
      </div>

      <Confirm
        open={confirmReset}
        title="Reset all settings?"
        message="Every preference goes back to its default. Your recordings and clips are untouched."
        confirmLabel="Reset"
        destructive
        onConfirm={() => {
          void resetSettings()
          setConfirmReset(false)
          pushToast('success', 'Settings reset')
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}

function Group({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <section className="group">
      <div className="group__head">
        <h2>{title}</h2>
        {hint && <p className="muted">{hint}</p>}
      </div>
      <div className="group__body">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <span className="setting-row__label">{label}</span>
        {hint && <span className="setting-row__hint">{hint}</span>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  )
}

/**
 * Nova Account — the optional one.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THE FIRST THING THIS PANEL SAYS IS THAT REPLAY.GG DOES NOT NEED IT.
 *
 * That is not modesty, it is accuracy: recording, the replay buffer, clipping and the library
 * do not consult the account and never will. An account button in a screen recorder is exactly
 * the kind of thing people are right to be suspicious of, so this panel answers the suspicion
 * before it is raised rather than after.
 *
 * THERE IS NO PASSWORD FIELD HERE. Replay.gg shows an eight-character code, the person
 * approves it in their own browser at Nova.Help, and the token that comes back lives in the
 * MAIN process — the renderer never holds it, which is why this app can keep a CSP that
 * cannot reach the network at all. See main/services/account.ts.
 */
function AccountSection({
  state,
  onChange
}: {
  state: AccountState | null
  onChange: (next: AccountState) => void
}): JSX.Element {
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<AccountState>): Promise<void> => {
    setBusy(true)
    try {
      onChange(await action())
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Group
        title="Nova Account"
        hint="Optional. Replay.gg records, clips and stores everything on this PC either way."
      >
        {state?.pending ? (
          <>
            <Row
              label="Approve in your browser"
              hint="Your browser opened with this app's request. Sign in to Nova, choose Connect, then type the code below to finish. It expires in ten minutes."
            >
              <Button onClick={() => void window.replay.account.reopenSignIn()}>
                <Icon name="external" size={15} /> Open browser again
              </Button>
            </Row>
            <Row
              label="Your code"
              hint={`Type this on the last step to confirm it's this app. If the page didn't open, go to ${state.pending.verificationUri} and enter it there.`}
            >
              <code className="account__code">{state.pending.userCode}</code>
            </Row>
            <Row label="Waiting for approval">
              <Button onClick={() => void run(() => window.replay.account.cancel())} disabled={busy}>
                Cancel
              </Button>
            </Row>
          </>
        ) : state?.signedIn ? (
          <>
            <Row label="Signed in as">
              <span>{state.displayName ?? 'Your Nova Account'}</span>
            </Row>
            <Row
              label="Sign out"
              hint="Your recordings, clips and settings are on this PC and are not touched."
            >
              <Button
                onClick={() => void run(() => window.replay.account.signOut())}
                disabled={busy}
              >
                Sign out
              </Button>
            </Row>
          </>
        ) : (
          <Row
            label="Sign in to Nova"
            hint="One account across Nova. Replay.gg shows a code and you approve it in your browser — it never sees your password."
          >
            <Button
              onClick={() => void run(() => window.replay.account.signIn())}
              disabled={busy}
            >
              Sign in
            </Button>
          </Row>
        )}

        {state?.problem && (
          <Row label="Problem">
            <span className="bad">{state.problem}</span>
          </Row>
        )}
      </Group>

      <Group
        title="What an account is for"
        hint="Today it does exactly one thing, and it is worth being specific about which."
      >
        <Row
          label="Support tickets"
          hint="Tickets you file on Nova.Help can be tied to your account, so you can follow them without a ticket ID."
        >
          <Button onClick={() => void window.replay.account.openHelp()}>
            <Icon name="external" size={15} /> Help with Replay.gg
          </Button>
        </Row>
        <Row label="Nova.Help" hint="The support portal: guides, tickets and contact.">
          <Button onClick={() => void window.replay.account.openSite('help')}>
            <Icon name="external" size={15} /> Open Nova.Help
          </Button>
        </Row>
        <Row label="Nova" hint="The Nova home page. You can view everything there without signing in.">
          <Button onClick={() => void window.replay.account.openSite('nova')}>
            <Icon name="external" size={15} /> Open Nova
          </Button>
        </Row>
        <Row
          label="Edit your account"
          hint="Viewing is open to you everywhere. To make changes, use the Nova account page."
        >
          <Button onClick={() => void window.replay.account.openSite('account')}>
            <Icon name="external" size={15} /> Manage account
          </Button>
        </Row>
        <Row
          label="Your recordings"
          hint="Never uploaded, never read, never listed. Nothing in this app sends a file anywhere."
        >
          <span className="muted">Stay on this PC</span>
        </Row>
      </Group>
    </>
  )
}
