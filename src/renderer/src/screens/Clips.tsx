import { MediaBrowser } from '../components/MediaBrowser'

export function Clips(): JSX.Element {
  return (
    <MediaBrowser
      title="Clips"
      kind="clip"
      emptyIcon="scissors"
      emptyTitle="No clips yet"
      emptyMessage="Turn on Instant Replay and press your save hotkey, or open a recording and trim a clip from it."
    />
  )
}
