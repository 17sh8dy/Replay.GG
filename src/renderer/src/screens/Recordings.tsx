import { MediaBrowser } from '../components/MediaBrowser'

export function Recordings(): JSX.Element {
  return (
    <MediaBrowser
      title="Recordings"
      kind="recording"
      emptyIcon="video"
      emptyTitle="No recordings yet"
      emptyMessage="Head to Home and hit Record, or use your hotkey while a game is running."
    />
  )
}
