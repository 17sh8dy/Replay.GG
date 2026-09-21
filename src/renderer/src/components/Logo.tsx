import { MARK_ARROWS_PATH, MARK_R_PATH, MARK_VIEWBOX } from '@shared/logoMark'

interface LogoMarkProps {
  size?: number
  className?: string
}

/**
 * The Replay.gg mark (R + rewind). Same vector as assets/logo/replay-gg-mark.svg, inlined so
 * it needs no asset loading and works under the app's strict CSP. Colours are the brand's:
 * white R, brand-red arrows, for use on dark surfaces.
 */
export function LogoMark({ size = 22, className }: LogoMarkProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      className={className}
      role="img"
      aria-label="Replay.gg"
    >
      <path fill="#FFFFFF" d={MARK_R_PATH} />
      <path fill="#E6293F" d={MARK_ARROWS_PATH} />
    </svg>
  )
}
