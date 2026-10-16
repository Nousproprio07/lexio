import { FlaskConical, KeyRound, MailCheck, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Logo } from '../components/Layout'
import { Spinner } from '../components/ui'
import { supabase, supabaseConfigured } from '../data/supabase'
import { useAuth } from '../state/auth'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <Logo className="text-2xl" />
          <p className="mt-3 text-[15px] text-muted">Un mot de plus, chaque jour.</p>
        </div>
        {children}
      </div>
    </div>
  )
}

/** URL racine de l'application (tient compte d'un sous-chemin comme /lexio/). */
const appUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href

function translate(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.'
  if (/email not confirmed/i.test(message)) return 'Confirmez d’abord votre adresse via le lien reçu par e-mail.'
  if (/already registered/i.test(message)) return 'Un compte existe déjà avec cette adresse.'
  if (/password should be at least/i.test(message)) return 'Le mot de passe doit contenir au moins 8 caractères.'
  if (/signups not allowed|signup is disabled/i.test(message)) return 'Les inscriptions sont fermées sur cette instance.'
  if (/rate limit/i.test(message)) return 'Trop de tentatives. Patientez quelques minutes.'
  if (/fetch|network/i.test(message)) return 'Connexion au serveur impossible. Vérifiez votre réseau.'
  return message
}

export function AuthPage() {
  const { enterDemo } = useAuth()
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (!supabaseConfigured || !supabase) return <SetupNeeded onDemo={enterDemo} />
  const client = supabase

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setInfo(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Adresse e-mail invalide.')
    if (mode !== 'reset' && password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.')
    setBusy(true)
    try {
      if (mode === 'signIn') {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'signUp') {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: appUrl() } })
        if (error) throw error
        if (!data.session) setInfo('Compte créé. Ouvrez le lien de confirmation envoyé par e-mail, puis connectez-vous.')
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() })
        if (error) throw error
        setInfo('Si un compte existe pour cette adresse, un lien de réinitialisation vient d’être envoyé.')
      }
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} noValidate className="card space-y-4 p-6">
        <h1 className="text-lg font-semibold">
          {mode === 'signIn' ? 'Connexion' : mode === 'signUp' ? 'Créer votre compte' : 'Mot de passe oublié'}
        </h1>
        <div>
          <label htmlFor="email" className="label">
            E-mail
          </label>
          <input id="email" type="email" className="field" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {mode !== 'reset' && (
          <div>
            <label htmlFor="password" className="label">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              className="field"
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="flex gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand-dark">
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {info}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner />}
          {mode === 'signIn' ? 'Se connecter' : mode === 'signUp' ? 'Créer le compte' : 'Envoyer le lien'}
        </button>
        <div className="flex flex-col items-center gap-1 text-sm">
          {mode === 'signIn' ? (
            <>
              <button type="button" className="font-medium text-brand hover:underline" onClick={() => setMode('signUp')}>
                Créer un compte
              </button>
              <button type="button" className="text-muted hover:underline" onClick={() => setMode('reset')}>
                Mot de passe oublié ?
              </button>
            </>
          ) : (
            <button type="button" className="font-medium text-brand hover:underline" onClick={() => setMode('signIn')}>
              J'ai déjà un compte
            </button>
          )}
        </div>
      </form>
      <DemoLink onDemo={enterDemo} />
    </Shell>
  )
}

function DemoLink({ onDemo }: { onDemo: () => void }) {
  return (
    <button type="button" className="btn-ghost mx-auto mt-4 flex text-sm" onClick={onDemo}>
      <FlaskConical className="size-4" aria-hidden />
      Essayer en mode démonstration
    </button>
  )
}

function SetupNeeded({ onDemo }: { onDemo: () => void }) {
  return (
    <Shell>
      <div className="card p-6">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <TriangleAlert className="size-5" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold">Base de données non configurée</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
          Renseignez <code className="rounded bg-slate-100 px-1 text-[13px]">VITE_SUPABASE_URL</code> et{' '}
          <code className="rounded bg-slate-100 px-1 text-[13px]">VITE_SUPABASE_ANON_KEY</code> (voir le README), puis relancez l'application.
        </p>
      </div>
      <DemoLink onDemo={onDemo} />
    </Shell>
  )
}

/** Après un lien « mot de passe oublié » : choisir un nouveau mot de passe. */
export function NewPasswordPage() {
  const { finishRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.')
    setBusy(true)
    const { error } = await supabase!.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(translate(error.message))
    else finishRecovery()
  }

  return (
    <Shell>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-5 text-brand" aria-hidden />
          Nouveau mot de passe
        </h1>
        <input
          type="password"
          className="field"
          aria-label="Nouveau mot de passe"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner />}
          Enregistrer
        </button>
      </form>
    </Shell>
  )
}
