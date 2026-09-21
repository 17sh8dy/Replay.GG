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

export type NovaProductKind = 'app' | 'site' | 'soon'

interface NovaProduct {
  id: string
  label: string
  tagline: string
  icon: IconName
  /**
   * What kind of thing this is, because opening one is a different act:
   *   'app'  — a desktop app. Launched by the main process (found on this PC, started in the
   *            background); if it isn't installed the person is sent to its page or told so.
   *   'site' — a website, opened in the default browser.
   *   'soon' — nothing to open yet; the row renders disabled.
   * The addresses and program names themselves live in the main process (services/products.ts),
   * keyed by `id` — this list is only what gets shown.
   */
  kind: NovaProductKind
}

const PRODUCTS: NovaProduct[] = [
  { id: 'nova-cut', label: 'Nova Cut', tagline: 'Create and edit', icon: 'scissors', kind: 'soon' },
  { id: 'replay-gg', label: 'Replay.GG', tagline: 'Record and clip gameplay', icon: 'bolt', kind: 'app' },
  { id: 'atlas', label: 'Atlas', tagline: 'Your desktop assistant', icon: 'star', kind: 'app' },
  { id: 'nova-games', label: 'Nova Games', tagline: 'Coming soon', icon: 'gamepad', kind: 'soon' }
]

/**
 * The Nova websites, shown under "Websites" in View all (not in the quick dropdown, which is for
 * jumping between apps). Only sites that are deployed and have a real address are links; the
 * rest render as "Soon" until they are. The addresses live in the main process
 * (services/products.ts), keyed by `id`, like the apps.
 */
const SITES: NovaProduct[] = [
  { id: 'nova-help', label: 'Nova.Help', tagline: 'Support and guides', icon: 'search', kind: 'site' },
  { id: 'atlas-site', label: 'Atlas Website', tagline: 'Download and learn about Atlas', icon: 'star', kind: 'site' },
  { id: 'nova', label: 'Nova', tagline: 'The Nova home page', icon: 'home', kind: 'soon' },
  { id: 'nova-legal', label: 'Nova Legal', tagline: 'Terms and privacy', icon: 'library', kind: 'soon' },
  { id: 'nova-cut-site', label: 'Nova Cut Website', tagline: 'Nova Cut, on the web', icon: 'scissors', kind: 'soon' }
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
          if (p.kind === 'soon') {
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
            <button
              key={p.id}
              type="button"
              className="nova-switcher__item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void window.replay.products.open(p.id)
              }}
            >
              {body}
              {p.kind === 'site' && <Icon name="external" size={13} className="nova-switcher__kind" />}
            </button>
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
        sites={SITES}
        mark={<NovaMark />}
      />
    </div>
  )
}
