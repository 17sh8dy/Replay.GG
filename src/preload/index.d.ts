import type { ReplayApi } from './index'

declare global {
  interface Window {
    replay: ReplayApi
  }
}

export {}
