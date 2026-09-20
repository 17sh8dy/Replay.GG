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

        <p className="upgrade__fine">
          Plans and pricing aren&apos;t final. Nothing here is charged yet.
        </p>
      </div>
    </div>
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
