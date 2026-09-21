import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { LogoMark } from './Logo'
import { NovaSwitcher } from './NovaSwitcher'
import { useApp } from '../state/AppContext'
import { formatDuration } from '../lib/format'
import './TitleBar.css'

/**
 * Custom window chrome. The whole strip is a drag region except the controls
 * and the live status pill, which stay clickable.
 */
export function TitleBar(): JSX.Element {
  const { recording, replay } = useApp()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    void window.replay.window.isMaximized().then(setMaximized)
  }, [])

  const toggleMaximize = async (): Promise<void> => {
    setMaximized(await window.replay.window.toggleMaximize())
  }

  const isRecording = recording.state === 'recording'

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <span className="titlebar__mark">
          <LogoMark size={22} />
        </span>
        <span className="titlebar__name">
          Replay<span className="titlebar__tld">.gg</span>
        </span>
      </div>

      <NovaSwitcher current="replay-gg" />

      <div className="titlebar__status">
        {isRecording && (
          <div className="status-pill status-pill--recording">
            <span className="status-pill__dot" />
            REC
            <span className="mono status-pill__time">{formatDuration(recording.elapsed)}</span>
          </div>
        )}
        {replay.active && !isRecording && (
          <div className="status-pill status-pill--replay">
            <Icon name="bolt" size={12} />
            Instant Replay
          </div>
        )}
      </div>

      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          onClick={() => void window.replay.window.minimize()}
          aria-label="Minimize"
        >
          <Icon name="minimize" size={16} />
        </button>
        <button
          className="titlebar__btn"
          onClick={() => void toggleMaximize()}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          <Icon name={maximized ? 'restore' : 'maximize'} size={14} />
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          onClick={() => void window.replay.window.close()}
          aria-label="Close"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </header>
  )
}
