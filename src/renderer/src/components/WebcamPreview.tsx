import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import './WebcamPreview.css'

type Position = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

interface WebcamPreviewProps {
  /** The DirectShow name Replay.gg records from, e.g. "Logitech StreamCam". */
  label: string | null
  /** The "Show webcam overlay" switch. Off means the camera is not opened at all. */
  enabled: boolean
  /** Overlay width as a percentage of the recorded frame, exactly as the recorder uses it. */
  size: number
  position: Position
}

type State = 'idle' | 'starting' | 'live' | 'busy'

/**
 * Chromium and DirectShow name the same camera slightly differently (Chromium often appends
 * the USB id, "Logitech StreamCam (046d:0893)"), so match on a prefix rather than equality.
 */
function sameCamera(browserLabel: string, dshowLabel: string): boolean {
  const a = browserLabel.toLowerCase()
  const b = dshowLabel.toLowerCase()
  return a === b || a.startsWith(b) || b.startsWith(a)
}

/**
 * A live look at the selected camera, in a glass panel.
 *
 * It only holds the camera while it is on screen: the stream is stopped on unmount, when the
 * selection changes and when the window is hidden, so the preview never keeps a webcam light
 * on in the background or fights the recorder for the device.
 */
export function WebcamPreview({ label, enabled, size, position }: WebcamPreviewProps): JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    if (!label || !enabled) {
      setState('idle')
      return
    }

    let cancelled = false
    let stream: MediaStream | null = null

    const stop = (): void => {
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      if (video.current) video.current.srcObject = null
    }

    const start = async (): Promise<void> => {
      setState('starting')
      try {
        // Labels are only readable once permission has been granted, so open any camera first.
        const probe = await navigator.mediaDevices.getUserMedia({ video: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        const match = devices.find((d) => d.kind === 'videoinput' && sameCamera(d.label, label))
        const probeId = probe.getVideoTracks()[0]?.getSettings().deviceId

        if (match && match.deviceId !== probeId) {
          probe.getTracks().forEach((t) => t.stop())
          stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: match.deviceId } }
          })
        } else if (match) {
          stream = probe
        } else {
          probe.getTracks().forEach((t) => t.stop())
          throw new Error('camera not found')
        }

        if (cancelled) return stop()
        if (video.current) {
          video.current.srcObject = stream
          await video.current.play().catch(() => undefined)
        }
        setState('live')
      } catch {
        stop()
        // Busy (the recorder has it), unplugged, or blocked — all read the same to a person.
        if (!cancelled) setState('busy')
      }
    }

    void start()

    const onVisibility = (): void => {
      if (document.hidden) {
        stop()
        if (!cancelled) setState('idle')
      } else if (!stream && !cancelled) {
        void start()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [label, enabled])

  const showing = enabled && label
  const message = !enabled
    ? 'Turn on “Show webcam overlay” to preview'
    : !label
      ? 'Choose a camera to preview it'
      : state === 'busy'
        ? 'Camera unavailable — it may be in use'
        : 'Starting camera…'

  return (
    <div className="webcam-preview" data-state={state}>
      {/* A stand-in for the recorded frame. The camera sits on it exactly where, and as big
          as, the recorder will place it — size and position update as you change them. */}
      <div className="webcam-preview__frame">
        <span className="webcam-preview__screen">Your recording</span>

        <video
          ref={video}
          muted
          playsInline
          className={`webcam-preview__video webcam-preview__video--${position}`}
          style={{ width: `${size}%` }}
        />

        {state !== 'live' && (
          <div className="webcam-preview__empty">
            <Icon name="video" size={22} strokeWidth={1.5} />
            <span>{message}</span>
          </div>
        )}
      </div>

      {showing && (
        <span className="webcam-preview__tag">
          <span className={`webcam-preview__dot${state === 'live' ? ' webcam-preview__dot--live' : ''}`} />
          {label}
        </span>
      )}
    </div>
  )
}
