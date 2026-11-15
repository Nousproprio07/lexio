import { ArrowUpDown, Globe, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { parseAlternates } from '../lib/entries'
import { compressImage } from '../lib/image'
import { textKey } from '../lib/normalize'
import { LIMITS } from '../lib/transfer'
import { defaultImageQuery } from '../lib/wiki'
import { isQuestion, type Word } from '../lib/types'
import { useData, type WordDraft } from '../state/data'
import { useToast } from '../state/toast'
import { QuestionImage } from './QuestionImage'
import { Modal, Spinner } from './ui'
import { WikiImagePicker } from './WikiImagePicker'
import { errorMessage } from './WordDialogs'

/** Catégories proposées pour la culture générale. */
export const SUGGESTED_CULTURE_CATEGORIES = ['Peintres', 'Œuvres d’art', 'Écrivains', 'Monuments', 'Personnalités', 'Musique', 'Histoire', 'Géographie']

/** Questions fréquentes, en un toucher. */
const QUESTION_TEMPLATES = ['Qui a peint ce tableau ?', 'Quel est ce monument ?', 'Qui est-ce ?', 'Qui a écrit cette œuvre ?', 'Où se trouve ce lieu ?']

interface FormState {
  question: string
  answer: string
  alternates: string
  category: string
  example: string
  /** Image déjà enregistrée. */
  imageId: string | null
  /** Nouvelle image choisie, pas encore enregistrée. */
  image: Blob | null
}

const emptyForm: FormState = { question: '', answer: '', alternates: '', category: '', example: '', imageId: null, image: null }

/**
 * Création, modification d'une question de culture générale, ou transformation
 * d'un mot (saisi dans « Mots » par erreur) en question : il garde sa progression.
 */
export function QuestionFormDialog({
  open,
  word,
  onClose,
  onEditExisting,
}: {
  open: boolean
  /** Question à modifier, ou mot à transformer ; null pour une nouvelle question. */
  word: Word | null
  onClose: () => void
  onEditExisting: (w: Word) => void
}) {
  const { categories, categoryName, saveWord, saveImage, findDuplicate, words } = useData()
  const notify = useToast()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  /** Recherche d'image Wikipédia ouverte (texte de départ), ou null. */
  const [webSearch, setWebSearch] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const converting = !!word && !isQuestion(word)

  // (ré)initialisation à chaque ouverture
  useEffect(() => {
    if (!open) return
    if (!word) setForm(emptyForm)
    else if (isQuestion(word))
      setForm({
        question: word.definition,
        answer: word.term,
        alternates: (word.alternates ?? []).join(', '),
        category: categoryName(word.categoryId) ?? '',
        example: word.example ?? '',
        imageId: word.imageId ?? null,
        image: null,
      })
    else {
      // mot rangé dans « Mots » : la question est le plus souvent dans le champ qui se termine par « ? »
      const defIsQuestion = /\?\s*$/.test(word.definition) && !/\?\s*$/.test(word.term)
      setForm({
        ...emptyForm,
        question: defIsQuestion ? word.definition : word.term,
        answer: defIsQuestion ? word.term : word.definition,
        category: categoryName(word.categoryId) ?? '',
        example: word.example ?? '',
      })
    }
    setSubmitted(false)
    setServerError(null)
    setSavedCount(0)
    setWebSearch(null)
  }, [open, word, categoryName])

  // aperçu de la nouvelle image
  const previewUrl = useMemo(() => (form.image ? URL.createObjectURL(form.image) : null), [form.image])
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl])

  const draft: WordDraft = {
    kind: 'question',
    term: form.answer.trim(),
    definition: form.question.trim(),
    example: form.example.trim() || null,
    categoryName: form.category.trim() || null,
    imageId: form.imageId,
    alternates: parseAlternates(form.alternates),
  }
  // une nouvelle image rend la question distincte : pas de doublon possible avant l'enregistrement
  const duplicate = draft.term && draft.definition && !form.image ? findDuplicate(draft, word?.id) : undefined
  const errors = {
    question: !draft.definition ? 'Indiquez la question.' : draft.definition.length > LIMITS.definition ? `${LIMITS.definition} caractères maximum.` : null,
    answer: !draft.term ? 'Indiquez la bonne réponse.' : draft.term.length > LIMITS.answer ? `${LIMITS.answer} caractères maximum.` : null,
    alternates: form.alternates.length > LIMITS.example ? `${LIMITS.example} caractères maximum.` : null,
    category: (draft.categoryName?.length ?? 0) > LIMITS.category ? `${LIMITS.category} caractères maximum.` : null,
    example: (draft.example?.length ?? 0) > LIMITS.example ? `${LIMITS.example} caractères maximum.` : null,
  }
  const invalid = Object.values(errors).some(Boolean) || !!duplicate

  const chips = useMemo(() => {
    const used = new Set(words.filter(isQuestion).map((w) => w.categoryId))
    const names = categories.filter((c) => used.has(c.id)).map((c) => c.name)
    const known = new Set(names.map(textKey))
    return [...names, ...SUGGESTED_CULTURE_CATEGORIES.filter((s) => !known.has(textKey(s)))]
  }, [categories, words])

  const pickImage = async (file: Blob) => {
    setPreparing(true)
    setServerError(null)
    try {
      const image = await compressImage(file)
      setForm((f) => ({ ...f, image, imageId: null }))
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreparing(false)
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (invalid || preparing) {
      document.querySelector<HTMLElement>('#question-form [aria-invalid="true"]')?.focus()
      return
    }
    setSaving(true)
    try {
      const imageId = form.image ? await saveImage(form.image) : form.imageId
      await saveWord({ ...draft, imageId }, word?.id)
      if (word) {
        notify(converting ? 'Transformé en question de culture générale' : 'Modifications enregistrées')
        onClose()
      } else {
        notify('Question ajoutée')
        // prêt pour la suivante : on garde la question type et la catégorie, souvent les mêmes
        setForm({ ...emptyForm, question: form.question, category: form.category })
        setWebSearch(null)
        setSubmitted(false)
        setSavedCount((n) => n + 1)
      }
    } catch (err) {
      setServerError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const openWebSearch = () => setWebSearch(defaultImageQuery(form.answer, form.question))

  const set = (k: 'question' | 'answer' | 'alternates' | 'category' | 'example') => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const show = (msg: string | null) => (submitted ? msg : null)
  const hasImage = !!form.image || !!form.imageId

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={converting ? 'Transformer en question' : word ? 'Modifier la question' : 'Ajouter une question'}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {savedCount > 0 && !word && (
            <p className="mr-auto hidden text-sm text-muted sm:block">
              {savedCount} {savedCount > 1 ? 'questions ajoutées' : 'question ajoutée'}
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            {savedCount > 0 ? 'Terminer' : 'Annuler'}
          </button>
          <button type="submit" form="question-form" className="btn-primary" disabled={saving || preparing}>
            {saving ? <Spinner /> : !word && <Plus className="size-4.5" aria-hidden />}
            {converting ? 'Transformer' : word ? 'Enregistrer les modifications' : 'Enregistrer la question'}
          </button>
        </div>
      }
    >
      <form
        id="question-form"
        onSubmit={submit}
        noValidate
        className="space-y-4"
        onPaste={(e) => {
          // coller une image copiée (depuis un site, une capture d'écran…)
          const file = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile()
          if (file) {
            e.preventDefault()
            void pickImage(file)
          }
        }}
      >
        {converting && (
          <p className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand-dark">
            Vérifiez la question et la réponse, ajoutez une image si vous le souhaitez. La progression est conservée.
          </p>
        )}

        <div>
          <span className="label">
            Image <span className="font-normal text-muted">(facultatif)</span>
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choisir une image"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void pickImage(f)
            }}
          />
          {webSearch !== null ? (
            <div className="rounded-2xl border border-line p-3">
              <WikiImagePicker
                initialQuery={webSearch}
                onPick={(image) => {
                  setForm((f) => ({ ...f, image, imageId: null }))
                  setWebSearch(null)
                }}
              />
              <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setWebSearch(null)}>
                Fermer la recherche
              </button>
            </div>
          ) : hasImage || preparing ? (
            <div className="relative overflow-hidden rounded-2xl border border-line bg-slate-50">
              {preparing ? (
                <div className="flex h-48 items-center justify-center">
                  <Spinner className="size-5 text-brand" />
                </div>
              ) : previewUrl ? (
                <img src={previewUrl} alt="Image de la question" className="max-h-64 w-full object-contain" />
              ) : (
                <QuestionImage imageId={form.imageId} alt="Image de la question" className="h-64 w-full" />
              )}
              {!preparing && (
                <div className="absolute right-2 bottom-2 flex gap-1.5">
                  <button type="button" className="btn-secondary h-9 px-3 text-sm shadow-sm" onClick={openWebSearch}>
                    <Globe className="size-4 text-brand" aria-hidden />
                    Chercher
                  </button>
                  <button type="button" className="btn-secondary h-9 px-3 text-sm shadow-sm" onClick={() => fileRef.current?.click()}>
                    Changer
                  </button>
                  <button
                    type="button"
                    className="btn-secondary h-9 px-2.5 text-danger shadow-sm"
                    aria-label="Retirer l'image"
                    onClick={() => setForm((f) => ({ ...f, image: null, imageId: null }))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={openWebSearch}
                className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft/40 px-2 text-center text-brand transition-colors hover:border-brand"
              >
                <Globe className="size-7" aria-hidden />
                <span className="text-[15px] font-medium">Chercher une vraie image</span>
                <span className="text-xs text-muted">Artiste, œuvre, lieu (Wikipédia)</span>
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-2 text-center text-muted transition-colors hover:border-brand hover:text-brand"
              >
                <ImagePlus className="size-7" aria-hidden />
                <span className="text-[15px] font-medium">Ajouter une photo</span>
                <span className="text-xs">Depuis l’appareil, ou collez une image</span>
              </button>
            </div>
          )}
        </div>

        <Field label="Question" error={show(errors.question)} htmlFor="qf-question">
          <textarea
            id="qf-question"
            className="field min-h-20 resize-y text-[16px] leading-relaxed font-medium"
            value={form.question}
            onChange={set('question')}
            placeholder="Ex. Qui a peint ce tableau ?"
            aria-invalid={!!show(errors.question)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Questions types">
            {QUESTION_TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                className="chip min-h-8 px-2.5 text-[13px]"
                aria-pressed={textKey(t) === textKey(form.question)}
                onClick={() => setForm((f) => ({ ...f, question: t }))}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Bonne réponse" error={show(errors.answer)} htmlFor="qf-answer">
          <div className="flex gap-2">
            <textarea
              id="qf-answer"
              rows={form.answer.length > 60 ? 4 : 1}
              className="field min-h-12 resize-y text-[17px] leading-snug font-semibold"
              value={form.answer}
              onChange={set('answer')}
              placeholder="Ex. Claude Monet"
              autoComplete="off"
              aria-invalid={!!show(errors.answer) || !!duplicate}
            />
            {converting && (
              <button
                type="button"
                className="btn-secondary shrink-0 px-3"
                onClick={() => setForm((f) => ({ ...f, question: f.answer, answer: f.question }))}
                aria-label="Inverser la question et la réponse"
                title="Inverser la question et la réponse"
              >
                <ArrowUpDown className="size-4.5" aria-hidden />
              </button>
            )}
          </div>
        </Field>
        {duplicate && (
          <div role="alert" className="-mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
            Cette question existe déjà{draft.categoryName ? ` dans ${draft.categoryName}` : ''}.{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onEditExisting(duplicate)}>
              Modifier l'entrée existante
            </button>
          </div>
        )}

        <Field label="Autres réponses acceptées" optional error={show(errors.alternates)} htmlFor="qf-alt">
          <input
            id="qf-alt"
            className="field"
            value={form.alternates}
            onChange={set('alternates')}
            placeholder="Ex. Monet, C. Monet"
            autoComplete="off"
            aria-describedby="qf-alt-help"
          />
          <p id="qf-alt-help" className="mt-1.5 text-sm text-muted">
            Séparées par une virgule. Utile quand vous écrivez la réponse au lieu de la choisir.
          </p>
        </Field>

        <Field label="Catégorie" optional error={show(errors.category)} htmlFor="qf-cat">
          <input
            id="qf-cat"
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

        <Field label="Le saviez-vous ?" optional error={show(errors.example)} htmlFor="qf-ex">
          <textarea
            id="qf-ex"
            className="field min-h-20 resize-y leading-relaxed"
            value={form.example}
            onChange={set('example')}
            placeholder="Ex. Impression, soleil levant (1872) a donné son nom à l'impressionnisme."
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

function Field({ label, optional, error, htmlFor, children }: { label: string; optional?: boolean; error: string | null; htmlFor: string; children: ReactNode }) {
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
