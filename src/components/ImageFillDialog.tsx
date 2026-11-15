import { Check, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'
import { defaultImageQuery } from '../lib/wiki'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { Modal, plural, ProgressBar, Spinner } from './ui'
import { WikiImagePicker } from './WikiImagePicker'
import { errorMessage } from './WordDialogs'

/**
 * Complète les images manquantes : passe en revue les questions sans image ;
 * pour chacune, la recherche Wikipédia est lancée sur son sujet et la meilleure
 * image est proposée. Rien n'est enregistré sans validation, seule l'image est
 * ajoutée (question, réponse et progression intactes), et une question qui a
 * déjà une image n'est jamais modifiée.
 */
export function ImageFillDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { words, wordById, addImageToQuestion } = useData()
  const notify = useToast()
  // liste figée à l'ouverture : elle ne bouge pas à mesure que les images sont ajoutées
  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [added, setAdded] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setQueue(words.filter((w) => w.kind === 'question' && !w.imageId).map((w) => w.id))
    setIndex(0)
    setAdded(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniquement à l'ouverture
  }, [open])

  const current = queue[index] ? wordById.get(queue[index]) : undefined
  const done = open && queue.length > 0 && index >= queue.length
  const total = words.filter((w) => w.kind === 'question').length
  const illustrated = words.filter((w) => w.kind === 'question' && w.imageId).length

  // question supprimée ou illustrée entre-temps (autre onglet) : on passe
  useEffect(() => {
    if (open && queue[index] && (!current || current.imageId)) setIndex((i) => i + 1)
  }, [open, queue, index, current])

  const pick = async (image: Blob, credit: string | null) => {
    if (!current || current.imageId) return
    setSaving(true)
    try {
      await addImageToQuestion(current.id, image, credit)
      setAdded((n) => n + 1)
      setIndex((i) => i + 1)
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compléter les images manquantes"
      footer={
        done || queue.length === 0 ? (
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
      {queue.length === 0 ? (
        <p className="text-[15px] text-muted">Toutes vos questions ont déjà une image.</p>
      ) : done ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
            <Check className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">{added > 0 ? `${plural(added, 'image ajoutée', 'images ajoutées')}` : 'Aucune image ajoutée'}</p>
          <p className="mt-1 text-sm text-muted">
            {illustrated} {illustrated > 1 ? 'questions illustrées' : 'question illustrée'} sur {total}
            {added < queue.length ? ` · ${plural(queue.length - added, 'question passée', 'questions passées')}` : ''}.
          </p>
        </div>
      ) : (
        current && (
          <div className="space-y-4">
            <div>
              <p className="mb-2 flex justify-between gap-2 text-sm text-muted tabular-nums">
                <span>
                  Question {index + 1} sur {queue.length}
                </span>
                <span aria-live="polite">
                  {illustrated} {illustrated > 1 ? 'questions illustrées' : 'question illustrée'} sur {total}
                </span>
              </p>
              <ProgressBar value={total ? (illustrated / total) * 100 : 0} label="Questions illustrées" />
            </div>
            <div className="rounded-2xl bg-page p-3.5">
              <p className="text-[15px] font-medium break-words">{current.definition}</p>
              <p className="mt-1 text-sm break-words text-muted">
                Réponse : <span className="font-semibold text-ink">{current.term}</span>
              </p>
            </div>
            {saving ? (
              <div className="flex h-40 items-center justify-center">
                <Spinner className="size-5 text-brand" />
              </div>
            ) : (
              <WikiImagePicker key={current.id} initialQuery={defaultImageQuery(current.term, current.definition)} onPick={(img, credit) => void pick(img, credit)} />
            )}
          </div>
        )
      )}
    </Modal>
  )
}
