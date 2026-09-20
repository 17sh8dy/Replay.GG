import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LibraryQuery, MediaItem, MediaKind } from '@shared/types'
import { MediaCard, MediaCardSkeleton } from './MediaCard'
import { PlayerModal } from './PlayerModal'
import { Confirm, EmptyState, Modal, Button, SearchBox, Select, TextField } from './ui'
import { Icon, type IconName } from './Icon'
import { useApp } from '../state/AppContext'
import './MediaBrowser.css'

type SortKey = NonNullable<LibraryQuery['sort']>

interface MediaBrowserProps {
  title: string
  /** Omit to show recordings and clips together. */
  kind?: MediaKind
  emptyIcon: IconName
  emptyTitle: string
  emptyMessage: string
}

/**
 * The list experience behind Recordings, Clips and Library. Each screen is a
 * thin configuration of this component, so search, sorting, favouriting,
 * renaming and playback behave identically everywhere.
 */
export function MediaBrowser({
  title,
  kind,
  emptyIcon,
  emptyTitle,
  emptyMessage
}: MediaBrowserProps): JSX.Element {
  const { libraryVersion, pushToast } = useApp()

  const [items, setItems] = useState<MediaItem[]>([])
  const [games, setGames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [game, setGame] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  const [playing, setPlaying] = useState<MediaItem | null>(null)
  const [renaming, setRenaming] = useState<MediaItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<MediaItem | null>(null)

  // Select mode: tick individual items, then delete them together.
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulk, setBulk] = useState<'selected' | 'all' | null>(null)

  const query = useMemo<LibraryQuery>(
    () => ({ kind, search, sort, favoritesOnly, game: game || undefined }),
    [kind, search, sort, favoritesOnly, game]
  )

  const load = useCallback(async () => {
    const [list, gameList] = await Promise.all([
      window.replay.library.list(query),
      window.replay.library.games()
    ])
    setItems(list)
    setGames(gameList)
    setLoading(false)
  }, [query])

  useEffect(() => {
    void load()
  }, [load, libraryVersion])

  const toggleFavorite = async (item: MediaItem): Promise<void> => {
    // Update locally first — a star should feel instant, and the library event
    // will reconcile us either way.
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, favorite: !i.favorite } : i))
    )
    await window.replay.library.setFavorite(item.id, !item.favorite)
  }

  const confirmRename = async (): Promise<void> => {
    if (!renaming) return
    const trimmed = renameValue.trim()
    if (!trimmed) {
      pushToast('error', 'Name cannot be empty')
      return
    }
    await window.replay.library.rename(renaming.id, trimmed)
    setRenaming(null)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return
    const ok = await window.replay.library.remove(deleting.id)
    if (ok) pushToast('success', 'Moved to Recycle Bin')
    setDeleting(null)
  }

  const exitSelecting = (): void => {
    setSelecting(false)
    setSelectedIds(new Set())
  }

  const toggleSelect = (item: MediaItem): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })

  // Escape leaves select mode, matching how the rest of the app dismisses things.
  useEffect(() => {
    if (!selecting) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !bulk) exitSelecting()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting, bulk])

  // Only ever act on what is still on screen (a filter change can hide a ticked item).
  const targets =
    bulk === 'selected' ? items.filter((i) => selectedIds.has(i.id)) : bulk === 'all' ? items : []

  const confirmBulkDelete = async (): Promise<void> => {
    const ids = targets.map((i) => i.id)
    setBulk(null)
    if (ids.length === 0) return
    const { removed, failed } = await window.replay.library.removeMany(ids)
    if (removed > 0) pushToast('success', `Moved ${removed} to Recycle Bin`)
    if (failed > 0) pushToast('error', `${failed} could not be deleted — they may be in use`)
    exitSelecting()
  }

  const rescan = async (): Promise<void> => {
    setLoading(true)
    await window.replay.library.rescan()
    pushToast('info', 'Library refreshed')
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            {loading ? 'Loading…' : `${items.length} item${items.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="screen__tools">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by name or game…" />

          {games.length > 0 && (
            <Select
              value={game}
              onChange={setGame}
              options={[
                { value: '', label: 'All games' },
                ...games.map((g) => ({ value: g, label: g }))
              ]}
            />
          )}

          <Select
            value={sort}
            onChange={setSort}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'longest', label: 'Longest' },
              { value: 'largest', label: 'Largest' },
              { value: 'name', label: 'Name (A–Z)' }
            ]}
          />

          <button
            className={`chip${favoritesOnly ? ' chip--on' : ''}`}
            onClick={() => setFavoritesOnly((v) => !v)}
            title="Show favorites only"
          >
            <Icon name="star" size={15} />
            Favorites
          </button>

          <Button icon="refresh" onClick={() => void rescan()} title="Rescan folders" />

          <Button
            variant={selecting ? 'primary' : 'secondary'}
            icon="check"
            onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
            disabled={items.length === 0}
            title="Select items to delete"
          >
            {selecting ? 'Done' : 'Select'}
          </Button>

          <Button
            variant="danger"
            icon="trash"
            onClick={() => setBulk('all')}
            disabled={items.length === 0}
            title="Move everything shown to the Recycle Bin"
          >
            Delete all
          </Button>
        </div>
      </header>

      {selecting && (
        <div className="selectbar">
          <span>
            <strong>{selectedIds.size}</strong> selected
          </span>
          <Button
            size="sm"
            onClick={() =>
              setSelectedIds(
                selectedIds.size === items.length ? new Set() : new Set(items.map((i) => i.id))
              )
            }
          >
            {selectedIds.size === items.length ? 'Clear' : 'Select all'}
          </Button>
          <Button
            size="sm"
            variant="danger"
            icon="trash"
            disabled={selectedIds.size === 0}
            onClick={() => setBulk('selected')}
          >
            Delete selected
          </Button>
        </div>
      )}

      <div className="screen__body">
        {loading ? (
          <div className="media-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <MediaCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={emptyIcon}
            title={search || favoritesOnly || game ? 'Nothing matches' : emptyTitle}
            message={
              search || favoritesOnly || game
                ? 'Try clearing your filters or searching for something else.'
                : emptyMessage
            }
            action={
              (search || favoritesOnly || game) && (
                <Button
                  onClick={() => {
                    setSearch('')
                    setFavoritesOnly(false)
                    setGame('')
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <div className="media-grid">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onOpen={setPlaying}
                onToggleFavorite={(i) => void toggleFavorite(i)}
                onRename={(i) => {
                  setRenaming(i)
                  setRenameValue(i.title)
                }}
                onDelete={setDeleting}
                selecting={selecting}
                selected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {playing && <PlayerModal item={playing} onClose={() => setPlaying(null)} />}

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void confirmRename()}>
              Save
            </Button>
          </>
        }
      >
        <TextField
          value={renameValue}
          onChange={setRenameValue}
          autoFocus
          onEnter={() => void confirmRename()}
        />
        <p className="dim rename-hint">The file on disk is renamed to match.</p>
      </Modal>

      <Confirm
        open={bulk !== null}
        title={bulk === 'all' ? 'Delete everything shown?' : 'Delete selected items?'}
        message={`${targets.length} item${targets.length === 1 ? '' : 's'} will be moved to the Recycle Bin. You can restore them from there.`}
        confirmLabel={`Delete ${targets.length}`}
        destructive
        onConfirm={() => void confirmBulkDelete()}
        onCancel={() => setBulk(null)}
      />

      <Confirm
        open={deleting !== null}
        title="Delete this item?"
        message={`“${deleting?.title ?? ''}” will be moved to the Recycle Bin.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
