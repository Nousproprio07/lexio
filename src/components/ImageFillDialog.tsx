import { Check, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { isArtworkQuestion, missingSlots, questionImages } from '../lib/entries'
import { isQuestion } from '../lib/types'
import { clueImageQuery, defaultImageQuery } from '../lib/wiki'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Modal, plural, ProgressBar, Spinner } from './ui'
import { WikiImagePicker } from './WikiImagePicker'
import { errorMessage } from './WordDialogs'

type Slot = 'clue' | 'answer'

/**
 * Complète les images manquantes : passe en revue les questions concernées ;
 * pour chaque image à trouver, la recherche Wikipédia est lancée sur le bon
 * sujet (l'œuvre, ou le peintre) et la meilleure image est proposée. Rien n'est
 * enregistré sans validation, seule l'image est ajoutée (question, réponse et
 * progression intactes), et une image déjà présente n'est jamais remplacée.
 */
export function ImageFillDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { words, wordById, categoryName, addImageToQuestion } = useData()
  const notify = useToast()
  // étapes figées à l'ouverture : la liste ne bouge pas à mesure que les images sont ajoutées
  const [steps, setSteps] = useState<{ id: string; slot: Slot }[]>([])
  const [index, setIndex] = useState(0)
  const [added, setAdded] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSteps(words.filter(isQuestion).flatMap((w) => missingSlots(w, categoryName(w.categoryId)).map((slot) => ({ id: w.id, slot }))))
    setIndex(0)
    setAdded(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniquement à l'ouverture
  }, [open])

  const step = steps[index]
  const current = step ? wordById.get(step.id) : undefined
  const done = open && steps.length > 0 && index >= steps.length
  const questions = useMemo(() => words.filter(isQuestion), [words])
  const illustrated = questions.filter((w) => missingSlots(w, categoryName(w.categoryId)).length === 0).length
  const slotTaken = !!current && !!step && !!questionImages(current)[step.slot]

  // question supprimée ou image ajoutée entre-temps (autre onglet) : on passe
  useEffect(() => {
    if (open && step && (!current || slotTaken)) setIndex((i) => i + 1)
  }, [open, step, current, slotTaken])

  const pick = async (image: Blob, credit: string | null) => {
    if (!current || !step || slotTaken) return
    setSaving(true)
    try {
      await addImageToQuestion(current.id, step.slot, image, credit)
      setAdded((n) => n + 1)
      setIndex((i) => i + 1)
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const artwork = !!current && isArtworkQuestion(current.definition, categoryName(current.categoryId))
  const stepTitle = !step
    ? ''
    : step.slot === 'clue'
      ? artwork
        ? 'Image de la question : l’œuvre'
        : 'Image de la question'
      : artwork
        ? 'Image de la réponse : l’artiste'
        : 'Image de la réponse'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compléter les images manquantes"
      footer={
        done || steps.length === 0 ? (
          <button type="button" className="btn-primary w-full" onClick={onClose}>
            Terminer
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Arrêter
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setIndex((i) => i + 1)} disabled={saving}>
              <SkipForward className="size-4.5" aria-hidden />
              Passer
            </button>
          </div>
        )
      }
    >
      {steps.length === 0 ? (
        <p className="text-[15px] text-muted">Toutes vos questions ont déjà leurs images.</p>
      ) : done ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
            <Check className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">{added > 0 ? `${plural(added, 'image ajoutée', 'images ajoutées')}` : 'Aucune image ajoutée'}</p>
          <p className="mt-1 text-sm text-muted">
            {illustrated} {illustrated > 1 ? 'questions illustrées' : 'question illustrée'} sur {questions.length}
            {added < steps.length ? ` · ${plural(steps.length - added, 'image passée', 'images passées')}` : ''}.
          </p>
        </div>
      ) : (
        current &&
        step && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 flex justify-between gap-2 text-sm text-muted tabular-nums">
                <span>
                  Image {index + 1} sur {steps.length}
                </span>
                <span aria-live="polite">
                  {illustrated} {illustrated > 1 ? 'questions illustrées' : 'question illustrée'} sur {questions.length}
                </span>
              </p>
              <ProgressBar value={questions.length ? (illustrated / questions.length) * 100 : 0} label="Questions illustrées" />
            </div>
            <div className="rounded-2xl bg-page p-3.5">
              <p className="text-xs font-semibold tracking-wide text-brand uppercase">{stepTitle}</p>
              <p className="mt-1 text-[15px] font-medium break-words">{current.definition}</p>
              <p className="mt-1 text-sm break-words text-muted">
                Réponse : <span className="font-semibold text-ink">{current.term}</span>
              </p>
            </div>
            {saving ? (
              <div className="flex h-40 items-center justify-center">
                <Spinner className="size-5 text-brand" />
              </div>
            ) : (
              <WikiImagePicker
                key={`${current.id}:${step.slot}`}
                initialQuery={step.slot === 'clue' ? clueImageQuery(current.definition, current.term) : defaultImageQuery(current.term, current.definition)}
                onPick={(img, credit) => void pick(img, credit)}
              />
            )}
          </div>
        )
      )}
    </Modal>
  )
}
