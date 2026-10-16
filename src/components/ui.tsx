import { LoaderCircle, X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { STATUS_LABELS, type Status } from '../lib/types'

// ---------------------------------------------------------------------------
// Fenêtre modale : <dialog> natif (focus piégé, Échap, fond inerte).
// Feuille ancrée en bas sur mobile, carte centrée sur ordinateur.
// ---------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      document.documentElement.style.overflow = 'hidden'
    } else if (!open && d.open) d.close()
    return () => {
      document.documentElement.style.overflow = ''
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // pas d'onClose natif : il se déclenche aussi lors d'une fermeture programmatique
      // (ex. passage de la fiche au formulaire), ce qui refermerait la vue suivante
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose() // clic sur le fond
      }}
      className={`m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-transparent p-0 text-ink backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px] open:animate-sheet-up md:m-auto md:rounded-3xl ${size === 'sm' ? 'md:max-w-md' : 'md:max-w-xl'}`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col bg-white">
          <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3 md:px-6">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="Fermer">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 pb-5 md:px-6">{children}</div>
          {footer && (
            <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:pb-4">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-[15px] leading-relaxed text-muted">{message}</div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<Status, string> = {
  new: 'bg-slate-100 text-slate-600',
  learning: 'bg-brand-soft text-brand-dark',
  weak: 'bg-amber-50 text-amber-800',
  mastered: 'bg-success-soft text-green-800',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <LoaderCircle className={`animate-spin motion-reduce:animate-none ${className}`} aria-hidden />
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2 overflow-hidden rounded-full bg-brand-soft"
    >
      <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2" />
        <span className="absolute top-1 left-1 size-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex animate-fade-up flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children && <div className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

/** Accord simple du pluriel : plural(3, 'mot') → « 3 mots ». */
export function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? pluralForm : singular}`
}
