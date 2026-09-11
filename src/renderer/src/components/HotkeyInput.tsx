import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { hotkeyParts } from '../lib/format'
import './HotkeyInput.css'

/**
 * Captures a key combination and emits an Electron accelerator string.
 * While recording, keystrokes are swallowed so the user can bind a combo the
 * app itself would otherwise act on.
 */
export function HotkeyInput({
  value,
  onChange
}: {
  value: string
  onChange: (accelerator: string) => void
}): JSX.Element {
  const [capturing, setCapturing] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!capturing) return

    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }

      // Ignore lone modifiers — wait for a real key to complete the combo.
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Super')

      const key = normalizeKey(e)
      if (!key) return

      // A bare letter would hijack typing everywhere, so require a modifier
      // unless it is a function key.
      if (parts.length === 0 && !/^F\d{1,2}$/.test(key)) return

      parts.push(key)
      onChange(parts.join('+'))
      setCapturing(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, onChange])

  const parts = hotkeyParts(value)

  return (
    <div className="hotkey">
      <button
        ref={ref}
        className={`hotkey__field${capturing ? ' hotkey__field--capturing' : ''}`}
        onClick={() => setCapturing((c) => !c)}
      >
        {capturing ? (
          <span className="hotkey__prompt">Press a combination…</span>
        ) : parts.length ? (
          parts.map((part, i) => (
            <span key={`${part}-${i}`} className="hotkey__key">
              {part}
            </span>
          ))
        ) : (
          <span className="hotkey__prompt">Not set</span>
        )}
      </button>

      {value && !capturing && (
        <button className="hotkey__clear" onClick={() => onChange('')} aria-label="Clear hotkey">
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

function normalizeKey(e: KeyboardEvent): string | null {
  const { key, code } = e

  if (/^F\d{1,2}$/.test(key)) return key
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()

  // Digits report as e.g. "Digit4"; Electron wants just "4".
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]

  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Tab: 'Tab'
  }
  return named[key] ?? null
}
