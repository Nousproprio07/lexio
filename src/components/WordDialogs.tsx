import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { DuplicateError } from '../data/repository'
import { textKey } from '../lib/normalize'
import { LIMITS } from '../lib/transfer'
import type { Word } from '../lib/types'
import { useData, type WordDraft } from '../state/data'
import { useToast } from '../state/toast'
import { ConfirmDialog, Modal, Spinner, StatusBadge } from './ui'

/** Catégories proposées tant que l'utilisateur ne les a pas créées. */
const SUGGESTED_CATEGORIES = ['Français', 'Économie', 'Finance', 'Philosophie', 'Culture générale', 'Autre']

type View = { kind: 'form'; word: Word | null } | { kind: 'detail'; wordId: string } | null

interface WordDialogsApi {
  openNew(): void
  openEdit(word: Word): void
  openDetail(word: Word): void
  requestDelete(word: Word): void
}

const Ctx = createContext<WordDialogsApi | null>(null)

export function useWordDialogs() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWordDialogs hors WordDialogsProvider')
  return ctx
}

export function WordDialogsProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>(null)
  const [toDelete, setToDelete] = useState<Word | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { deleteWord } = useData()
  const notify = useToast()

  const api = useMemo<WordDialogsApi>(
    () => ({
      openNew: () => setView({ kind: 'form', word: null }),
      openEdit: (word) => setView({ kind: 'form', word }),
      openDetail: (word) => setView({ kind: 'detail', wordId: word.id }),
      requestDelete: (word) => setToDelete(word),
    }),
    [],
  )

  const close = useCallback(() => setView(null), [])

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteWord(toDelete.id)
      notify(`« ${toDelete.term} » supprimé`)
      if (view?.kind === 'detail' && view.wordId === toDelete.id) setView(null)
      setToDelete(null)
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      <WordFormDialog open={view?.kind === 'form'} word={view?.kind === 'form' ? view.word : null} onClose={close} onEditExisting={api.openEdit} />
      <WordDetailDialog wordId={view?.kind === 'detail' ? view.wordId : null} onClose={close} />
      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer ce mot ?"
        message={
          <>
            <strong className="text-ink">« {toDelete?.term} »</strong> et sa progression seront définitivement supprimés.
          </>
        }
        confirmLabel="Supprimer"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Ctx.Provider>
  )
}

export function errorMessage(e: unknown): string {
  if (e instanceof DuplicateError) return e.message
  if (!navigator.onLine) return 'Vous êtes hors ligne. Réessayez une fois la connexion rétablie.'
  if (e instanceof TypeError) return 'Connexion au serveur impossible. Réessayez dans un instant.'
  return e instanceof Error ? `Une erreur est survenue : ${e.message}` : 'Une erreur est survenue.'
}

// ---------------------------------------------------------------------------
// Formulaire de création / modification
// ---------------------------------------------------------------------------

interface FormState {
  term: string
  definition: string
  category: string
  example: string
}

const emptyForm: FormState = { term: '', definition: '', category: '', example: '' }

