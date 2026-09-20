import { Icon, type IconName } from './Icon'
import { useApp } from '../state/AppContext'
import { formatBytes } from '../lib/format'
import type { Route } from '../routes'
import './Sidebar.css'

interface NavItem {
  route: Route
  label: string
  icon: IconName
}

const NAV: NavItem[] = [
  { route: 'home', label: 'Home', icon: 'home' },
  { route: 'recordings', label: 'Recordings', icon: 'video' },
  { route: 'clips', label: 'Clips', icon: 'scissors' },
  { route: 'library', label: 'Library', icon: 'library' },
  { route: 'upgrade', label: 'Upgrade', icon: 'upgrade' }
]

interface SidebarProps {
  route: Route
  onNavigate: (route: Route) => void
}

export function Sidebar({ route, onNavigate }: SidebarProps): JSX.Element {
  const { storage, replay, toggleReplayBuffer } = useApp()

  const used = storage ? storage.recordings + storage.clips : 0
  const capacity = storage?.total ?? 0
  const usedPct = capacity > 0 ? Math.min(100, ((capacity - storage!.free) / capacity) * 100) : 0
  // The bar tracks the whole drive, so it is near-full on most machines. Only
  // flag it once free space is genuinely tight for capture.
  const lowSpace = capacity > 0 && storage!.free / capacity < 0.1

  return (
    <nav className="sidebar">
      <div className="sidebar__nav">
        {NAV.map((item) => (
          <button
            key={item.route}
            className={`nav-item${route === item.route ? ' nav-item--active' : ''}`}
            onClick={() => onNavigate(item.route)}
          >
            <span className="nav-item__indicator" />
            <span className="nav-item__glyph">
              <Icon name={item.icon} size={22} />
            </span>
            <span className="nav-item__label">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar__footer">
        {/* Instant Replay is the app's signature feature, so it gets a
            permanent home rather than living only in Settings. */}
        <button
          className={`replay-toggle${replay.enabled ? ' replay-toggle--on' : ''}`}
          onClick={() => void toggleReplayBuffer()}
        >
          <div className="replay-toggle__head">
            <Icon name="bolt" size={15} />
            <span>Instant Replay</span>
            <span className={`switch${replay.enabled ? ' switch--on' : ''}`}>
              <span className="switch__knob" />
            </span>
          </div>
          <span className="replay-toggle__hint">
            {replay.enabled
              ? replay.active
                ? `Buffering · ${replay.buffered}s ready`
                : 'Starting…'
              : 'Off'}
          </span>
        </button>

        <div className="storage">
          <div className="storage__row">
            <Icon name="disk" size={14} />
            <span className="storage__label">Storage</span>
            <span className="storage__value mono">{formatBytes(used)}</span>
          </div>
          <div className="storage__bar">
            <div
              className={`storage__fill${lowSpace ? ' storage__fill--low' : ''}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <span className="storage__free">
            {storage ? `${formatBytes(storage.free)} free` : '—'}
          </span>
        </div>

        <button
          className={`nav-item nav-item--settings${route === 'settings' ? ' nav-item--active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <span className="nav-item__indicator" />
          <span className="nav-item__glyph">
            <Icon name="settings" size={22} />
          </span>
          <span className="nav-item__label">Settings</span>
        </button>
      </div>
    </nav>
  )
}
