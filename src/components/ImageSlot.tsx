import { Globe, ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { compressImage } from '../lib/image'
import { QuestionImage } from './QuestionImage'
import { Spinner } from './ui'
import { WikiImagePicker } from './WikiImagePicker'

/** Image d'un emplacement : déjà enregistrée (`id`) ou nouvellement choisie (`blob`). */
export interface SlotValue {
  id: string | null
  blob: Blob | null
  /** Attribution (Wikipédia / Commons) ; null pour une photo personnelle. */
  credit: string | null
}

export const emptySlot: SlotValue = { id: null, blob: null, credit: null }
export const slotFilled = (v: SlotValue) => !!v.id || !!v.blob

/**
 * Un emplacement d'image du formulaire de question : recherche Wikipédia,
 * photo de l'appareil, aperçu, retrait.
 */
export function ImageSlot({
  label,
  hint,
  value,
  onChange,
  searchQuery,
  onError,
}: {
  label: string
  hint: string
  value: SlotValue
  onChange: (v: SlotValue) => void
  /** Recherche Wikipédia proposée à l'ouverture. */
  searchQuery: () => string
  onError: (message: string | null) => void
}) {
  const [search, setSearch] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(() => (value.blob ? URL.createObjectURL(value.blob) : null), [value.blob])
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl])

  const pickFile = async (file: Blob) => {
    setPreparing(true)
    onError(null)
    try {
      onChange({ id: null, blob: await compressImage(file), credit: null })
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div role="group" aria-label={label}>
      <span className="label">
        {label} <span className="font-normal text-muted">(facultatif)</span>
      </span>
      <p className="-mt-1 mb-2 text-sm text-muted">{hint}</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Choisir une photo : ${label}`}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void pickFile(f)
        }}
      />
      {search !== null ? (
        <div className="rounded-2xl border border-line p-3">
          <WikiImagePicker
            initialQuery={search}
            onPick={(blob, credit) => {
              onChange({ id: null, blob, credit })
              setSearch(null)
            }}
          />
          <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setSearch(null)}>
            Fermer la recherche
          </button>
        </div>
      ) : slotFilled(value) || preparing ? (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-slate-50">
            {preparing ? (
              <div className="flex h-48 items-center justify-center">
                <Spinner className="size-5 text-brand" />
              </div>
            ) : previewUrl ? (
              <img src={previewUrl} alt={label} className="max-h-64 w-full object-contain" />
            ) : (
              <QuestionImage imageId={value.id} alt={label} className="h-64 w-full" />
            )}
            {!preparing && (
              <div className="absolute right-2 bottom-2 flex gap-1.5">
                <button type="button" className="btn-secondary h-9 px-3 text-sm shadow-sm" onClick={() => setSearch(searchQuery())}>
                  <Globe className="size-4 text-brand" aria-hidden />
                  Chercher
                </button>
                <button type="button" className="btn-secondary h-9 px-3 text-sm shadow-sm" onClick={() => fileRef.current?.click()}>
                  Changer
                </button>
                <button
                  type="button"
                  className="btn-secondary h-9 px-2.5 text-danger shadow-sm"
                  aria-label={`Retirer : ${label}`}
                  onClick={() => onChange(emptySlot)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
          {value.credit && <p className="mt-1.5 text-xs break-words text-muted">{value.credit}</p>}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSearch(searchQuery())}
            className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-soft/40 px-2 text-center text-brand transition-colors hover:border-brand"
          >
            <Globe className="size-6" aria-hidden />
            <span className="text-[15px] font-medium">Chercher une vraie image</span>
            <span className="text-xs text-muted">Wikipédia</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-2 text-center text-muted transition-colors hover:border-brand hover:text-brand"
          >
            <ImagePlus className="size-6" aria-hidden />
            <span className="text-[15px] font-medium">Ajouter une photo</span>
            <span className="text-xs">De l’appareil, ou collée</span>
          </button>
        </div>
      )}
    </div>
  )
}
