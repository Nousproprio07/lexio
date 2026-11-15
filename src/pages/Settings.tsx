import { Check, Download, FileJson, FileSpreadsheet, HardDrive, LockKeyhole, Pencil, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { errorMessage } from '../components/WordDialogs'
import { ConfirmDialog, Modal, PageHeader, plural, Spinner, Toggle } from '../components/ui'
import { blobToDataUrl, dataUrlToBlob, imageIdOf } from '../lib/image'
import { dedupeImport, entryKey, parseCsvImport, parseJsonImport, toCsv, toJsonExport, wordKey, type ImportParseResult, type ImportRow } from '../lib/transfer'
import { isQuestion, type Category } from '../lib/types'
import { useData } from '../state/data'
import { useIgnoreAccents } from '../state/settings'
import { useToast } from '../state/toast'

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export function SettingsPage() {
  const { repo, words, categories, progress, categoryName, persistent, lastBackup, markBackup, lock } = useData()
  const [exporting, setExporting] = useState(false)
  const [ignoreAccents, setIgnoreAccents] = useIgnoreAccents()
  const notify = useToast()
  const [protectedStorage, setProtectedStorage] = useState<boolean | null>(null)

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setProtectedStorage, () => setProtectedStorage(null))
  }, [])

  const exportJson = async () => {
    setExporting(true)
    try {
      // les images des questions sont incluses dans la sauvegarde
      const images = new Map<string, string>()
      for (const id of new Set(words.map((w) => w.imageId).filter((id): id is string => !!id))) {
        const blob = await repo.getImage(id)
        if (blob) images.set(id, await blobToDataUrl(blob))
      }
      download(`lexio-sauvegarde-${stamp()}.json`, JSON.stringify(toJsonExport(words, categories, progress, new Date(), images), null, 2), 'application/json')
      markBackup()
      notify('Sauvegarde téléchargée')
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setExporting(false)
    }
  }
  const exportCsv = () => {
    download(`lexio-dictionnaire-${stamp()}.csv`, toCsv(words, categoryName), 'text/csv;charset=utf-8')
    notify('Dictionnaire exporté')
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up space-y-5">
      <PageHeader title="Réglages et données" />

      <Section title="Vos données">
        <ul className="space-y-3 text-[15px] leading-relaxed">
          <li className="flex gap-3">
            <HardDrive className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <span>
              Vos mots restent <strong>uniquement sur cet appareil</strong>, dans ce navigateur, chiffrés avec votre code d’accès : aucun serveur. Ils ne
              sont pas partagés entre votre téléphone et votre ordinateur.
            </span>
          </li>
          <li className="flex gap-3">
            <LockKeyhole className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
            <span className="text-muted">
              Le code est demandé à chaque nouvelle ouverture de Lexio. Il n’est enregistré nulle part : en cas d’oubli, l’espace ne peut plus être ouvert,
              d’où l’intérêt d’une sauvegarde.
            </span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck className={`mt-0.5 size-5 shrink-0 ${persistent && protectedStorage ? 'text-success' : 'text-muted'}`} aria-hidden />
            <span className="text-muted">
              {!persistent
                ? 'Stockage indisponible dans ce mode de navigation : exportez vos mots avant de fermer.'
                : protectedStorage
                  ? 'Stockage protégé : le navigateur ne les effacera pas pour libérer de la place.'
                  : 'Sur iPhone, ajoutez Lexio à l’écran d’accueil (Partager → Sur l’écran d’accueil) : Safari peut sinon effacer les données d’un site non utilisé pendant 7 jours. Évitez aussi d’effacer l’historique et les données de sites.'}
            </span>
          </li>
        </ul>
        <button type="button" className="btn-secondary mt-4" onClick={lock}>
          <LockKeyhole className="size-4.5" aria-hidden />
          Verrouiller l’espace
        </button>
      </Section>

      <Section
        title="Sauvegarde"
        description={
          lastBackup
            ? `Dernière sauvegarde le ${new Date(lastBackup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'Aucune sauvegarde pour l’instant. Téléchargez-en une de temps en temps : c’est votre filet de sécurité.'
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-secondary justify-start" onClick={() => void exportJson()} disabled={words.length === 0 || exporting}>
            {exporting ? <Spinner className="size-5 text-brand" /> : <FileJson className="size-5 text-brand" aria-hidden />}
            Sauvegarde complète (JSON)
          </button>
          <button type="button" className="btn-secondary justify-start" onClick={exportCsv} disabled={!words.some((w) => !isQuestion(w))}>
            <FileSpreadsheet className="size-5 text-brand" aria-hidden />
            Dictionnaire (CSV / Excel)
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Le JSON inclut votre progression et la culture générale avec ses images ; il se réimporte tel quel. Le CSV ne contient que les mots.
        </p>
      </Section>

      <ImportSection />

      <Section title="Quiz">
        <Toggle
          label="Tolérer les accents oubliés"
          description="Dans « Retrouver le mot », « resilience » sera accepté pour « résilience »."
          checked={ignoreAccents}
          onChange={setIgnoreAccents}
        />
      </Section>

      <CategoriesSection categories={categories} />

    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5 md:p-6">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------

function ImportSection() {
  const { words, categoryName, importWords, saveImage } = useData()
  const notify = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<(ImportParseResult & { fileName: string; fresh: ImportRow[]; duplicates: number }) | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    // une sauvegarde JSON peut contenir les images de la culture générale
    if (file.size > 300 * 1024 * 1024) {
      notify('Fichier trop volumineux (300 Mo maximum).', 'error')
      return
    }
    const text = await file.text()
    const res = /\.json$/i.test(file.name) || text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? parseJsonImport(text) : parseCsvImport(text)
    for (const r of res.rows) {
      const blob = r.image ? dataUrlToBlob(r.image) : null
      r.imageId = blob ? await imageIdOf(blob) : null
    }
    const existing = new Set(words.map((w) => entryKey({ ...w, category: categoryName(w.categoryId) })))
    const { fresh, duplicates } = dedupeImport(res.rows, existing)
    setParsed({ ...res, fileName: file.name, fresh, duplicates })
  }

  const confirm = async () => {
    if (!parsed) return
    setBusy(true)
    try {
      const drafts = []
      for (const r of parsed.fresh) {
        const blob = r.image ? dataUrlToBlob(r.image) : null
        drafts.push({
          kind: r.kind,
          term: r.term,
          definition: r.definition,
          example: r.example,
          categoryName: r.category,
          alternates: r.alternates,
          imageCredit: r.imageCredit,
          imageAsClue: r.imageAsClue,
          imageId: blob ? await saveImage(blob) : null,
        })
      }
      const n = await importWords(drafts, (d, i) => parsed.fresh[i].progress ?? parsed.progress?.get(wordKey(d.term, d.categoryName)))
      notify(plural(n, 'entrée importée', 'entrées importées'))
      setParsed(null)
    } catch (e) {
      notify(errorMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Importer des mots" description="Fichier CSV (colonnes : mot, definition, categorie, exemple) ou sauvegarde JSON de Lexio.">
      <input
        ref={input}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void onFile(f)
        }}
      />
      <button type="button" className="btn-secondary" onClick={() => input.current?.click()}>
        <Upload className="size-4.5 text-brand" aria-hidden />
        Choisir un fichier
      </button>

      <Modal
        open={parsed !== null}
        onClose={() => !busy && setParsed(null)}
        title="Vérifier l'import"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setParsed(null)} disabled={busy}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={confirm} disabled={busy || !parsed?.fresh.length}>
              {busy ? <Spinner /> : <Download className="size-4.5" aria-hidden />}
              Importer {parsed?.fresh.length ? plural(parsed.fresh.length, 'entrée') : ''}
            </button>
          </div>
        }
      >
        {parsed && (
          <div className="space-y-3 text-[15px]">
            <p className="text-muted break-all">{parsed.fileName}</p>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2">
                <Check className="size-4.5 text-success" aria-hidden />
                {importSummary(parsed.fresh)}
              </li>
              {parsed.duplicates > 0 && (
                <li className="flex items-center gap-2 text-muted">
                  <X className="size-4.5" aria-hidden />
                  {plural(parsed.duplicates, 'doublon ignoré', 'doublons ignorés')} (déjà présents dans la même catégorie)
                </li>
              )}
              {((parsed.progress && parsed.progress.size > 0) || parsed.fresh.some((r) => r.progress)) && (
                <li className="flex items-center gap-2 text-muted">
                  <Check className="size-4.5" aria-hidden />
                  Progression restaurée pour les mots importés
                </li>
              )}
            </ul>
            {parsed.issues.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900">
                <p className="font-semibold">{plural(parsed.issues.length, 'ligne ignorée', 'lignes ignorées')} :</p>
                <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                  {parsed.issues.slice(0, 50).map((i, k) => (
                    <li key={k}>
                      {i.line > 0 ? `Ligne ${i.line} : ` : ''}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {parsed.fresh.length > 0 && (
              <div className="rounded-xl border border-line">
                <p className="border-b border-line px-3.5 py-2 text-xs font-semibold tracking-wide text-muted uppercase">Aperçu</p>
                <ul className="divide-y divide-line">
                  {parsed.fresh.slice(0, 5).map((r, k) => (
                    <li key={k} className="px-3.5 py-2.5">
                      <span className="font-medium">{r.kind === 'question' ? `Question · ${r.term}` : r.term}</span>
                      {r.category && <span className="text-muted"> · {r.category}</span>}
                      <span className="block truncate text-sm text-muted">{r.definition}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Section>
  )
}

function importSummary(rows: ImportRow[]) {
  const questions = rows.filter((r) => r.kind === 'question').length
  const words = rows.length - questions
  const parts = []
  if (words > 0 || questions === 0) parts.push(plural(words, 'nouveau mot', 'nouveaux mots'))
  if (questions > 0) parts.push(plural(questions, 'question de culture générale', 'questions de culture générale'))
  return `${parts.join(' et ')} prêt${rows.length > 1 ? 's' : ''} à être importé${rows.length > 1 ? 's' : ''}`
}

// ---------------------------------------------------------------------------

function CategoriesSection({ categories }: { categories: Category[] }) {
  const { words, renameCategory, deleteCategory } = useData()
  const notify = useToast()
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)
  const [busy, setBusy] = useState(false)
  const count = (id: string) => words.filter((w) => w.categoryId === id).length

  const saveRename = async () => {
    if (!editing || !editing.name.trim()) return
    setBusy(true)
    try {
      await renameCategory(editing.id, editing.name)
      setEditing(null)
      notify('Catégorie renommée')
    } catch (e) {
      notify(errorMessage(e).replace('Ce mot existe', 'Cette catégorie existe'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setBusy(true)
    try {
      await deleteCategory(toDelete.id)
      notify('Catégorie supprimée')
      setToDelete(null)
    } catch (e) {
      notify(
        errorMessage(e).startsWith('Ce mot existe')
          ? 'Impossible : un de ses mots existe déjà sans catégorie. Modifiez-le d’abord.'
          : errorMessage(e),
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Catégories" description="Les catégories sont créées automatiquement quand vous les saisissez dans un mot.">
      {categories.length === 0 ? (
        <p className="text-[15px] text-muted">Aucune catégorie pour l'instant.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {categories.map((c) => (
            <li key={c.id} className="flex min-h-14 items-center gap-2 px-2 py-1.5">
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void saveRename()
                  }}
                >
                  <input
                    className="field py-2"
                    value={editing.name}
                    maxLength={60}
                    autoFocus
                    aria-label="Nouveau nom de la catégorie"
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  />
                  <button type="submit" className="icon-btn text-brand" aria-label="Valider" disabled={busy}>
                    {busy ? <Spinner /> : <Check className="size-5" />}
                  </button>
                  <button type="button" className="icon-btn" aria-label="Annuler" onClick={() => setEditing(null)}>
                    <X className="size-5" />
                  </button>
                </form>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{c.name}</span>
                    <span className="block text-sm text-muted">{plural(count(c.id), 'mot')}</span>
                  </span>
                  <button type="button" className="icon-btn" aria-label={`Renommer ${c.name}`} onClick={() => setEditing({ id: c.id, name: c.name })}>
                    <Pencil className="size-4.5" />
                  </button>
                  <button type="button" className="icon-btn hover:text-danger" aria-label={`Supprimer ${c.name}`} onClick={() => setToDelete(c)}>
                    <Trash2 className="size-4.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette catégorie ?"
        message={
          <>
            Les mots de <strong className="text-ink">{toDelete?.name}</strong> sont conservés et passent « sans catégorie ».
          </>
        }
        confirmLabel="Supprimer la catégorie"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Section>
  )
}
