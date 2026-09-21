import { BrowserWindow, screen, type Display } from 'electron'
import type { ClipNotificationSettings, MediaItem } from '@shared/types'
import { MARK_ARROWS_PATH, MARK_R_PATH, MARK_VIEWBOX } from '@shared/logoMark'
import { getSettings } from './settings'

/**
 * The small "Clip Captured" overlay.
 *
 * A separate, frameless, click-through window that shows for a few seconds in a corner of one or
 * every monitor and then closes itself. It never takes focus and ignores the mouse, so it cannot
 * steal a keypress from a game or get in the way of a click. It is OPTIONAL (Settings > General >
 * Clip Capture Notification); the in-app toast is separate and unchanged.
 *
 * It appears over windowed and borderless games. A game in true exclusive fullscreen owns the
 * screen and no ordinary window can draw above it; that is a Windows limit, not a setting.
 */

const CARD_W = 300
const CARD_H = 72
/** Room around the card inside its window, for the drop shadow and the slide-in travel. */
const PAD = 16
const WIN_W = CARD_W + PAD * 2
const WIN_H = CARD_H + PAD * 2
/** Gap between the card and the screen edge. */
const MARGIN = 20
const ANIM_MS = 260

const open = new Set<BrowserWindow>()

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "00:30 • 1080p • 60 FPS", leaving out anything the file didn't report. */
function detailLine(item: Pick<MediaItem, 'duration' | 'height' | 'fps'>): string {
  const total = Math.max(0, Math.round(item.duration))
  const parts = [`${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`]
  if (item.height > 0) parts.push(`${item.height}p`)
  if (item.fps > 0) parts.push(`${Math.round(item.fps)} FPS`)
  return parts.join(' • ')
}

/** Which way the card travels in from, so it slides in from the nearest screen edge. */
function slideFrom(position: ClipNotificationSettings['position']): 'left' | 'right' {
  return position === 'top-left' || position === 'bottom-left' ? 'left' : 'right'
}

function page(line: string, cfg: ClipNotificationSettings): string {
  const slides = cfg.animation === 'slide' || cfg.animation === 'fade-slide'
  const fades = cfg.animation === 'fade' || cfg.animation === 'fade-slide'
  const dir = slideFrom(cfg.position) === 'left' ? -1 : 1
  const from = `${slides ? dir * 28 : 0}px`
  const ms = cfg.animation === 'none' ? 0 : ANIM_MS
  const visibleMs = Math.max(1, cfg.duration) * 1000
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif;-webkit-user-select:none;user-select:none}
.card{position:absolute;left:${PAD}px;top:${PAD}px;width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:0 18px;
 border-radius:14px;background:rgba(24,24,27,.94);border:1px solid rgba(230,41,63,.55);box-shadow:0 10px 30px rgba(0,0,0,.55);color:#f5f5f5;
 opacity:${fades ? 0 : 1};transform:translateX(${from});animation:in ${ms}ms cubic-bezier(.16,1,.3,1) forwards}
.card.out{animation:out ${ms}ms ease-in forwards}
@keyframes in{to{opacity:1;transform:translateX(0)}}
@keyframes out{from{opacity:1;transform:translateX(0)}to{opacity:${fades ? 0 : 1};transform:translateX(${from})}}
.mark{flex:none;width:36px;height:36px}
.t{font-size:15px;font-weight:650;letter-spacing:-.01em;color:#fff}
.s{margin-top:2px;font-size:12.5px;color:#a1a1aa;font-variant-numeric:tabular-nums}
</style></head><body>
<div class="card" id="c">
 <svg class="mark" viewBox="${MARK_VIEWBOX}"><path fill="#FFFFFF" d="${MARK_R_PATH}"/><path fill="#E6293F" d="${MARK_ARROWS_PATH}"/></svg>
 <div><div class="t">Clip Captured</div><div class="s">${line}</div></div>
</div>
<script>setTimeout(function(){document.getElementById('c').classList.add('out')},${visibleMs});</script>
</body></html>`
}

/** Where the window's top-left goes on a display, for the chosen position (DIP coordinates). */
function place(display: Display, cfg: ClipNotificationSettings): { x: number; y: number } {
  const wa = display.workArea
  const left = wa.x + MARGIN
  const right = wa.x + wa.width - MARGIN - CARD_W
  const top = wa.y + MARGIN
  const bottom = wa.y + wa.height - MARGIN - CARD_H

  let cardX: number
  let cardY: number
  switch (cfg.position) {
    case 'top-left':
      ;[cardX, cardY] = [left, top]
      break
    case 'top-right':
      ;[cardX, cardY] = [right, top]
      break
    case 'bottom-left':
      ;[cardX, cardY] = [left, bottom]
      break
    case 'bottom-right':
      ;[cardX, cardY] = [right, bottom]
      break
    default: {
      // Custom: a percentage of the free space, so it lands sensibly on any monitor size.
      const fx = Math.min(100, Math.max(0, cfg.customX)) / 100
      const fy = Math.min(100, Math.max(0, cfg.customY)) / 100
      cardX = Math.round(left + (right - left) * fx)
      cardY = Math.round(top + (bottom - top) * fy)
    }
  }
  return { x: cardX - PAD, y: cardY - PAD }
}

function targetDisplays(cfg: ClipNotificationSettings): Display[] {
  const all = screen.getAllDisplays()
  if (cfg.display === 'all') return all
  const one = all.find((d) => String(d.id) === cfg.display)
  return [one ?? screen.getPrimaryDisplay()]
}

function closeAll(): void {
  for (const win of open) if (!win.isDestroyed()) win.destroy()
  open.clear()
}

function show(line: string, cfg: ClipNotificationSettings): void {
  closeAll()
  const html = page(line, cfg)
  const totalMs = Math.max(1, cfg.duration) * 1000 + (cfg.animation === 'none' ? 0 : ANIM_MS + 100)

  for (const display of targetDisplays(cfg)) {
    const { x, y } = place(display, cfg)
    const win = new BrowserWindow({
      x,
      y,
      width: WIN_W,
      height: WIN_H,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false, // never takes the keyboard from a game
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    win.setIgnoreMouseEvents(true) // clicks pass straight through to whatever is underneath
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setBounds({ x, y, width: WIN_W, height: WIN_H }) // honour exact DIP placement on scaled displays
    open.add(win)
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.showInactive()
    })
    win.on('closed', () => open.delete(win))
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    setTimeout(() => {
      if (!win.isDestroyed()) win.destroy()
    }, totalMs)
  }
}

/** Called when a clip has been saved. Does nothing if the person turned this off. */
export function notifyClipSaved(item: MediaItem | null): void {
  const cfg = getSettings().notifications.clipCapture
  if (!item || !cfg.enabled) return
  show(detailLine(item), cfg)
}

/** Settings > "Preview": show the popup now, with sample numbers, using the current choices. */
export function previewClipNotification(): void {
  show(detailLine({ duration: 30, height: 1080, fps: 60 }), getSettings().notifications.clipCapture)
}
