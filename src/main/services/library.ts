import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import { app, shell } from 'electron'
import type { ClipRequest, LibraryQuery, MediaItem, MediaKind } from '@shared/types'
import { JsonStore } from '../store'
import { generateThumbnail, probeMedia, requireFfmpeg } from './ffmpeg'
import { getSettings } from './settings'
import { broadcast, toast } from './events'

const exec = promisify(execFile)

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.mov', '.webm'])

interface LibraryDoc {
  items: Record<string, MediaItem>
}

let store: JsonStore<LibraryDoc> | null = null

function getStore(): JsonStore<LibraryDoc> {
  if (!store) store = new JsonStore<LibraryDoc>('library.json', { items: {} })
  return store
}

function thumbnailDir(): string {
  const dir = join(app.getPath('userData'), 'thumbnails')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Stable id derived from the path, so rescans reuse existing metadata. */
function idFor(path: string): string {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = (hash << 5) - hash + path.charCodeAt(i)
    hash |= 0
  }
  return `m${Math.abs(hash).toString(36)}`
}

function persist(items: Record<string, MediaItem>): void {
  getStore().set({ items })
}

/**
 * Registers a file in the library, probing it for real metadata and kicking
 * off thumbnail generation. Safe to call on a file already indexed.
 */
export async function addFromFile(
  path: string,
  kind: MediaKind,
  game: string | null = null,
  sourceId?: string
): Promise<MediaItem | null> {
  if (!existsSync(path)) return null

  const doc = getStore().get()
  const id = idFor(path)
  const existing = doc.items[id]

  let size = 0
  let createdAt = Date.now()
  try {
    const stat = statSync(path)
    size = stat.size
    createdAt = stat.birthtimeMs || stat.mtimeMs
  } catch {
    return null
  }

  const probed = await probeMedia(path)

  const item: MediaItem = {
    id,
    kind,
    title: existing?.title ?? basename(path, extname(path)),
    path,
    thumbnailPath: existing?.thumbnailPath ?? null,
    game: game ?? existing?.game ?? null,
    createdAt: existing?.createdAt ?? createdAt,
    duration: probed?.duration ?? existing?.duration ?? 0,
    size,
    width: probed?.width ?? existing?.width ?? 0,
    height: probed?.height ?? existing?.height ?? 0,
    fps: probed?.fps ?? existing?.fps ?? 0,
    favorite: existing?.favorite ?? false,
    sourceId: sourceId ?? existing?.sourceId
  }

  doc.items[id] = item
  persist(doc.items)
  broadcast('library:changed', { kind })

  // Thumbnails are slow enough to be worth doing off the critical path.
  if (!item.thumbnailPath) {
    void createThumbnail(item)
  }

  return item
}

async function createThumbnail(item: MediaItem): Promise<void> {
  const dest = join(thumbnailDir(), `${item.id}.jpg`)
  // Sample a frame a little way in — frame 0 of a game capture is often black.
  const at = item.duration > 4 ? Math.min(item.duration * 0.25, 10) : 0
  const ok = await generateThumbnail(item.path, dest, at)
  if (!ok) return

  const doc = getStore().get()
  const current = doc.items[item.id]
  if (!current) return
  current.thumbnailPath = dest
  persist(doc.items)
  broadcast('library:changed', { kind: current.kind })
}

/** Walks the configured folders and reconciles the index with what is on disk. */
export async function rescan(): Promise<MediaItem[]> {
  const settings = getSettings()
  const doc = getStore().get()

  const roots: { dir: string; kind: MediaKind }[] = [
    { dir: settings.storage.recordingsPath, kind: 'recording' },
    { dir: settings.storage.clipsPath, kind: 'clip' }
  ]

  const seen = new Set<string>()

  for (const { dir, kind } of roots) {
    if (!existsSync(dir)) continue
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!VIDEO_EXTS.has(extname(entry).toLowerCase())) continue
      const full = join(dir, entry)
      seen.add(idFor(full))
      if (!doc.items[idFor(full)]) {
        await addFromFile(full, kind)
      }
    }
  }

  // Forget entries whose files were deleted outside the app.
  let removed = false
  for (const [id, item] of Object.entries(doc.items)) {
    if (!seen.has(id) && !existsSync(item.path)) {
      delete doc.items[id]
      removed = true
    }
  }
  if (removed) persist(doc.items)

  broadcast('library:changed', { kind: 'all' })
  return list({})
}

export function list(query: LibraryQuery): MediaItem[] {
  const doc = getStore().get()
  let items = Object.values(doc.items)

  if (query.kind) items = items.filter((i) => i.kind === query.kind)
  if (query.favoritesOnly) items = items.filter((i) => i.favorite)
  if (query.game) items = items.filter((i) => i.game === query.game)

  if (query.search) {
    const needle = query.search.toLowerCase().trim()
    if (needle) {
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(needle) ||
          (i.game?.toLowerCase().includes(needle) ?? false)
      )
    }
  }

  const sort = query.sort ?? 'newest'
  items.sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.createdAt - b.createdAt
      case 'largest':
        return b.size - a.size
      case 'longest':
        return b.duration - a.duration
      case 'name':
        return a.title.localeCompare(b.title)
      default:
        return b.createdAt - a.createdAt
    }
  })

  return items
}

