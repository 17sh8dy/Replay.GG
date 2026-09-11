import { useEffect, useRef } from 'react'
import { Icon, type IconName } from './Icon'
import './NovaAllProducts.css'

/**
 * The full-screen "all Nova products" view — opened by the "View all" row at the foot of
 * NovaSwitcher's dropdown. The dropdown stays the quick way to jump straight to a sibling
 * product; this is the slower, better-looking one for actually browsing the family, laid out as
 * a card grid instead of a short menu.
 *
 * Styled after Online Earth's All Tools launcher (read directly from that repo's all-tools/
 * before building this) but built from this app's own tokens — `--bg-overlay` (theme.css) is
 * already the dedicated scrim colour, and `fade-in`/`scale-in` are the same entrance keyframes
 * PlayerModal already uses — rather than Online Earth's own hand-rolled glass values, so this
 * never introduces a second glass language next to the one the app already has.
 */

export interface NovaAllProduct {
  id: string
  label: string
  tagline: string
  icon: IconName
  url: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  current: string
  currentLabel?: string
  products: NovaAllProduct[]
  mark: React.ReactNode
}

export function NovaAllProducts({ open, onClose, current, currentLabel, products, mark }: Props): JSX.Element | null {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="nova-all__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nova-all-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button ref={closeRef} type="button" className="nova-all__close" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={18} />
      </button>
      <div className="nova-all">
        <p className="nova-all__eyebrow">
          <span className="nova-all__mark">{mark}</span>
          <span>Nova</span>
        </p>
        <h2 className="nova-all__title" id="nova-all-title">
          All products
        </h2>
        <p className="nova-all__subtitle">Everything Nova makes, in one place.</p>
        <div className="nova-all__grid">
          {products.map((p, i) => {
            const isCurrent = p.id === current
            const label = isCurrent && currentLabel ? currentLabel : p.label
            const body = (
              <>
                <span className="nova-all__icon">
                  <Icon name={p.icon} size={20} />
                </span>
                <span className="nova-all__label">{label}</span>
                <span className="nova-all__tagline">{isCurrent ? "You're here" : p.tagline}</span>
              </>
            )
            const style = { animationDelay: `${i * 40}ms` }

            if (isCurrent) {
              return (
                <span key={p.id} className="nova-all__card nova-all__card--current" style={style}>
                  {body}
                </span>
              )
            }
            if (!p.url) {
              return (
                <span key={p.id} className="nova-all__card nova-all__card--soon" style={style}>
                  {body}
                  <span className="nova-all__badge">Soon</span>
                </span>
              )
            }
            return (
              <a key={p.id} className="nova-all__card" href={p.url} target="_blank" rel="noreferrer" style={style}>
                {body}
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
