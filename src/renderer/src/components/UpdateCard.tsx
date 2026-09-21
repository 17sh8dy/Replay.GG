import { useState } from 'react'
import { Icon } from './Icon'
import { Button } from './ui'
import { useApp } from '../state/AppContext'
import './UpdateCard.css'

/**
 * The "update available" pop-up.
 *
 * It appears only when there is something to act on: a newer version was found, one is being
 * downloaded, or one is ready to install. It never downloads or installs on its own. "Later"
 * hides it for this version until the next launch; the update stays available from
 * Settings > General > Updates.
 */
export function UpdateCard(): JSX.Element | null {
  const { update, pushToast } = useApp()
  const [dismissed, setDismissed] = useState<string | null>(null)

  const visible =
    (update.state === 'available' || update.state === 'ready' || update.state === 'downloading') &&
    dismissed !== update.latestVersion
  if (!visible) return null

  const install = async (): Promise<void> => {
    const result = await window.replay.update.install()
    if (!result.ok && result.reason === 'recording') {
      pushToast('error', 'Finish your recording first, then restart to update.')
    }
  }

  return (
    <aside className="update-card" role="alertdialog" aria-label="Update available">
      <span className="update-card__icon">
        <Icon name="upgrade" size={18} />
      </span>

      <div className="update-card__body">
        {update.state === 'available' && (
          <>
            <strong>Replay.gg {update.latestVersion} is available</strong>
            <span className="update-card__sub">You have {update.currentVersion}.</span>
            {update.notes && <p className="update-card__notes">{update.notes}</p>}
            <div className="update-card__actions">
              <Button variant="primary" size="sm" onClick={() => void window.replay.update.download()}>
                Download update
              </Button>
              <Button size="sm" onClick={() => setDismissed(update.latestVersion)}>
                Later
              </Button>
            </div>
          </>
        )}

        {update.state === 'downloading' && (
          <>
            <strong>Downloading {update.latestVersion}…</strong>
            <div className="update-card__bar" aria-hidden="true">
              <div className="update-card__fill" style={{ width: `${update.progress}%` }} />
            </div>
            <span className="update-card__sub">{update.progress}%</span>
          </>
        )}

        {update.state === 'ready' && (
          <>
            <strong>Update ready</strong>
            <span className="update-card__sub">
              Replay.gg {update.latestVersion} will install when you restart.
            </span>
            <div className="update-card__actions">
              <Button variant="primary" size="sm" onClick={() => void install()}>
                Restart &amp; update
              </Button>
              <Button size="sm" onClick={() => setDismissed(update.latestVersion)}>
                Later
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
