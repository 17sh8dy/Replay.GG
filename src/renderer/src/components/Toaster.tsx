import { Icon } from './Icon'
import { useApp } from '../state/AppContext'
import './Toaster.css'

export function Toaster(): JSX.Element {
  const { toasts, dismissToast } = useApp()

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast toast--${toast.level}`}
          onClick={() => dismissToast(toast.id)}
        >
          <span className="toast__icon">
            <Icon
              name={toast.level === 'error' ? 'close' : toast.level === 'success' ? 'check' : 'bolt'}
              size={14}
            />
          </span>
          <span className="toast__message">{toast.message}</span>
        </button>
      ))}
    </div>
  )
}
