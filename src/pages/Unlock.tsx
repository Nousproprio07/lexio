import { Eye, EyeOff, KeyRound, LockKeyhole, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Logo } from '../components/Layout'
import { plural, Spinner } from '../components/ui'
import { LocalRepository } from '../data/local'
import { MIN_CODE_LENGTH, normalizeCode } from '../data/space'

type Step = 'enter' | 'create'

/** Écran d'accès : un code ouvre l'espace qui lui correspond sur cet appareil. */
export function UnlockPage({ onOpen }: { onOpen(repo: LocalRepository): void }) {
  const [step, setStep] = useState<Step>('enter')
  const [unclaimed, setUnclaimed] = useState(0)
  const [code, setCode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)

  // des mots enregistrés avant les codes d'accès : on propose d'abord de leur créer un espace
  useEffect(() => {
    void LocalRepository.unclaimedWordCount().then((n) => {
      setUnclaimed(n)
      if (n > 0) setStep('create')
    })
  }, [])

  useEffect(() => {
    codeRef.current?.focus()
  }, [step])

  const switchTo = (next: Step) => {
    setStep(next)
    setConfirm('')
    setError(null)
    setNotFound(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotFound(false)
    const clean = normalizeCode(code)
    if (clean.length < MIN_CODE_LENGTH) {
      setError(`Le code doit faire au moins ${MIN_CODE_LENGTH} caractères.`)
      return
    }
    if (step === 'create' && clean !== normalizeCode(confirm)) {
      setError('Les deux codes ne sont pas identiques.')
      return
    }
    setBusy(true)
    try {
      const res = await LocalRepository.unlock(clean, { create: step === 'create' })
      if (res.ok) {
        onOpen(res.repo)
        return
      }
      setNotFound(true)
      setError('Aucun espace ne correspond à ce code sur cet appareil.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const creating = step === 'create'
  const inputType = visible ? 'text' : 'password'

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form className="card space-y-5 p-6" onSubmit={submit} noValidate>
          <div className="text-center">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              {creating ? <KeyRound className="size-6" aria-hidden /> : <LockKeyhole className="size-6" aria-hidden />}
            </div>
            <h1 className="text-xl font-semibold">{creating ? 'Créer votre espace' : 'Votre espace Lexio'}</h1>
            <p className="mt-1.5 text-[15px] text-muted">
              {creating ? 'Choisissez le code qui ouvrira votre dictionnaire.' : 'Tapez votre code pour retrouver vos mots.'}
            </p>
          </div>

          {creating && unclaimed > 0 && (
            <p className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand-dark">
              {unclaimed > 1 ? `Les ${plural(unclaimed, 'mot')} déjà enregistrés` : 'Le mot déjà enregistré'} sur cet appareil{' '}
              {unclaimed > 1 ? 'seront rangés' : 'sera rangé'} dans ce nouvel espace.
            </p>
          )}

          <div>
            <label htmlFor="code" className="label">
              {creating ? 'Nouveau code' : 'Code d’accès'}
            </label>
            <div className="relative">
              <input
                ref={codeRef}
                id="code"
                className="field pr-12"
                type={inputType}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  setError(null)
                }}
                autoComplete={creating ? 'new-password' : 'current-password'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'code-error' : creating ? 'code-hint' : undefined}
              />
              <button
                type="button"
                className="icon-btn absolute inset-y-0 right-1 my-auto"
                onClick={() => setVisible((v) => !v)}
                aria-label={visible ? 'Masquer le code' : 'Afficher le code'}
                aria-pressed={visible}
              >
                {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
              </button>
            </div>
            {creating && (
              <p id="code-hint" className="mt-1.5 text-sm text-muted">
                Au moins {MIN_CODE_LENGTH} caractères. Majuscules et minuscules comptent.
              </p>
            )}
          </div>

          {creating && (
            <div>
              <label htmlFor="code-confirm" className="label">
                Confirmez le code
              </label>
              <input
                id="code-confirm"
                className="field"
                type={inputType}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setError(null)
                }}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
              />
            </div>
          )}

          {error && (
            <p id="code-error" className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner />}
            {creating ? 'Créer mon espace' : 'Ouvrir mon espace'}
          </button>

          {creating ? (
            <p className="text-sm text-muted">
              Notez ce code : il n’est enregistré nulle part et personne ne peut le retrouver. Sans lui, l’espace ne peut plus être ouvert.
            </p>
          ) : null}
        </form>

        <div className="mt-4 text-center">
          {creating ? (
            <button type="button" className="btn-ghost" onClick={() => switchTo('enter')}>
              J’ai déjà un code
            </button>
          ) : (
            <button type="button" className={notFound ? 'btn-secondary' : 'btn-ghost'} onClick={() => switchTo('create')}>
              <Plus className="size-4.5" aria-hidden />
              Créer un nouvel espace
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          Le code ne fonctionne que sur cet appareil : vos mots restent dans ce navigateur, chiffrés, et ne sont envoyés nulle part.
        </p>
      </div>
    </main>
  )
}