export function get(id: string): MediaItem | null {
  return getStore().get().items[id] ?? null
}

export function listGames(): string[] {
  const games = new Set<string>()
  for (const item of Object.values(getStore().get().items)) {
    if (item.game) games.add(item.game)
  }
  return [...games].sort()
}

/**
 * Renames the library title and the underlying file to match, so the folder
 * stays browsable outside the app.
 */
export function rename(id: string, title: string): MediaItem | null {
  const doc = getStore().get()
  const item = doc.items[id]
  if (!item) return null

  const clean = title.replace(/[<>:"/\\|?*]/g, '').trim()
  if (!clean) return item

  item.title = clean

  const ext = extname(item.path)
  const target = join(item.path.slice(0, item.path.length - basename(item.path).length), `${clean}${ext}`)

  if (target !== item.path && !existsSync(target)) {
    try {
      renameSync(item.path, target)
      // The id is path-derived, so a rename has to re-key the entry.
      delete doc.items[id]
      const newId = idFor(target)
      item.id = newId
      item.path = target
      doc.items[newId] = item
    } catch (err) {
      console.error('[library] rename on disk failed', err)
    }
  }

  persist(doc.items)
  broadcast('library:changed', { kind: item.kind })
  return item
}

export function setFavorite(id: string, favorite: boolean): MediaItem | null {
  const doc = getStore().get()
  const item = doc.items[id]
  if (!item) return null
  item.favorite = favorite
  persist(doc.items)
  broadcast('library:changed', { kind: item.kind })
  return item
}

/** Moves the file to the OS trash so a mis-click stays recoverable. */
export async function remove(id: string): Promise<boolean> {
  const doc = getStore().get()
  const item = doc.items[id]
  if (!item) return false

  try {
    if (existsSync(item.path)) await shell.trashItem(item.path)
  } catch (err) {
    console.error('[library] could not trash file', err)
    toast('error', 'Could not delete the file — it may be in use')
    return false
  }

  if (item.thumbnailPath && existsSync(item.thumbnailPath)) {
    try {
      unlinkSync(item.thumbnailPath)
    } catch {
      /* best effort */
    }
  }

  delete doc.items[id]
  persist(doc.items)
  broadcast('library:changed', { kind: item.kind })
  return true
}

/**
 * Moves many items to the OS trash in one pass: one save and one refresh at the end
 * rather than one per file. Files that cannot be trashed (in use) are left in place.
 */
export async function removeMany(ids: string[]): Promise<{ removed: number; failed: number }> {
  const doc = getStore().get()
  let removed = 0
  let failed = 0

  for (const id of ids) {
    const item = doc.items[id]
    if (!item) continue
    try {
      if (existsSync(item.path)) await shell.trashItem(item.path)
    } catch (err) {
      console.error('[library] could not trash file', err)
      failed++
      continue
    }
    if (item.thumbnailPath && existsSync(item.thumbnailPath)) {
      try {
        unlinkSync(item.thumbnailPath)
      } catch {
        /* best effort */
      }
    }
    delete doc.items[id]
    removed++
  }

  if (removed > 0) {
    persist(doc.items)
    broadcast('library:changed', { kind: 'all' })
  }
  return { removed, failed }
}

export function reveal(id: string): void {
  const item = get(id)
  if (item && existsSync(item.path)) shell.showItemInFolder(item.path)
}

/** Cuts a clip out of an existing recording without re-encoding. */
export async function createClip(request: ClipRequest): Promise<MediaItem | null> {
  const source = get(request.sourceId)
  if (!source) {
    toast('error', 'Source recording not found')
    return null
  }
  if (!existsSync(source.path)) {
    toast('error', 'Source file is missing from disk')
    return null
  }

  const settings = getSettings()
  mkdirSync(settings.storage.clipsPath, { recursive: true })

  const title = (request.title ?? `${source.title} clip`).replace(/[<>:"/\\|?*]/g, '').trim()
  let output = join(settings.storage.clipsPath, `${title}.mp4`)
  let n = 2
  while (existsSync(output)) {
    output = join(settings.storage.clipsPath, `${title} (${n++}).mp4`)
  }

  try {
    const bin = await requireFfmpeg()
    await exec(
      bin,
      [
        '-hide_banner', '-loglevel', 'error',
        '-y',
        // -ss before -i seeks by keyframe: fast, and accurate enough for
        // stream-copy. An exact frame cut would require a re-encode.
        '-ss', String(request.start),
        '-i', source.path,
        '-t', String(request.duration),
        '-c', 'copy',
        '-movflags', '+faststart',
        output
      ],
      { windowsHide: true, timeout: 120_000 }
    )

    const item = await addFromFile(output, 'clip', source.game, source.id)
    if (item) toast('success', 'Clip created')
    return item
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[library] clip failed', err)
    toast('error', `Could not create clip: ${message}`)
    return null
  }
}

/** Bytes used per kind, for the storage widget. */
export function usageByKind(): { recordings: number; clips: number } {
  let recordings = 0
  let clips = 0
  for (const item of Object.values(getStore().get().items)) {
    if (item.kind === 'clip') clips += item.size
    else recordings += item.size
  }
  return { recordings, clips }
}
