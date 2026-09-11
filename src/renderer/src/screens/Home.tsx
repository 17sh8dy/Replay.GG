import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EncoderInfo, DisplayInfo, MediaItem } from '@shared/types'
import { Icon, type IconName } from '../components/Icon'
import { Button, EmptyState } from '../components/ui'
import { MediaCard } from '../components/MediaCard'
import { PlayerModal } from '../components/PlayerModal'
import { useApp } from '../state/AppContext'
import { formatBytes, formatDuration, hotkeyParts } from '../lib/format'
import type { Route } from '../routes'
import './Home.css'

interface HomeProps {
  onNavigate: (route: Route) => void
}

export function Home({ onNavigate }: HomeProps): JSX.Element {
  const {
    recording,
    replay,
    settings,
    storage,
    capabilities,
    libraryVersion,
    toggleRecording,
    toggleReplayBuffer,
    saveReplay
  } = useApp()

  const [clips, setClips] = useState<MediaItem[]>([])
  const [recordings, setRecordings] = useState<MediaItem[]>([])
  const [playing, setPlaying] = useState<MediaItem | null>(null)
  const [detectedGame, setDetectedGame] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([
      window.replay.library.list({ kind: 'clip', sort: 'newest' }),
      window.replay.library.list({ kind: 'recording', sort: 'newest' })
    ])
    setClips(c)
    setRecordings(r)
  }, [])

  useEffect(() => {
    void load()
  }, [load, libraryVersion])

  // Poll the foreground process so the "current game" indicator is live even
  // before a recording starts. Cheap (a short PowerShell call) and paused
  // implicitly while recording, where recording.game is authoritative.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async (): Promise<void> => {
      try {
        const game = await window.replay.system.activeGame()
        if (!cancelled) setDetectedGame(game)
      } catch {
        /* transient; try again next tick */
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 6000)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  const isRecording = recording.state === 'recording'
  const busy = recording.state === 'starting' || recording.state === 'stopping'
  const ffmpegMissing = capabilities !== null && !capabilities.ffmpegAvailable
  const canCapture = capabilities === null || capabilities.ffmpegAvailable

  const currentGame = isRecording ? recording.game : detectedGame

  // --- Live capture profile ------------------------------------------------
  const encoder = useMemo<EncoderInfo | null>(() => {
    if (!capabilities) return null
    const pref = settings?.capture.encoder ?? 'auto'
    if (pref !== 'auto') {
      const exact = capabilities.encoders.find((e) => e.id === pref && e.available)
      if (exact) return exact
    }
    return capabilities.encoders.find((e) => e.available) ?? null
  }, [capabilities, settings])

  const display = useMemo<DisplayInfo | null>(() => {
    if (!capabilities) return null
    const id = settings?.capture.displayId
    return (
      capabilities.displays.find((d) => d.id === id) ??
      capabilities.displays.find((d) => d.isPrimary) ??
      capabilities.displays[0] ??
      null
    )
  }, [capabilities, settings])

  const micOn = settings?.audio.microphoneEnabled ?? false
  const resLabel = display ? `${display.height}p` : settings ? settings.capture.resolution : '—'
  const fps = settings?.capture.fps ?? 60

  // --- Storytelling numbers -----------------------------------------------
  const totalCaptureTime = useMemo(
    () => [...clips, ...recordings].reduce((sum, i) => sum + (i.duration || 0), 0),
    [clips, recordings]
  )
  const usedBytes = storage ? storage.recordings + storage.clips : 0
  const driveFillPct =
    storage && storage.total > 0
      ? Math.min(100, ((storage.total - storage.free) / storage.total) * 100)
      : 0

  const recentClips = clips.slice(0, 4)
  const recentRecordings = recordings.slice(0, 4)

  const bufferPct =
    replay.capacity > 0 ? Math.min(100, (replay.buffered / replay.capacity) * 100) : 0

  const toggleFavorite = async (item: MediaItem): Promise<void> => {
    await window.replay.library.setFavorite(item.id, !item.favorite)
  }

  // Readiness pill state feeds the eyebrow dot and the first status chip.
  const readiness: { tone: 'ok' | 'live' | 'danger'; label: string } = ffmpegMissing
    ? { tone: 'danger', label: 'Encoder unavailable' }
    : isRecording
      ? { tone: 'live', label: 'Recording now' }
      : { tone: 'ok', label: 'Ready to capture' }

  return (
    <div className="screen">
      <div className="screen__body home">
        {ffmpegMissing && (
          <div className="banner banner--warn">
            <Icon name="bolt" size={17} />
            <div>
              <strong>ffmpeg wasn’t found.</strong>
              <p className="muted">
                Recording and clipping need ffmpeg. Install it and make sure it’s on your PATH, or
                drop <code>ffmpeg.exe</code> into the app’s <code>resources/ffmpeg</code> folder,
                then restart.
              </p>
            </div>
          </div>
        )}

        {/* --- Hero: the one standout ------------------------------------- */}
        <section className={`hero${isRecording ? ' hero--live' : ''}`}>
          <div className="hero__aurora" aria-hidden="true" />
          <div className="hero__grid" aria-hidden="true" />

          <div className="hero__body">
            <div className="hero__info">
              <span className={`hero__eyebrow hero__eyebrow--${readiness.tone}`}>
                <span className="hero__pulse" />
                {readiness.label}
              </span>

              <h1 className="hero__title">
                {isRecording
                  ? formatDuration(recording.elapsed)
                  : currentGame
                    ? currentGame
                    : 'Record any PC game'}
              </h1>

              <p className="hero__sub">
                {isRecording
                  ? recording.game
                    ? `Capturing ${recording.game} in ${resLabel} · ${fps} FPS`
                    : `Capturing your display in ${resLabel} · ${fps} FPS`
                  : currentGame
                    ? 'Detected and ready — hit record to capture your session.'
                    : 'Full-screen capture with hardware encoding. Nothing to configure.'}
              </p>

              {/* Live status rail — readiness, encoder, resolution, game, mic */}
              <div className="hero__rail">
                <StatusChip tone={readiness.tone} dot>
                  {ffmpegMissing ? 'Not ready' : isRecording ? 'Live' : 'Ready'}
                </StatusChip>
                <StatusChip icon="bolt" tone={encoder ? 'accent' : 'default'}>
                  {encoder ? encoder.label : 'No encoder'}
                </StatusChip>
                <StatusChip icon="monitor">
                  {resLabel} · {fps} FPS
                </StatusChip>
                <StatusChip icon="gamepad" tone={currentGame ? 'accent' : 'default'}>
                  {currentGame ?? 'No game detected'}
                </StatusChip>
                <StatusChip icon="mic" tone={micOn ? 'accent' : 'muted'}>
                  {micOn ? 'Mic on' : 'Mic off'}
                </StatusChip>
              </div>
            </div>

            <div className="hero__action">
              <button
                className={`record-orb${isRecording ? ' record-orb--stop' : ''}`}
                onClick={() => void toggleRecording()}
                disabled={busy || ffmpegMissing}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                <span className="record-orb__halo" />
                <span className="record-orb__ring" />
                <Icon name={isRecording ? 'stop' : 'record'} size={30} />
                <span className="record-orb__label">
                  {busy ? '…' : isRecording ? 'Stop' : 'Record'}
                </span>
              </button>

              {settings && (
                <div className="record-orb__hotkey">
                  {hotkeyParts(settings.hotkeys.toggleRecording.accelerator).map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* --- Quick actions --------------------------------------------- */}
        <section className="quick">
          <QuickAction
            icon={isRecording ? 'stop' : 'record'}
            label={isRecording ? 'Stop recording' : 'Record'}
            hint={isRecording ? 'Capturing now' : 'Full session'}
            tone={isRecording ? 'danger' : 'accent'}
            disabled={busy || ffmpegMissing}
            onClick={() => void toggleRecording()}
          />
          <QuickAction
            icon="scissors"
            label="Save replay"
            hint={replay.active ? `Last ${settings?.replayBuffer.clipLength ?? 30}s` : 'Turn on buffer'}
            disabled={!replay.active}
            onClick={() => void saveReplay()}
          />
          <QuickAction
            icon="library"
            label="Open library"
            hint="Browse everything"
            onClick={() => onNavigate('library')}
          />
          <QuickAction
            icon="settings"
            label="Settings"
            hint="Capture & audio"
            onClick={() => onNavigate('settings')}
          />
        </section>

        {/* --- Stats + Instant Replay ------------------------------------ */}
        <section className="panels">
          <div className="stat-grid">
            <StoryStat
              icon="scissors"
              value={String(clips.length)}
              label="Highlights saved"
              hint={clips.length ? 'Clips in your library' : 'Clip your best moments'}
              onClick={() => onNavigate('clips')}
            />
            <StoryStat
              icon="video"
              value={String(recordings.length)}
              label="Sessions recorded"
              hint={recordings.length ? 'Full-length captures' : 'Press record to start'}
              onClick={() => onNavigate('recordings')}
            />
            <StoryStat
              icon="clock"
              value={totalCaptureTime > 0 ? formatDuration(totalCaptureTime) : '0:00'}
              label="Total capture time"
              hint={totalCaptureTime > 0 ? 'Across all captures' : 'Nothing captured yet'}
            />
            <div className="story-stat story-stat--storage">
              <span className="story-stat__icon">
                <Icon name="disk" size={18} />
              </span>
              <div className="story-stat__meta">
                <span className="story-stat__value">{formatBytes(usedBytes)}</span>
                <span className="story-stat__label">Used by Replay.gg</span>
              </div>
              <div className="story-stat__bar">
                <div className="story-stat__fill" style={{ width: `${driveFillPct}%` }} />
              </div>
              <span className="story-stat__hint">
                {storage ? `${formatBytes(storage.free)} free on drive` : 'Reading disk…'}
              </span>
            </div>
          </div>

          <div className={`replay-card${replay.enabled ? ' replay-card--on' : ''}`}>
            <div className="replay-card__top">
              <span className="replay-card__icon">
                <Icon name="bolt" size={18} />
              </span>
              <div className="replay-card__head">
                <h3>Instant Replay</h3>
                <p className="muted">
                  {replay.enabled
                    ? replay.active
                      ? `${replay.buffered}s of ${replay.capacity}s buffered`
                      : 'Warming up…'
                    : 'Always capturing the last moments'}
                </p>
              </div>
              <button
                className={`switch switch--lg${replay.enabled ? ' switch--on' : ''}`}
                onClick={() => void toggleReplayBuffer()}
                role="switch"
                aria-checked={replay.enabled}
                aria-label="Toggle Instant Replay"
              >
                <span className="switch__knob" />
              </button>
            </div>

            <div className={`replay-card__meter${replay.active ? ' replay-card__meter--live' : ''}`}>
              <div className="replay-card__fill" style={{ width: `${bufferPct}%` }} />
            </div>

            <p className="replay-card__desc muted">
              {replay.enabled
                ? 'Press the hotkey any time to save what just happened — no need to be recording.'
                : 'Switch it on and Replay.gg keeps a rolling buffer so you never miss the play.'}
            </p>

            <Button
              variant="primary"
              icon="scissors"
              fullWidth
              disabled={!replay.active}
              onClick={() => void saveReplay()}
            >
              Save last {settings?.replayBuffer.clipLength ?? 30}s
            </Button>

            {settings && (
              <div className="replay-card__hotkey">
                {hotkeyParts(settings.hotkeys.saveReplay.accelerator).map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
                <span className="dim">to save from anywhere</span>
              </div>
            )}
          </div>
        </section>

        {/* --- Recent media ---------------------------------------------- */}
        <RecentRow
          title="Recent Clips"
          seeAllLabel="clips"
          items={recentClips}
          emptyIcon="scissors"
          emptyTitle="No clips yet"
          emptyMessage="Save a moment with Instant Replay or trim a recording, and your highlights land here."
          emptyAction={
            <Button
              variant="secondary"
              icon="bolt"
              disabled={ffmpegMissing}
              onClick={() => void (replay.enabled ? saveReplay() : toggleReplayBuffer())}
            >
              {replay.enabled ? 'Save a replay' : 'Turn on Instant Replay'}
            </Button>
          }
          onSeeAll={() => onNavigate('clips')}
          onOpen={setPlaying}
          onToggleFavorite={(i) => void toggleFavorite(i)}
        />

        <RecentRow
          title="Recent Recordings"
          seeAllLabel="recordings"
          items={recentRecordings}
          emptyIcon="video"
          emptyTitle="No recordings yet"
          emptyMessage="Hit the record button above to capture your first full session — it’ll show up right here."
          emptyAction={
            <Button
              variant="primary"
              icon="record"
              disabled={busy || !canCapture}
              onClick={() => void toggleRecording()}
            >
              Start recording
            </Button>
          }
          onSeeAll={() => onNavigate('recordings')}
          onOpen={setPlaying}
          onToggleFavorite={(i) => void toggleFavorite(i)}
        />
      </div>

      {playing && <PlayerModal item={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}

// --- Status chip -----------------------------------------------------------
function StatusChip({
  icon,
  dot,
  tone = 'default',
  children
}: {
  icon?: IconName
  dot?: boolean
  tone?: 'default' | 'accent' | 'muted' | 'ok' | 'live' | 'danger'
  children: React.ReactNode
}): JSX.Element {
  return (
    <span className={`schip schip--${tone}`}>
      {dot && <span className="schip__dot" />}
      {icon && <Icon name={icon} size={14} />}
      <span className="schip__text">{children}</span>
    </span>
  )
}

// --- Quick action tile -----------------------------------------------------
function QuickAction({
  icon,
  label,
  hint,
  tone = 'default',
  disabled,
  onClick
}: {
  icon: IconName
  label: string
  hint: string
  tone?: 'default' | 'accent' | 'danger'
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      className={`qa qa--${tone}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      <span className="qa__icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="qa__text">
        <span className="qa__label">{label}</span>
        <span className="qa__hint">{hint}</span>
      </span>
      <span className="qa__chevron">
        <Icon name="chevronRight" size={16} />
      </span>
    </button>
  )
}

// --- Story stat card -------------------------------------------------------
function StoryStat({
  icon,
  value,
  label,
  hint,
  onClick
}: {
  icon: IconName
  value: string
  label: string
  hint: string
  onClick?: () => void
}): JSX.Element {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`story-stat${onClick ? ' story-stat--clickable' : ''}`} onClick={onClick}>
      <span className="story-stat__icon">
        <Icon name={icon} size={18} />
      </span>
      <div className="story-stat__meta">
        <span className="story-stat__value">{value}</span>
        <span className="story-stat__label">{label}</span>
      </div>
      <span className="story-stat__hint">{hint}</span>
    </Tag>
  )
}

// --- Recent media row ------------------------------------------------------
function RecentRow({
  title,
  seeAllLabel,
  items,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  emptyAction,
  onSeeAll,
  onOpen,
  onToggleFavorite
}: {
  title: string
  seeAllLabel: string
  items: MediaItem[]
  emptyIcon: IconName
  emptyTitle: string
  emptyMessage: string
  emptyAction: React.ReactNode
  onSeeAll: () => void
  onOpen: (item: MediaItem) => void
  onToggleFavorite: (item: MediaItem) => void
}): JSX.Element {
  return (
    <section className="row">
      <div className="row__head">
        <h2>{title}</h2>
        {items.length > 0 && (
          <button className="row__all" onClick={onSeeAll}>
            See all {seeAllLabel} <Icon name="chevronRight" size={14} />
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="row__empty">
          <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} action={emptyAction} />
        </div>
      ) : (
        <div className="media-grid">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onOpen={onOpen}
              onToggleFavorite={onToggleFavorite}
              onRename={() => onSeeAll()}
              onDelete={() => onSeeAll()}
            />
          ))}
        </div>
      )}
    </section>
  )
}
