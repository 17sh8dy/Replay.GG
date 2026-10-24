import { Icon } from '../components/Icon'
import { Button } from '../components/ui'
import { PLANS, type Plan } from '../lib/plans'
import './Upgrade.css'

/**
 * Upgrade: the subscription plans.
 *
 * Presentation only for now. The plans come from `lib/plans.ts` and there is no billing behind
 * them, so the buttons say so rather than pretend. Recording, Instant Replay and the library
 * are not touched by anything on this screen.
 */
export function Upgrade(): JSX.Element {
  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Upgrade</h1>
          <p className="muted">Get more out of every session.</p>
        </div>
        <span className="upgrade__current">
          <span className="upgrade__current-dot" />
          You&apos;re on Free
        </span>
      </header>

      <div className="screen__body">
        <div className="upgrade__grid">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        <section className="upgrade__request" aria-label="Plan ideas">
          <div>
            <h2 className="upgrade__request-title">Have an idea for Replay.GG plans?</h2>
            <p className="upgrade__request-text">
              Tell us what you would want from a plan. Share it on Discord.
            </p>
          </div>
          <a
            className="upgrade__discord"
            href="https://discord.gg/XBhER9Z6EB"
            target="_blank"
            rel="noreferrer"
            aria-label="Join the Discord"
            title="Join the Discord"
          >
            <DiscordLogo />
          </a>
        </section>

        <p className="upgrade__fine">
          Plans and pricing aren&apos;t final. Nothing here is charged yet.
        </p>
      </div>
    </div>
  )
}

function DiscordLogo(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  )
}

function PlanCard({ plan }: { plan: Plan }): JSX.Element {
  return (
    <article className={`plan${plan.highlighted ? ' plan--highlight' : ''}`}>
      {plan.badge && <span className="plan__badge">{plan.badge}</span>}

      <h2 className="plan__name">{plan.name}</h2>
      <p className="plan__tagline">{plan.tagline}</p>
      <p className="plan__price">{plan.price}</p>

      <Button variant={plan.highlighted ? 'primary' : 'secondary'} fullWidth disabled>
        Coming soon
      </Button>

      <div className="plan__rule" />

      {plan.includes && <p className="plan__includes">{plan.includes}</p>}

      <ul className="plan__features">
        {plan.features.map((f) => (
          <li key={f.label} className="plan__feature">
            <span className="plan__feature-icon">
              <Icon name={f.icon} size={17} />
            </span>
            <span>
              <strong>{f.label}</strong>
              <span className="plan__feature-detail">{f.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </article>
  )
}
