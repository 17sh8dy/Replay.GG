import type { IconName } from '../components/Icon'

/**
 * The subscription plans shown on the Upgrade screen.
 *
 * PLACEHOLDER CONTENT. The plan names, the split of features between the two plans and the
 * absence of prices are all undecided. This file is the ONE place to change them and the
 * screen re-renders from it. Nothing here is wired to billing: there is no checkout, and the
 * plan buttons are disabled until there is one.
 */

export interface PlanFeature {
  icon: IconName
  label: string
  /** One short line, shown under the label. */
  detail: string
}

export interface Plan {
  id: string
  name: string
  tagline: string
  /** Undecided, so shown as-is. Put "$X / month" here when it exists. */
  price: string
  /** Renders a "includes everything in ..." line above the features. */
  includes?: string
  highlighted?: boolean
  badge?: string
  features: PlanFeature[]
}

export const PLANS: Plan[] = [
  {
    id: 'plus',
    name: 'Plus',
    tagline: 'Never miss a great moment.',
    price: 'Pricing coming soon',
    features: [
      {
        icon: 'bolt',
        label: 'Auto game highlights',
        detail: 'Replay.gg spots the big plays and clips them for you.'
      },
      {
        icon: 'clock',
        label: 'Longer replay buffer',
        detail: 'Reach further back when something happens.'
      },
      {
        icon: 'film',
        label: 'Higher-quality exports',
        detail: 'Sharper clips to share or edit.'
      },
      {
        icon: 'disk',
        label: 'Larger local recording limits',
        detail: 'Record longer sessions before you hit a cap.'
      },
      {
        icon: 'settings',
        label: 'More customization',
        detail: 'Make the app and your captures look the way you want.'
      }
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'The full capture toolkit.',
    price: 'Pricing coming soon',
    includes: 'Everything in Plus, and',
    highlighted: true,
    badge: 'Most complete',
    features: [
      {
        icon: 'video',
        label: 'Higher FPS',
        detail: 'Smoother capture for fast games.'
      },
      {
        icon: 'monitor',
        label: '1440p / 4K recording',
        detail: 'Record at the resolution your display deserves.'
      },
      {
        icon: 'bolt',
        label: 'Faster local processing',
        detail: 'Clips and exports finish sooner, all on your PC.'
      },
      {
        icon: 'external',
        label: 'Better streaming features',
        detail: 'Go further than recording, straight from Replay.gg.'
      }
    ]
  }
]
