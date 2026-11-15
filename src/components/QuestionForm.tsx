import { ArrowUpDown, Plus } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { imageFields, parseAlternates, questionImages, type ImageRef } from '../lib/entries'
import { autoKeywords, isLongAnswer } from '../lib/grading'
import { compressImage } from '../lib/image'
import { textKey } from '../lib/normalize'
import { LIMITS } from '../lib/transfer'
import { clueImageQuery, defaultImageQuery } from '../lib/wiki'
import { isQuestion, type Word } from '../lib/types'
import { useData, type WordDraft } from '../state/data'
import { useToast } from '../state/toast'
import { emptySlot, ImageSlot, slotFilled, type SlotValue } from './ImageSlot'
import { Modal, Spinner } from './ui'
import { errorMessage } from './WordDialogs'

/** Catégories proposées pour la culture générale. */
export const SUGGESTED_CULTURE_CATEGORIES = ['Peintres', 'Œuvres d’art', 'Écrivains', 'Monuments', 'Personnalités', 'Musique', 'Histoire', 'Géographie']

/** Questions fréquentes, en un toucher. */
const QUESTION_TEMPLATES = ['Qui a peint ce tableau ?', 'Quel est ce monument ?', 'Qui est-ce ?', 'Qui a écrit cette œuvre ?', 'Où se trouve ce lieu ?']

interface FormState {
  question: string
  answer: string
  alternates: string
  keywords: string
  category: string
  example: string
  /** Image montrée avec la question (indice) : le tableau, le monument… */
  clue: SlotValue
  /** Image montrée avec la réponse : le portrait du peintre, la photo du lieu… */
  answerImage: SlotValue
}

const emptyForm: FormState = {
  question: '',
  answer: '',
  alternates: '',
  keywords: '',
  category: '',
  example: '',
  clue: emptySlot,
  answerImage: emptySlot,
}

