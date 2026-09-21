import { Button } from './ui'
import { useApp } from '../state/AppContext'

/** Settings > General > Updates: the version, the last check, and a manual "Check now". */
function ago(ms: number | null): string {
  if (!ms) return 'not checked yet'
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`
}

export function UpdatesGroup(): JSX.Element {
  const { update, pushToast } = useApp()

  const install = async (): Promise<void> => {
    const result = await window.replay.update.install()
    if (!result.ok && result.reason === 'recording') {
      pushToast('error', 'Finish your recording first, then restart to update.')
    }
  }

  const status: { text: string; action: JSX.Element | null } = (() => {
    switch (update.state) {
      case 'unsupported':
        return { text: 'Updates are available in the installed app, not in a development run.', action: null }
      case 'checking':
        return { text: 'Checking…', action: null }
      case 'available':
        return {
          text: `Version ${update.latestVersion} is available.`,
          action: (
            <Button variant="primary" onClick={() => void window.replay.update.download()}>
              Download update
            </Button>
          )
        }
      case 'downloading':
        return { text: `Downloading ${update.latestVersion}… ${update.progress}%`, action: null }
      case 'ready':
        return {
          text: `Version ${update.latestVersion} is ready to install.`,
          action: (
            <Button variant="primary" onClick={() => void install()}>
              Restart &amp; update
            </Button>
          )
        }
      case 'error':
        return {
          text: `Couldn't check for updates. ${update.error ?? ''}`.trim(),
          action: <Button onClick={() => void window.replay.update.check()}>Try again</Button>
        }
      default:
        return {
          text: `You're up to date. Last checked ${ago(update.checkedAt)}.`,
          action: <Button onClick={() => void window.replay.update.check()}>Check now</Button>
        }
    }
  })()

  return (
    <section className="group">
      <div className="group__head">
        <h2>Updates</h2>
        <p className="muted">
          Replay.gg looks for new versions on its own and asks before downloading or installing.
        </p>
      </div>
      <div className="group__body">
        <div className="setting-row">
          <div className="setting-row__text">
            <span className="setting-row__label">Version</span>
          </div>
          <div className="setting-row__control">
            <span className="muted">{update.currentVersion ? `v${update.currentVersion}` : '—'}</span>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-row__text">
            <span className="setting-row__label">Status</span>
            <span className="setting-row__hint">{status.text}</span>
          </div>
          <div className="setting-row__control">{status.action}</div>
        </div>
      </div>
    </section>
  )
}
