/**
 * Inline icon set. Hand-rolled rather than pulled from a library so the whole
 * set shares one stroke weight and optical size, and so nothing is loaded
 * over the network (the CSP forbids it anyway).
 */

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9',
  video: 'M15 10.5 21.5 7v10L15 13.5M3 7.5h12v9H3z',
  scissors:
    'M6 4l12 12M18 4L6 16M6.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  library: 'M4 5v14M9 5v14M14 5.5l5.5 1.5-3.5 13L14 18.5',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5c0-.6-.06-1.2-.17-1.76l2-1.55-2-3.46-2.35.95a8 8 0 0 0-3.05-1.77L14 2h-4l-.43 2.41A8 8 0 0 0 6.52 6.2L4.17 5.23l-2 3.46 2 1.55a8.2 8.2 0 0 0 0 3.52l-2 1.55 2 3.46 2.35-.95a8 8 0 0 0 3.05 1.77L10 22h4l.43-2.41a8 8 0 0 0 3.05-1.77l2.35.95 2-3.46-2-1.55c.11-.56.17-1.16.17-1.76Z',
  record: '',
  stop: '',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M9 5v14M15 5v14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  star: 'M12 3.5l2.6 5.55 6.02.8-4.4 4.2 1.12 6L12 17.2 6.66 20.05l1.12-6-4.4-4.2 6.02-.8z',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6',
  pencil: 'M4 20h4L19 9a2.12 2.12 0 0 0-3-3L5 17v3zM15 6l3 3',
  folder: 'M3 6.5h6l2 2.5h10v11H3z',
  close: 'M6 6l12 12M18 6L6 18',
  minimize: 'M5 12h14',
  maximize: 'M5.5 5.5h13v13h-13z',
  restore: 'M8 8V5.5h10.5V16H16M5.5 8H16v10.5H5.5z',
  chevronRight: 'M9.5 5l7 7-7 7',
  chevronDown: 'M5 9.5l7 7 7-7',
  check: 'M5 12.5l4.5 4.5L19 7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.4 2',
  disk: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  mic: 'M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3ZM6 11a6 6 0 0 0 12 0M12 17.5V21',
  speaker: 'M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10',
  monitor: 'M3 5h18v11H3zM9 20h6M12 16v4',
  keyboard:
    'M3 7h18v10H3zM7 10.5h.01M11 10.5h.01M15 10.5h.01M8 13.5h8',
  bolt: 'M13 3 5 13.5h6L11 21l8-10.5h-6z',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4',
  external: 'M14 5h5v5M19 5l-8 8M17 14v5H5V7h5',
  filter: 'M4 6h16l-6 7v6l-4-2v-4z',
  film: 'M3 5h18v14H3zM7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4',
  gamepad:
    'M7.5 9h9a4.5 4.5 0 0 1 4.4 5.4l-.5 2.5A2.5 2.5 0 0 1 16 17.6L14.5 16h-5L8 17.6a2.5 2.5 0 0 1-4.4-.7l-.5-2.5A4.5 4.5 0 0 1 7.5 9ZM7 11.5v3M5.5 13h3M15.5 12h.01M17.5 14h.01'
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  className?: string
  /** Overrides stroke width for large decorative uses. */
  strokeWidth?: number
}

export function Icon({ name, size = 20, className, strokeWidth = 1.7 }: IconProps): JSX.Element {
  // A couple of glyphs are solid shapes rather than strokes.
  if (name === 'record') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
        <circle cx="12" cy="12" r="7" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'stop') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
        <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" />
      </svg>
    )
  }

  const filled = name === 'play'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
