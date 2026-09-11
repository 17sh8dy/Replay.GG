import { MediaBrowser } from '../components/MediaBrowser'

export function Library(): JSX.Element {
  return (
    <MediaBrowser
      title="Library"
      emptyIcon="library"
      emptyTitle="Your library is empty"
      emptyMessage="Everything you record and clip lands here, searchable in one place."
    />
  )
}
