import { useEffect, useRef, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './ui.css'

/** Small shared primitives. Anything used by 2+ screens belongs here. */

// --- Button ----------------------------------------------------------------
interface ButtonProps {
  children?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: IconName
  disabled?: boolean
  title?: string
  fullWidth?: boolean
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  icon,
  disabled,
  title,
  fullWidth
}: ButtonProps): JSX.Element {
  return (
    <button
      className={`btn btn--${variant} btn--${size}${fullWidth ? ' btn--full' : ''}${
        children ? '' : ' btn--icon-only'
      }`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

// --- Modal -----------------------------------------------------------------
interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ open, onClose, title, children, footer, width = 460 }: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            <Icon name="close" size={17} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}

// --- Confirm ---------------------------------------------------------------
interface ConfirmProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onCancel
}: ConfirmProps): JSX.Element {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      width={400}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  )
}

// --- Text field ------------------------------------------------------------
interface FieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  onEnter?: () => void
}

export function TextField({ value, onChange, placeholder, autoFocus, onEnter }: FieldProps): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [autoFocus])

  return (
    <input
      ref={ref}
      className="text-field"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) onEnter()
      }}
    />
  )
}

// --- Search box ------------------------------------------------------------
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}): JSX.Element {
  return (
    <div className="search-box">
      <Icon name="search" size={16} />
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

// --- Select ----------------------------------------------------------------
interface SelectProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; disabled?: boolean }[]
}

export function Select<T extends string>({ value, onChange, options }: SelectProps<T>): JSX.Element {
  return (
    <div className="select">
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={15} />
    </div>
  )
}

// --- Toggle ----------------------------------------------------------------
export function Toggle({
  checked,
  onChange
}: {
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      className={`switch switch--lg${checked ? ' switch--on' : ''}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="switch__knob" />
    </button>
  )
}

// --- Slider ----------------------------------------------------------------
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}): JSX.Element {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="slider">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
      />
      <span className="slider__value mono">{format ? format(value) : value}</span>
    </div>
  )
}

// --- Empty state -----------------------------------------------------------
export function EmptyState({
  icon,
  title,
  message,
  action
}: {
  icon: IconName
  title: string
  message: string
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={30} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p className="muted">{message}</p>
      {action}
    </div>
  )
}