const slotOf = (ref: ImageRef | null): SlotValue => (ref ? { id: ref.id, blob: null, credit: ref.credit } : emptySlot)

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
  const [serverError, setServerError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
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
        keywords: (word.keywords ?? []).join(', '),
        category: categoryName(word.categoryId) ?? '',
        example: word.example ?? '',
        clue: slotOf(questionImages(word).clue),
        answerImage: slotOf(questionImages(word).answer),
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
  }, [open, word, categoryName])

  // images déjà enregistrées ; une nouvelle image n'a pas encore d'identifiant
  const refOf = (v: SlotValue): ImageRef | null => (v.id ? { id: v.id, credit: v.credit } : null)
  const hasNewImage = !!form.clue.blob || !!form.answerImage.blob

  const draft: WordDraft = {
    kind: 'question',
    term: form.answer.trim(),
    definition: form.question.trim(),
    example: form.example.trim() || null,
    categoryName: form.category.trim() || null,
    ...imageFields(refOf(form.clue), refOf(form.answerImage)),
    alternates: parseAlternates(form.alternates),
    keywords: parseAlternates(form.keywords),
  }
  // une nouvelle image rend la question distincte : pas de doublon possible avant l'enregistrement
  const duplicate = draft.term && draft.definition && !hasNewImage ? findDuplicate(draft, word?.id) : undefined
  const errors = {
    question: !draft.definition ? 'Indiquez la question.' : draft.definition.length > LIMITS.definition ? `${LIMITS.definition} caractères maximum.` : null,
    answer: !draft.term ? 'Indiquez la bonne réponse.' : draft.term.length > LIMITS.answer ? `${LIMITS.answer} caractères maximum.` : null,
    alternates: form.alternates.length > LIMITS.example ? `${LIMITS.example} caractères maximum.` : null,
    keywords: form.keywords.length > LIMITS.example ? `${LIMITS.example} caractères maximum.` : null,
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

  /** Image collée : elle va dans le premier emplacement libre (question, puis réponse). */
  const pasteImage = async (file: Blob) => {
    setServerError(null)
    try {
      const blob = await compressImage(file)
      setForm((f) => {
        const value: SlotValue = { id: null, blob, credit: null }
        return !slotFilled(f.clue) ? { ...f, clue: value } : { ...f, answerImage: value }
      })
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e))
    }
  }

  const upload = async (v: SlotValue): Promise<ImageRef | null> => (v.blob ? { id: await saveImage(v.blob), credit: v.credit } : refOf(v))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (invalid) {
      document.querySelector<HTMLElement>('#question-form [aria-invalid="true"]')?.focus()
      return
    }
    setSaving(true)
    try {
      await saveWord({ ...draft, ...imageFields(await upload(form.clue), await upload(form.answerImage)) }, word?.id)
      if (word) {
        notify(converting ? 'Transformé en question de culture générale' : 'Modifications enregistrées')
        onClose()
      } else {
        notify('Question ajoutée')
        // prêt pour la suivante : on garde la question type et la catégorie, souvent les mêmes
        setForm({ ...emptyForm, question: form.question, category: form.category })
        setSubmitted(false)
        setSavedCount((n) => n + 1)
      }
    } catch (err) {
      setServerError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const withQuestion = (f: FormState, question: string): FormState => ({ ...f, question })
  const longAnswer = isLongAnswer(form.answer)
  const detected = useMemo(() => (longAnswer ? autoKeywords(form.answer).keywords.map((k) => k.label) : []), [longAnswer, form.answer])

  const set = (k: 'question' | 'answer' | 'alternates' | 'keywords' | 'category' | 'example') => (e: { target: { value: string } }) =>
    setForm((f) => (k === 'question' ? withQuestion(f, e.target.value) : { ...f, [k]: e.target.value }))
  const show = (msg: string | null) => (submitted ? msg : null)

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
          <button type="submit" form="question-form" className="btn-primary" disabled={saving}>
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
            void pasteImage(file)
          }
        }}
      >
        {converting && (
          <p className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand-dark">
            Vérifiez la question et la réponse, ajoutez une image si vous le souhaitez. La progression est conservée.
          </p>
        )}

        <ImageSlot
          label="Image de la question"
          hint="Montrée avec la question, comme indice : le tableau, le monument, la personne à reconnaître."
          value={form.clue}
          onChange={(clue) => setForm((f) => ({ ...f, clue }))}
          searchQuery={() => clueImageQuery(form.question, form.answer)}
          onError={setServerError}
        />

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
                onClick={() => setForm((f) => withQuestion(f, t))}
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

        <ImageSlot
          label="Image de la réponse"
          hint="Montrée après votre réponse : le portrait du peintre, la photo du lieu…"
          value={form.answerImage}
          onChange={(answerImage) => setForm((f) => ({ ...f, answerImage }))}
          searchQuery={() => defaultImageQuery(form.answer, form.question)}
          onError={setServerError}
        />

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

        {(longAnswer || form.keywords.trim() !== '') && (
          <Field label="Mots-clés à retrouver" optional error={show(errors.keywords)} htmlFor="qf-kw">
            <input
              id="qf-kw"
              className="field"
              value={form.keywords}
              onChange={set('keywords')}
              placeholder={detected.length ? detected.slice(0, 6).join(', ') : 'Ex. Prado, XIIe, XIXe, Reina Sofía, XXe'}
              autoComplete="off"
              aria-describedby="qf-kw-help"
            />
            <p id="qf-kw-help" className="mt-1.5 text-sm text-muted">
              Réponse longue : quand vous l’écrivez, Lexio vérifie qu’elle contient l’essentiel plutôt que la phrase exacte.{' '}
              {form.keywords.trim()
                ? 'Tous les mots-clés indiqués ici seront exigés.'
                : detected.length
                  ? `Sans rien indiquer, il cherche : ${detected.join(', ')} (70 % suffisent).`
                  : 'Indiquez les mots indispensables, séparés par une virgule.'}
            </p>
          </Field>
        )}

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
