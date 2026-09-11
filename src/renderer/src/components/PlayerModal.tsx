import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaItem } from '@shared/types'
import { Icon } from './Icon'
import { Button } from './ui'
import { formatBytes, formatDate, formatDuration, formatResolution } from '../lib/format'
import { useApp } from '../state/AppContext'
import './PlayerModal.css'

interface PlayerModalProps {
  item: MediaItem
  onClose: () => void
}

/**
 * Full-screen playback with an inline trimmer. Clipping lives here rather than
 * in a separate editor screen because "watch it back, then cut the good part"
 * is one continuous action for the user.
 */
export function PlayerModal({ item, onClose }: PlayerModalProps): JSX.Element {
  const { pushToast } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(item.duration || 0)
  const [trimming, setTrimming] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [saving, setSaving] = useState(false)

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }, [])

  const seek = useCallback(
    (seconds: number) => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = Math.max(0, Math.min(duration, seconds))
    },
    [duration]
  )

  // Keyboard control. Space/arrows are what people expect from a player, and
  // the modal owns focus while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          seek((videoRef.current?.currentTime ?? 0) - (e.shiftKey ? 10 : 5))
          break
        case 'ArrowRight':
          e.preventDefault()
          seek((videoRef.current?.currentTime ?? 0) + (e.shiftKey ? 10 : 5))
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, seek, onClose])

  const startTrim = (): void => {
    // Default to a 30s window centred on where the user is watching, clamped
    // to the file — this is almost always close to what they want.
    const half = Math.min(15, duration / 2)
    const start = Math.max(0, time - half)
    const end = Math.min(duration, start + 30)
    setTrimStart(start)
    setTrimEnd(end)
    setTrimming(true)
    videoRef.current?.pause()
  }

  const saveClip = async (): Promise<void> => {
    const length = trimEnd - trimStart
    if (length < 0.5) {
      pushToast('error', 'Clip is too short')
      return
    }
    setSaving(true)
    const created = await window.replay.library.createClip({
      sourceId: item.id,
      start: trimStart,
      duration: length,
      title: `${item.title} clip`
    })
    setSaving(false)
    if (created) setTrimming(false)
  }

  const progressPct = duration > 0 ? (time / duration) * 100 : 0

  const onScrub = (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    seek(((e.clientX - rect.left) / rect.width) * duration)
  }

  return (
    <div className="player-backdrop" onMouseDown={onClose}>
      <div className="player" onMouseDown={(e) => e.stopPropagation()}>
        <div className="player__head">
          <div className="player__titles">
            <h2>{item.title}</h2>
            <span className="muted">
              {item.game ? `${item.game} · ` : ''}
              {formatDate(item.createdAt)}
            </span>
          </div>
          <button className="player__close" onClick={onClose} aria-label="Close player">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="player__stage">
          <video
            ref={videoRef}
            src={window.replay.mediaUrl(item.path)}
            autoPlay
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              // Trust the element over the indexed value — a stream-copied clip
              // can report a slightly different duration.
              if (Number.isFinite(e.currentTarget.duration)) {
                setDuration(e.currentTarget.duration)
              }
            }}
          />
        </div>

        <div className="player__controls">
          <div className="scrubber" onClick={onScrub}>
            <div className="scrubber__track">
              <div className="scrubber__played" style={{ width: `${progressPct}%` }} />
              {trimming && (
                <div
                  className="scrubber__selection"
                  style={{
                    left: `${(trimStart / duration) * 100}%`,
                    width: `${((trimEnd - trimStart) / duration) * 100}%`
                  }}
                />
              )}
              <div className="scrubber__head" style={{ left: `${progressPct}%` }} />
            </div>
          </div>

          <div className="player__bar">
            <button className="player__play" onClick={togglePlay}>
              <Icon name={playing ? 'pause' : 'play'} size={18} />
            </button>

            <span className="player__time mono">
              {formatDuration(time)} <span className="dim">/ {formatDuration(duration)}</span>
            </span>

            <div className="player__spacer" />

            <div className="player__stats">
              <span>{formatResolution(item.width, item.height)}</span>
              <span className="card__sep">·</span>
              <span>{item.fps ? `${item.fps} FPS` : '—'}</span>
              <span className="card__sep">·</span>
              <span>{formatBytes(item.size)}</span>
            </div>

            {!trimming && (
              <Button icon="scissors" variant="primary" onClick={startTrim}>
                Create Clip
              </Button>
            )}
          </div>

          {trimming && (
            <div className="trimmer">
              <div className="trimmer__row">
                <label>
                  <span className="trimmer__label">Start</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration - 0.5)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setTrimStart(next)
                      if (next >= trimEnd) setTrimEnd(Math.min(duration, next + 1))
                      seek(next)
                    }}
                  />
                  <span className="mono trimmer__value">{formatDuration(trimStart)}</span>
                </label>

                <label>
                  <span className="trimmer__label">End</span>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setTrimEnd(next)
                      if (next <= trimStart) setTrimStart(Math.max(0, next - 1))
                      seek(next)
                    }}
                  />
                  <span className="mono trimmer__value">{formatDuration(trimEnd)}</span>
                </label>
              </div>

              <div className="trimmer__foot">
                <span className="muted">
                  Clip length{' '}
                  <strong className="mono trimmer__length">
                    {formatDuration(Math.max(0, trimEnd - trimStart))}
                  </strong>
                </span>
                <div className="trimmer__actions">
                  <Button onClick={() => setTrimming(false)}>Cancel</Button>
                  <Button variant="primary" onClick={() => void saveClip()} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Clip'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
