import { BookOpen, ChartColumn, CloudOff, FlaskConical, House, Plus, Settings, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../state/auth'
import { useData } from '../state/data'
import { useWordDialogs } from './WordDialogs'

const NAV = [
  { to: '/', label: 'Accueil', icon: House, end: true },
  { to: '/dictionnaire', label: 'Dictionnaire', icon: BookOpen, end: false },
  { to: '/quiz', label: 'Quiz', icon: Sparkles, end: false },
  { to: '/progression', label: 'Progression', icon: ChartColumn, end: false },
]

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[19px] font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 512 512" className="size-7" aria-hidden>
        <rect width="512" height="512" rx="112" fill="#2563EB" />
        <path d="M176 136v240h160" fill="none" stroke="#fff" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="336" cy="168" r="28" fill="#BFDBFE" />
      </svg>
      Lexio
    </span>
  )
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function Layout() {
  const { repo, pendingSync } = useData()
  const { exitDemo } = useAuth()
  const { openNew } = useWordDialogs()
  const online = useOnline()
  const { pathname } = useLocation()
  const inQuiz = pathname.startsWith('/quiz/session')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh md:flex">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Aller au contenu
      </a>

      {/* Barre latérale (ordinateur) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-white px-4 py-6 md:flex">
        <Logo className="px-3" />
        <nav aria-label="Navigation principale" className="mt-8 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
                  isActive ? 'bg-brand-soft text-brand-dark' : 'text-muted hover:bg-slate-50 hover:text-ink'
                }`
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="btn-primary mt-6" onClick={openNew}>
          <Plus className="size-4.5" aria-hidden />
          Ajouter un mot
        </button>
        <div className="mt-auto">
          <NavLink
            to="/reglages"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors ${
                isActive ? 'bg-brand-soft text-brand-dark' : 'text-muted hover:bg-slate-50 hover:text-ink'
              }`
            }
          >
            <Settings className="size-5" aria-hidden />
            Réglages et données
          </NavLink>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* En-tête (mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-page/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center">
            <Logo />
          </div>
          <NavLink to="/reglages" className="icon-btn -mr-2" aria-label="Réglages et données">
            <Settings className="size-5" />
          </NavLink>
        </header>

        {repo.kind === 'demo' && (
          <Banner tone="amber" icon={<FlaskConical className="size-4 shrink-0" aria-hidden />}>
            Mode démonstration : données d'essai stockées uniquement dans ce navigateur, séparées de votre compte.{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={exitDemo}>
              Quitter la démo
            </button>
          </Banner>
        )}
        {(!online || pendingSync > 0) && (
          <Banner tone="slate" icon={<CloudOff className="size-4 shrink-0" aria-hidden />}>
            {!online ? 'Hors ligne. ' : ''}
            {pendingSync > 0
              ? 'Vos dernières réponses sont gardées sur cet appareil et seront synchronisées automatiquement.'
              : 'Vous pouvez réviser : les réponses seront synchronisées au retour du réseau.'}
          </Banner>
        )}

        <main
          id="contenu"
          className={`mx-auto w-full max-w-5xl px-4 pt-6 md:px-10 md:pt-10 md:pb-12 ${inQuiz ? 'pb-10' : 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]'}`}
        >
          <Outlet />
        </main>
      </div>

      {/* Navigation basse (mobile) — masquée pendant un quiz pour se concentrer */}
      {!inQuiz && (
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        >
          <ul className="grid grid-cols-4">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${isActive ? 'text-brand' : 'text-muted'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="size-5.5" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}

function Banner({ tone, icon, children }: { tone: 'amber' | 'slate'; icon: ReactNode; children: ReactNode }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2 px-4 py-2 text-[13px] leading-snug md:px-10 ${
        tone === 'amber' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-700'
      }`}
    >
      <span className="mt-0.5">{icon}</span>
      <p>{children}</p>
    </div>
  )
}