function WordFormDialog({
  open,
  word,
  onClose,
  onEditExisting,
}: {
  open: boolean
  word: Word | null
  onClose: () => void
  onEditExisting: (w: Word) => void
}) {
  const { categories, categoryName, saveWord, findDuplicate } = useData()
  const notify = useToast()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const termRef = useRef<HTMLInputElement>(null)

  // (ré)initialisation à chaque ouverture
  useEffect(() => {
    if (!open) return
    setForm(
      word
        ? { term: word.term, definition: word.definition, category: categoryName(word.categoryId) ?? '', example: word.example ?? '' }
        : emptyForm,
    )
    setSubmitted(false)
    setServerError(null)
    setSavedCount(0)
    requestAnimationFrame(() => termRef.current?.focus())
  }, [open, word, categoryName])

  const draft: WordDraft = {
    term: form.term.trim(),
    definition: form.definition.trim(),
    example: form.example.trim() || null,
    categoryName: form.category.trim() || null,
  }
  const duplicate = draft.term ? findDuplicate(draft, word?.id) : undefined
  const errors = {
    term: !draft.term ? 'Indiquez le mot.' : draft.term.length > LIMITS.term ? `${LIMITS.term} caractères maximum.` : null,
    definition: !draft.definition
      ? 'Indiquez la définition.'
      : draft.definition.length > LIMITS.definition
        ? `${LIMITS.definition} caractères maximum.`
        : null,
    category: (draft.categoryName?.length ?? 0) > LIMITS.category ? `${LIMITS.category} caractères maximum.` : null,
    example: (draft.example?.length ?? 0) > LIMITS.example ? `${LIMITS.example} caractères maximum.` : null,
  }
  const invalid = Object.values(errors).some(Boolean) || !!duplicate

  const chips = useMemo(() => {
    const names = categories.map((c) => c.name)
    const known = new Set(names.map(textKey))
    return [...names, ...SUGGESTED_CATEGORIES.filter((s) => !known.has(textKey(s)))]
  }, [categories])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (invalid) {
      const first = document.querySelector<HTMLElement>('#word-form [aria-invalid="true"]')
      first?.focus()
      return
    }
    setSaving(true)
    try {
      const saved = await saveWord(draft, word?.id)
      if (word) {
        notify('Modifications enregistrées')
        onClose()
      } else {
        notify(`« ${saved.term} » ajouté à votre dictionnaire`)
        // prêt pour le mot suivant ; on garde la catégorie, souvent la même
        setForm({ ...emptyForm, category: form.category })
        setSubmitted(false)
        setSavedCount((n) => n + 1)
        termRef.current?.focus()
      }
    } catch (err) {
      setServerError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const show = (msg: string | null) => (submitted ? msg : null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={word ? 'Modifier le mot' : 'Ajouter un mot'}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {savedCount > 0 && !word && (
            <p className="mr-auto hidden text-sm text-muted sm:block">
              {savedCount} {savedCount > 1 ? 'mots ajoutés' : 'mot ajouté'}
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            {savedCount > 0 ? 'Terminer' : 'Annuler'}
          </button>
          <button type="submit" form="word-form" className="btn-primary" disabled={saving}>
            {saving ? <Spinner /> : !word && <Plus className="size-4.5" aria-hidden />}
            {word ? 'Enregistrer les modifications' : 'Enregistrer le mot'}
          </button>
        </div>
      }
    >
      <form id="word-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Mot" error={show(errors.term)} htmlFor="wf-term">
          <input
            ref={termRef}
            id="wf-term"
            className="field text-[17px] font-semibold"
            value={form.term}
            onChange={set('term')}
            placeholder="Ex. Résilience"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            onKeyDown={(e) => {
              // Entrée : passer à la définition si elle est vide, sinon enregistrer
              if (e.key === 'Enter' && !form.definition.trim()) {
                e.preventDefault()
                document.getElementById('wf-def')?.focus()
              }
            }}
            aria-invalid={!!show(errors.term) || !!duplicate}
            aria-describedby={duplicate ? 'wf-dup' : undefined}
          />
        </Field>
        {duplicate && (
          <div id="wf-dup" role="alert" className="-mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            « {duplicate.term} » existe déjà{draft.categoryName ? ` dans ${draft.categoryName}` : ' sans catégorie'}.{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onEditExisting(duplicate)}>
              Modifier l'entrée existante
            </button>
          </div>
        )}

        <Field label="Définition" error={show(errors.definition)} htmlFor="wf-def">
          <textarea
            id="wf-def"
            className="field min-h-28 resize-y leading-relaxed"
            value={form.definition}
            onChange={set('definition')}
            placeholder="Ex. Capacité à surmonter une difficulté et à retrouver un équilibre après une épreuve."
            aria-invalid={!!show(errors.definition)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(e)
            }}
          />
        </Field>

        <Field label="Catégorie" optional error={show(errors.category)} htmlFor="wf-cat">
          <input
            id="wf-cat"
            className="field"
            value={form.category}
            onChange={set('category')}
            placeholder="Choisir ou saisir une catégorie"
            autoComplete="off"
            aria-invalid={!!show(errors.category)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Suggestions de catégories">
            {chips.map((c) => {
              const active = textKey(c) === textKey(form.category)
              return (
                <button
                  key={c}
                  type="button"
                  className="chip min-h-8 px-2.5 text-[13px]"
                  aria-pressed={active}
                  onClick={() => setForm((f) => ({ ...f, category: active ? '' : c }))}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Exemple d'utilisation" optional error={show(errors.example)} htmlFor="wf-ex">
          <textarea
            id="wf-ex"
            className="field min-h-20 resize-y leading-relaxed"
            value={form.example}
            onChange={set('example')}
            placeholder="Ex. Elle a fait preuve d'une grande résilience face aux difficultés."
            aria-invalid={!!show(errors.example)}
          />
        </Field>

        {serverError && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {serverError}
          </p>
        )}
      </form>
    </Modal>
  )
}

function Field({
  label,
  optional,
  error,
  htmlFor,
  children,
}: {
  label: string
  optional?: boolean
  error: string | null
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label} {optional && <span className="font-normal text-muted">(facultatif)</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fiche complète
// ---------------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

function relativeDue(iso: string | null): string {
  if (!iso) return 'Dès maintenant'
  const due = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(due)
  d.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (days <= 0) return "Aujourd'hui"
  if (days === 1) return 'Demain'
  if (days < 30) return `Dans ${days} jours`
  return `Le ${dateFmt.format(due)}`
}

function WordDetailDialog({ wordId, onClose }: { wordId: string | null; onClose: () => void }) {
  const { wordById, progress, categoryName } = useData()
  const { openEdit, requestDelete } = useWordDialogs()
  const word = wordId ? wordById.get(wordId) : undefined
  const p = word ? progress.get(word.id) : undefined

  return (
    <Modal
      open={!!word}
      onClose={onClose}
      title={<span className="break-words">{word?.term}</span>}
      footer={
        word && (
          <div className="flex gap-2 sm:justify-end">
            <button type="button" className="btn-secondary flex-1 text-danger sm:flex-none" onClick={() => requestDelete(word)}>
              <Trash2 className="size-4.5" aria-hidden />
              Supprimer
            </button>
            <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={() => openEdit(word)}>
              <Pencil className="size-4.5" aria-hidden />
              Modifier
            </button>
          </div>
        )
      }
    >
      {word && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p?.status ?? 'new'} />
            {word.categoryId && (
              <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted">{categoryName(word.categoryId)}</span>
            )}
          </div>
          <section>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Définition</h3>
            <p className="text-[16px] leading-relaxed break-words whitespace-pre-line">{word.definition}</p>
          </section>
          {word.example && (
            <section>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Exemple</h3>
              <p className="border-l-2 border-brand/30 pl-3 text-[15px] leading-relaxed text-slate-700 italic break-words whitespace-pre-line">
                {word.example}
              </p>
            </section>
          )}
          <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-page p-3 text-center">
            <div>
              <dt className="text-xs text-muted">Réussites</dt>
              <dd className="text-lg font-semibold text-success">{p?.successes ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Erreurs</dt>
              <dd className="text-lg font-semibold text-danger">{p?.failures ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Révision</dt>
              <dd className="flex items-center justify-center gap-1 pt-1 text-sm font-semibold">
                <CalendarClock className="size-3.5 text-muted" aria-hidden />
                {relativeDue(p?.dueAt ?? null)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted">Ajouté le {dateFmt.format(new Date(word.createdAt))}</p>
        </div>
      )}
    </Modal>
  )
}
