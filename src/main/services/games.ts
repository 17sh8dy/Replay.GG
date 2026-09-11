import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/**
 * Game detection.
 *
 * v1 identifies the foreground window's process and maps it through a small
 * known-titles table, falling back to a prettified executable name. This is
 * deliberately a thin seam: swapping in a proper hook-based detector (or a
 * remote title database) later means replacing `detectActiveGame` only.
 */

const KNOWN_TITLES: Record<string, string> = {
  'cs2': 'Counter-Strike 2',
  'valorant-win64-shipping': 'VALORANT',
  'league of legends': 'League of Legends',
  'gta5': 'Grand Theft Auto V',
  'gta5_enhanced': 'Grand Theft Auto V',
  'rocketleague': 'Rocket League',
  'fortniteclient-win64-shipping': 'Fortnite',
  'overwatch': 'Overwatch 2',
  'apex_legends': 'Apex Legends',
  'r5apex': 'Apex Legends',
  'destiny2': 'Destiny 2',
  'eldenring': 'Elden Ring',
  'cyberpunk2077': 'Cyberpunk 2077',
  'starfield': 'Starfield',
  'baldursgate3': "Baldur's Gate 3",
  'minecraft': 'Minecraft',
  'javaw': 'Minecraft',
  'dota2': 'Dota 2',
  'rainbowsix': 'Rainbow Six Siege',
  'palworld-win64-shipping': 'Palworld',
  'helldivers2': 'Helldivers 2',
  'deadlock': 'Deadlock'
}

/** Processes that are never a game, so we report "unknown" instead. */
const IGNORED = new Set([
  'explorer',
  'chrome',
  'msedge',
  'firefox',
  'code',
  'discord',
  'electron',
  'replay.gg',
  'replaygg',
  'devenv',
  'steam',
  'steamwebhelper',
  'windowsterminal',
  'powershell'
])

/**
 * Returns the foreground window's process name, or null.
 * Windows-only; uses a short-lived PowerShell call rather than a native
 * addon so v1 stays dependency-free.
 */
async function foregroundProcess(): Promise<string | null> {
  if (process.platform !== 'win32') return null

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
}
"@
$pidOut = 0
$h = [FG]::GetForegroundWindow()
[void][FG]::GetWindowThreadProcessId($h, [ref]$pidOut)
if ($pidOut -gt 0) {
  $p = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
  if ($p) { $p.ProcessName }
}
`.trim()

  try {
    const { stdout } = await exec(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 5000 }
    )
    const name = stdout.trim()
    return name.length > 0 ? name : null
  } catch {
    return null
  }
}

function prettify(processName: string): string {
  return processName
    .replace(/[-_]/g, ' ')
    .replace(/\b(win64|shipping|client|launcher|x64|exe)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Best-effort name of the game currently in focus, or null. */
export async function detectActiveGame(): Promise<string | null> {
  const proc = await foregroundProcess()
  if (!proc) return null

  const key = proc.toLowerCase()
  if (IGNORED.has(key)) return null
  if (KNOWN_TITLES[key]) return KNOWN_TITLES[key]

  const pretty = prettify(proc)
  return pretty.length > 1 ? pretty : null
}
