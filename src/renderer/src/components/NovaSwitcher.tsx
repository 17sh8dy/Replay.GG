import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { NovaAllProducts } from './NovaAllProducts'
import './NovaSwitcher.css'

/**
 * The Nova product switcher — a small trigger next to the Replay.gg brand mark that opens a
 * menu of sibling Nova products. Ported from the reference implementation in OpenCutSite
 * (src/components.mjs `novaSwitcher()` + data/nova.js) and mirrored in Open Cut's own app
 * (packages/ui/src/panels/NovaSwitcher.tsx) — see either for the design rationale, and keep this
 * list in sync with theirs by hand.
 *
 * The trigger reads "Product Switcher" rather than "Replay.gg" or "Nova" — it announces what it
 * does, not which product you're already in (the brand mark to its left already does that).
 *
 * Left out on purpose: Nova, Nova.Help and NovaLegal each already have their own way to switch
 * between the products they front, so neither gets this switcher nor is listed as a destination
 * in it. Online Earth was never asked for and isn't here either.
 */

interface NovaProduct {
  id: string
  label: string
  tagline: string
  icon: IconName
  /**
   * None of these has a confirmed public domain yet. TODO: confirm the real URL for each before
   * this ships — a wrong guess here sends someone to an unregistered domain, not somewhere
   * unsafe, but it should be fixed before launch. `null` (Nova Games) means there is genuinely
   * nothing to link to yet, not just an unconfirmed one — that row renders disabled instead.
   */
  url: string | null
}

const PRODUCTS: NovaProduct[] = [
  { id: 'nova-cut', label: 'Nova Cut', tagline: 'Create and edit', icon: 'scissors', url: 'https://novacut.app' },
  { id: 'replay-gg', label: 'Replay.GG', tagline: 'Record and clip gameplay', icon: 'bolt', url: 'https://replay.gg' },
  { id: 'atlas', label: 'Atlas', tagline: 'Your desktop assistant', icon: 'star', url: 'https://atlas.app' },
  { id: 'nova-games', label: 'Nova Games', tagline: 'Coming soon', icon: 'gamepad', url: null }
]

/** The Nova sparkle mark — identical to assets/favicon.svg in the Nova repo. */
function NovaMark(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nova-switcher__mark-svg">
      <rect width="24" height="24" rx="5.5" fill="#0E1120" />
      <path
        fill="#7C5CFF"
        d="M12 3.1c.52 5.46 3.95 8.89 9.41 9.41-5.46.52-8.89 3.95-9.41 9.41-.52-5.46-3.95-8.89-9.41-9.41C8.05 11.99 11.48 8.56 12 3.1Z"
      />
    </svg>
  )
}

export function NovaSwitcher({ current }: { current: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [allOpen, setAllOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="nova-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="nova-switcher__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nova-switcher__mark">
          <NovaMark />
        </span>
        <span className="nova-switcher__trigger-label">Product Switcher</span>
        <Icon name="chevronDown" size={12} className="nova-switcher__chevron" />
      </button>
      <div className="nova-switcher__menu" role="menu" data-open={open}>
        <p className="nova-switcher__eyebrow">Nova</p>
        {PRODUCTS.map((p) => {
          const isCurrent = p.id === current
          const body = (
            <>
              <span className="nova-switcher__icon">
                <Icon name={p.icon} size={16} />
              </span>
              <span className="nova-switcher__text">
                <span className="nova-switcher__label">{p.label}</span>
                <span className="nova-switcher__tagline">{isCurrent ? "You're here" : p.tagline}</span>
              </span>
            </>
          )

          if (isCurrent) {
            return (
              <span
                key={p.id}
                className="nova-switcher__item nova-switcher__item--current"
                role="menuitem"
                aria-current="true"
              >
                {body}
              </span>
            )
          }
          if (!p.url) {
            return (
              <span
                key={p.id}
                className="nova-switcher__item nova-switcher__item--soon"
                role="menuitem"
                aria-disabled="true"
              >
                {body}
                <span className="nova-switcher__badge">Soon</span>
              </span>
            )
          }
          return (
            <a key={p.id} className="nova-switcher__item" role="menuitem" href={p.url} target="_blank" rel="noreferrer">
              {body}
            </a>
          )
        })}
        <button
          type="button"
          className="nova-switcher__viewall"
          onClick={() => {
            setOpen(false)
            setAllOpen(true)
          }}
        >
          <span>View all</span>
          <Icon name="chevronRight" size={13} />
        </button>
      </div>
      <NovaAllProducts
        open={allOpen}
        onClose={() => setAllOpen(false)}
        current={current}
        products={PRODUCTS}
        mark={<NovaMark />}
      />
    </div>
  )
}
