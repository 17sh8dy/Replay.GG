/**
 * Nova Account — Replay.gg's optional identity, run entirely in the main process.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * REPLAY.GG WORKS WITHOUT AN ACCOUNT AND ALWAYS WILL.
 *
 * Recording, the replay buffer, clipping, the library — none of it consults this file, and
 * none of it ever may. Your recordings are files on your disk and nothing here uploads them,
 * looks at them, or knows they exist. What an account adds is one thing today: support
 * tickets filed against Nova.Help can be tied to you, so you can follow them without a ticket
 * ID. That is the whole of it, and it is worth stating plainly because an account button in a
 * screen-recorder is exactly the kind of thing people are right to be suspicious of.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS IN MAIN AND NOT IN THE RENDERER.
 *
 * Two reasons, and the first one is not negotiable:
 *
 * 1. THE RENDERER'S CSP IS `default-src 'self'`. `connect-src` inherits from it, so the
 *    renderer cannot reach nova.help at all — and the fix for that is NOT to loosen the
 *    policy. That CSP, and the preload comment above it ("Nothing else is exposed — no
 *    ipcRenderer, no Node primitives"), are the app's security posture. Punching a hole in it
 *    so a settings pane can hold a bearer token is the wrong trade in either direction.
 *
 * 2. SO THE TOKEN NEVER ENTERS THE RENDERER. It lives in a 0600 file under userData and is
 *    used here. The renderer learns a display name and whether somebody is signed in, which
 *    is all a settings pane needs to render, and is the same "only what it needs" rule Nova
 *    Accounts applies to products.
 *
 * The client itself is `@nova/account-client`, shared with Open Cut, Online Earth and Atlas.
 */
import { app, shell } from 'electron'
import { hostname } from 'node:os'
import { createNovaAccountClient } from '@nova/account-client'
import { fileStorage } from '@nova/account-client/storage/node'
import type { AccountState } from '@shared/types'

/** Overridable for a local Nova.Help; the only place the address appears. */
const ORIGIN = process.env.NOVA_ACCOUNTS_ORIGIN ?? 'https://nova-help.17sh8dy.workers.dev'

/** The Nova site. Viewing is fine anywhere; editing an account happens only at NOVA_ACCOUNT_URL. */
export const NOVA_URL = 'https://nova-780.pages.dev'
export const NOVA_ACCOUNT_URL = `${NOVA_URL}/account`

/** Replay.gg's section of the support portal. Real today. */
export const NOVA_HELP_URL = `${ORIGIN}/help/replay-gg`

/**
 * `support` only.
 *
 * Replay.gg is registered for exactly that scope and asks for exactly that scope, so this app
 * cannot read an email address or a sync document even if a later change here asked for one —
 * Nova Accounts intersects the request with the registry. Asking for less than you are allowed
 * is free; asking for more is refused. Ask for less.
 */
const client = createNovaAccountClient({
  product: 'replay-gg',
  scopes: ['support'],
  origin: ORIGIN,
  storage: fileStorage(app.getPath('userData'))
})

let pending: AccountState['pending'] = null
let problem: string | null = null
/** The in-flight flow, so `cancel` can stop it. Never leaves this module. */
let flow: { cancel(): void } | null = null

const state = (): AccountState => ({
  signedIn: client.isSignedIn(),
  displayName: client.account()?.displayName ?? null,
  pending,
  problem
})

/**
 * Ask the server whether the stored token still works. Called once at startup.
 *
 * A network failure is NOT a sign-out — the client keeps the token — so an app launched on a
 * train stays signed in. Nothing here should ever "helpfully" clear it.
 */
export async function refreshAccount(): Promise<AccountState> {
  if (client.isSignedIn()) await client.refresh()
  return state()
}

export function getAccountState(): AccountState {
  return state()
}

/**
 * Start a sign-in and return immediately with the code to show.
 *
 * The polling continues in the background and updates `pending`; the renderer asks again when
 * it wants to know. That is deliberately simpler than pushing an event per poll: the settings
 * pane is a screen somebody is looking at, and it can ask.
 */
export async function beginSignIn(): Promise<AccountState> {
  problem = null
  // One flow at a time. A second click used to mint a NEW code, so the code on screen and the
  // one typed into the browser could disagree — "that code did not work".
  if (flow && pending) return state()
  const started = await client.beginSignIn({ deviceName: `Replay.gg on ${safeHostname()}` })

  if (!started.ok) {
    problem =
      started.reason === 'unavailable'
        ? 'Could not reach Nova Accounts. Check your connection and try again.'
        : 'Nova Accounts refused this app. Please report it.'
    return state()
  }

  flow = started
  pending = {
    userCode: started.userCode,
    verificationUri: started.verificationUri,
    verificationUriComplete: started.verificationUriComplete
  }
  // A convenience, never the mechanism: the code is on screen and works without this.
  void shell.openExternal(started.verificationUriComplete)

  void started.wait().then((result) => {
    flow = null
    pending = null
    if (result.ok) return
    problem =
      result.reason === 'denied'
        ? 'The request was refused in the browser.'
        : result.reason === 'cancelled'
          ? null
          : 'That code expired before it was approved.'
  })

  return state()
}

/** Re-open the approval page for the sign-in in flight, code already filled in. */
export function reopenSignIn(): void {
  if (pending) void shell.openExternal(pending.verificationUriComplete)
}

/** Stop waiting. Nothing was stored, so there is nothing to undo. */
export function cancelSignIn(): AccountState {
  flow?.cancel()
  flow = null
  pending = null
  return state()
}

/** Sign out. The server is told first; the local token goes either way. */
export async function signOutAccount(): Promise<AccountState> {
  await client.signOut()
  pending = null
  problem = null
  return state()
}

/** Open one of the fixed Nova sites in the browser. A whitelist, never a renderer-supplied URL. */
export function openSite(target: 'help' | 'nova' | 'account'): void {
  const url = { help: `${ORIGIN}/`, nova: NOVA_URL, account: NOVA_ACCOUNT_URL }[target]
  if (url) void shell.openExternal(url)
}

/** Open Replay.gg's help on Nova.Help in the user's browser. */
export function openHelp(): void {
  void shell.openExternal(NOVA_HELP_URL)
}

/**
 * A name for this machine, so "signed in on" means something on the account page.
 *
 * Guarded because `hostname()` can throw on a locked-down host, and a sign-in must not fail
 * over a label. It is shown to its owner and to nobody else.
 */
function safeHostname(): string {
  try {
    return hostname() || 'this PC'
  } catch {
    return 'this PC'
  }
}
