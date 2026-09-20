/**
 * The app is a fixed-shell desktop tool, not a deep-linked website, so a
 * string union beats pulling in a router. Adding a screen means adding a
 * member here plus a case in `App`.
 */
export type Route = 'home' | 'recordings' | 'clips' | 'library' | 'settings' | 'upgrade'

export const ROUTE_TITLES: Record<Route, string> = {
  home: 'Home',
  recordings: 'Recordings',
  clips: 'Clips',
  library: 'Library',
  settings: 'Settings',
  upgrade: 'Upgrade'
}
