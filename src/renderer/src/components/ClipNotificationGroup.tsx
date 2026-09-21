import type { ReactNode } from 'react'
import type { ClipNotificationSettings } from '@shared/types'
import { Button, Select, Slider, Toggle } from './ui'
import { useApp } from '../state/AppContext'

type Position = ClipNotificationSettings['position']
type Animation = ClipNotificationSettings['animation']

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
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
 * Settings > General > Clip Capture Notification.
 *
 * The small "Clip Captured" overlay shown when a clip is saved. It is optional, and separate from
 * the toast inside the app window, which stays as it is.
 */
export function ClipNotificationGroup(): JSX.Element {
  const { settings, capabilities, updateSettings } = useApp()
  if (!settings) return <></>

  const cfg = settings.notifications.clipCapture
  const set = (patch: Partial<ClipNotificationSettings>): void =>
    void updateSettings({ notifications: { clipCapture: patch } })

  const displays = capabilities?.displays ?? []
  const displayOptions = [
    { value: 'all', label: 'All monitors' },
    ...displays.map((d, i) => ({
      value: d.id,
      label: `Monitor ${i + 1}${d.isPrimary ? ' (primary)' : ''} · ${d.width}×${d.height}`
    }))
  ]
  // A saved monitor that has since been unplugged still needs a row to show as selected.
  if (cfg.display !== 'all' && !displays.some((d) => d.id === cfg.display)) {
    displayOptions.push({ value: cfg.display, label: 'Monitor (not connected)' })
  }

  const positions: { value: Position; label: string }[] = [
    { value: 'top-left', label: 'Top left' },
    { value: 'top-right', label: 'Top right' },
    { value: 'bottom-left', label: 'Bottom left' },
    { value: 'bottom-right', label: 'Bottom right' },
    { value: 'custom', label: 'Custom' }
  ]
  const animations: { value: Animation; label: string }[] = [
    { value: 'fade', label: 'Fade' },
    { value: 'slide', label: 'Slide' },
    { value: 'fade-slide', label: 'Fade + Slide' },
    { value: 'none', label: 'None' }
  ]

  return (
    <section className="group">
      <div className="group__head">
        <h2>Clip Capture Notification</h2>
      </div>
      <div className="group__body">
        <Row
          label="Show Clip Captured Notification"
          hint="Show a small overlay whenever Replay.gg successfully saves a clip."
        >
          <Toggle checked={cfg.enabled} onChange={(enabled) => set({ enabled })} />
        </Row>

        {cfg.enabled && (
          <>
            <Row label="Display on">
              <Select value={cfg.display} onChange={(display) => set({ display })} options={displayOptions} />
            </Row>

            <Row label="Position">
              <Select
                value={cfg.position}
                onChange={(position) => set({ position: position as Position })}
                options={positions}
              />
            </Row>

            {cfg.position === 'custom' && (
              <>
                <Row label="Horizontal" hint="How far across the screen, left to right.">
                  <Slider
                    value={cfg.customX}
                    min={0}
                    max={100}
                    onChange={(customX) => set({ customX })}
                    format={(v) => `${v}%`}
                  />
                </Row>
                <Row label="Vertical" hint="How far down the screen, top to bottom.">
                  <Slider
                    value={cfg.customY}
                    min={0}
                    max={100}
                    onChange={(customY) => set({ customY })}
                    format={(v) => `${v}%`}
                  />
                </Row>
              </>
            )}

            <Row label="Display duration">
              <Select
                value={String(cfg.duration)}
                onChange={(v) => set({ duration: Number(v) })}
                options={[1, 2, 3, 4, 5].map((s) => ({ value: String(s), label: `${s}s` }))}
              />
            </Row>

            <Row label="Animation">
              <Select
                value={cfg.animation}
                onChange={(animation) => set({ animation: animation as Animation })}
                options={animations}
              />
            </Row>

            <Row
              label="Try it"
              hint="Shows a sample now. It appears over windowed and borderless games, not exclusive fullscreen."
            >
              <Button onClick={() => void window.replay.notifications.previewClip()}>Preview</Button>
            </Row>
          </>
        )}
      </div>
    </section>
  )
}
