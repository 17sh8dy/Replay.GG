import type { MediaItem } from '@shared/types'
import { Icon } from './Icon'
import { formatBytes, formatDate, formatDuration } from '../lib/format'
import './MediaCard.css'

interface MediaCardProps {
  item: MediaItem
  onOpen: (item: MediaItem) => void
  onToggleFavorite: (item: MediaItem) => void
  onDelete: (item: MediaItem) => void
  onRename: (item: MediaItem) => void
  /** Select mode: the whole card toggles selection instead of playing. */
  selecting?: boolean
  selected?: boolean
  onToggleSelect?: (item: MediaItem) => void
}

export function MediaCard({
  item,
  onOpen,
  onToggleFavorite,
  onDelete,
  onRename,
  selecting = false,
  selected = false,
  onToggleSelect
}: MediaCardProps): JSX.Element {
  const thumb = item.thumbnailPath ? window.replay.mediaUrl(item.thumbnailPath) : null

  return (
    <article
      className={`card${selecting ? ' card--selecting' : ''}${selected ? ' card--selected' : ''}`}
      onDoubleClick={() => !selecting && onOpen(item)}
    >
      <button
        className="card__thumb"
        onClick={() => (selecting ? onToggleSelect?.(item) : onOpen(item))}
        aria-label={selecting ? `Select ${item.title}` : `Play ${item.title}`}
      >
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" draggable={false} />
        ) : (
          <div className="card__thumb-fallback">
            <Icon name="film" size={26} strokeWidth={1.4} />
          </div>
        )}

        <span className="card__play">
          <Icon name="play" size={20} />
        </span>

        <span className="card__duration mono">{formatDuration(item.duration)}</span>

        {item.kind === 'clip' && <span className="card__badge">CLIP</span>}
      </button>

      {/* The glass tick-box only exists in select mode, so the grid stays clean otherwise. */}
      {selecting && (
        <button
          className={`card__select${selected ? ' card__select--on' : ''}`}
          onClick={() => onToggleSelect?.(item)}
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${item.title}`}
        >
          {selected && <Icon name="check" size={15} strokeWidth={2.6} />}
        </button>
      )}

      <div className="card__body">
        <div className="card__title-row">
          <h3 className="card__title" title={item.title}>
            {item.title}
          </h3>
          <button
            className={`card__fav${item.favorite ? ' card__fav--on' : ''}`}
            onClick={() => onToggleFavorite(item)}
            aria-label={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Icon name="star" size={15} />
          </button>
        </div>

        <div className="card__meta">
          {item.game && (
            <>
              <span className="card__game">{item.game}</span>
              <span className="card__sep">·</span>
            </>
          )}
          <span>{formatDate(item.createdAt)}</span>
          <span className="card__sep">·</span>
          <span>{formatBytes(item.size)}</span>
        </div>
      </div>

      {/* Actions stay hidden until hover so the grid reads as thumbnails first. */}
      <div className="card__actions">
        <button onClick={() => onRename(item)} aria-label="Rename" title="Rename">
          <Icon name="pencil" size={15} />
        </button>
        <button
          onClick={() => void window.replay.library.reveal(item.id)}
          aria-label="Show in folder"
          title="Show in folder"
        >
          <Icon name="folder" size={15} />
        </button>
        <button
          className="card__action--danger"
          onClick={() => onDelete(item)}
          aria-label="Delete"
          title="Delete"
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </article>
  )
}

/** Placeholder shown while the first library fetch resolves. */
export function MediaCardSkeleton(): JSX.Element {
  return (
    <div className="card card--skeleton">
      <div className="skeleton card__thumb" />
      <div className="card__body">
        <div className="skeleton" style={{ height: 13, width: '70%' }} />
        <div className="skeleton" style={{ height: 11, width: '45%', marginTop: 8 }} />
      </div>
    </div>
  )
}
