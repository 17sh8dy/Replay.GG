import { execFile, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { shell } from 'electron'
import { toast } from './events'

const exec = promisify(execFile)

/**
 * The Nova product switcher's launcher.
 *
 * A Nova product is one of two very different things, and opening one is a different act:
 *
 *   • a WEBSITE is opened in the person's default browser;
 *   • a DESKTOP APP is launched by a background command — found on this PC through Windows'
 *     own list of installed programs, started detached so it outlives this window, and never
 *     shown a console. If it is not installed, the person is sent to its download page (or told
 *     it is not installed, when it has no page yet) instead of being left with a dead click.
 *
 * The renderer only ever sends a product ID. What that ID means — which program to start, which
 * address to open — lives in this table, so a compromised or buggy renderer cannot ask the main
 * process to run an arbitrary path or open an arbitrary URL.
 *
 * KEEP IN SYNC BY HAND with the products listed in renderer/components/NovaSwitcher.tsx (and
 * the same table in the other Nova apps): ids, and which are apps vs sites.
 */

type Target =
  | { kind: 'site'; label: string; url: string }
  | {
      kind: 'app'
      label: string
      /** Names Windows lists the program under ("Apps & features"), any of which will match. */
      names: string[]
      /** Where to send someone who has not installed it: the app's own download page. */
      getUrl: string
    }

const TARGETS: Record<string, Target> = {
  // Websites: only the ones that are deployed and have a real address today.
  'nova-help': {
    kind: 'site',
    label: 'Nova.Help',
    url: 'https://nova-help.shadylabs.workers.dev/'
  },
  nova: { kind: 'site', label: 'Nova', url: 'https://nova-780.pages.dev/' },
  'atlas-site': {
    kind: 'site',
    label: 'Atlas Website',
    url: 'https://atlas-website.shadylabs.workers.dev/'
  },
  // Nova Cut is listed as "Soon" in the switcher until it is ready. To turn it on, set its kind to
  // 'app' there and add: 'nova-cut': { kind: 'app', label: 'Nova Cut', names: ['Nova Cut', 'NovaCut'], getUrl: 'https://nova-780.pages.dev/' }  (the Nova home page, until it has its own)
  atlas: {
    kind: 'app',
    label: 'Atlas',
    names: ['Atlas'],
    getUrl: 'https://atlas-website.shadylabs.workers.dev/'
  }
}

export type OpenProductResult = 'launched' | 'focused' | 'running' | 'browser' | 'unknown'

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

interface Installed {
  name: string
  exe: string
}

const UNINSTALL_KEYS = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

/** Pulls the executable out of a DisplayIcon value: `"C:\x\app.exe",0` -> `C:\x\app.exe`. */
function iconExe(value: string | undefined): string | null {
  if (!value) return null
  const cleaned = value.replace(/^"/, '').replace(/"?(,\s*-?\d+)?\s*$/, '').replace(/"$/, '')
  return cleaned.toLowerCase().endsWith('.exe') && existsSync(cleaned) ? cleaned : null
}

/** The first plausible exe in an install folder, preferring one named like the product. */
function exeInFolder(folder: string, names: string[]): string | null {
  const dir = folder.replace(/^"|"$/g, '')
  if (!existsSync(dir)) return null
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.exe'))
  } catch {
    return null
  }
  const wanted = names.map(norm)
  const pick =
    files.find((f) => wanted.includes(norm(basename(f, '.exe')))) ??
    files.find((f) => !/^(unins|uninst|update|setup|crashpad)/i.test(f))
  return pick ? join(dir, pick) : null
}

/** Reads one Uninstall hive and returns the programs whose name matches. */
async function searchHive(key: string, names: string[]): Promise<Installed | null> {
  let out: string
  try {
    const res = await exec('reg', ['query', key, '/s'], {
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024
    })
    out = res.stdout
  } catch {
    return null // the hive does not exist on this machine
  }

  const wanted = names.map(norm)
  // Each program is a block that starts at its own "HKEY_..." line.
  for (const block of out.split(/\r?\n(?=HKEY_)/)) {
    const field = (name: string): string | undefined =>
      new RegExp(`^\\s+${name}\\s+REG_\\w+\\s+(.*)$`, 'mi').exec(block)?.[1]?.trim()
    const displayName = field('DisplayName')
    if (!displayName || !wanted.includes(norm(displayName))) continue

    const exe = iconExe(field('DisplayIcon')) ?? exeInFolder(field('InstallLocation') ?? '', names)
    if (exe) return { name: displayName, exe }
  }
  return null
}

async function findInstalled(names: string[]): Promise<Installed | null> {
  for (const key of UNINSTALL_KEYS) {
    const found = await searchHive(key, names)
    if (found) return found
  }
  return null
}

/**
 * Is this program already running, and if so can its window be brought forward?
 *
 * Some Nova apps are not single-instance, so starting one that is already open would give the
 * person a second copy. 'focused' = it was running and its window is now in front; 'running' =
 * it is running but has no window to raise (typically parked in the system tray); 'none' = not
 * running, so it is safe to start.
 */
async function raiseIfRunning(exe: string): Promise<'focused' | 'running' | 'none'> {
  const script = `
$exe = $env:NOVA_EXE
$procs = @(Get-Process | Where-Object { $_.Path -eq $exe })
if ($procs.Count -eq 0) { 'none'; exit }
Add-Type -Namespace Nova -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);'
$win = $procs | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($win) { [Nova.Win]::ShowWindow($win.MainWindowHandle, 9) | Out-Null; [Nova.Win]::SetForegroundWindow($win.MainWindowHandle) | Out-Null; 'focused' } else { 'running' }
`
  try {
    const res = await exec('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 8000,
      env: { ...process.env, NOVA_EXE: exe }
    })
    const out = res.stdout.trim()
    return out === 'focused' || out === 'running' ? out : 'none'
  } catch {
    return 'none'
  }
}

/** Starts a program detached from this one, with no console, and without waiting on it. */
function launchDetached(exe: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(exe, [], {
      cwd: dirname(exe),
      detached: true,
      stdio: 'ignore',
      windowsHide: false // it is a real app: its own window should appear
    })
    child.once('error', () => resolve(false))
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
}

export async function openProduct(id: string): Promise<OpenProductResult> {
  const target = TARGETS[id]
  if (!target) return 'unknown'

  if (target.kind === 'site') {
    void shell.openExternal(target.url)
    return 'browser'
  }

  const installed = process.platform === 'win32' ? await findInstalled(target.names) : null

  if (installed) {
    const state = await raiseIfRunning(installed.exe)
    if (state === 'focused') return 'focused'
    if (state === 'running') {
      toast('info', `${target.label} is already running — open it from the system tray.`)
      return 'running'
    }
    if (await launchDetached(installed.exe)) {
      toast('info', `Opening ${target.label}…`)
      return 'launched'
    }
  }

  // Not installed: send them to where they can get it.
  toast('info', `${target.label} isn't installed on this PC — opening where to get it.`)
  void shell.openExternal(target.getUrl)
  return 'browser'
}
