import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router'
import { Layout, Logo } from './components/Layout'
import { WordDialogsProvider } from './components/WordDialogs'
import { Spinner } from './components/ui'
import { DictionaryPage } from './pages/Dictionary'
import { HomePage } from './pages/Home'
import { ProgressPage } from './pages/Progress'
import { QuizPlayPage } from './pages/QuizPlay'
import { QuizResultPage } from './pages/QuizResult'
import { QuizSetupPage } from './pages/QuizSetup'
import { SettingsPage } from './pages/Settings'
import { UnlockPage } from './pages/Unlock'
import { LocalRepository } from './data/local'
import { DataProvider, useData } from './state/data'
import { QuizProvider } from './state/quiz'
import { ToastProvider } from './state/toast'

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4" role="status">
      <Logo />
      <Spinner className="size-5 text-brand" />
      <span className="sr-only">Chargement…</span>
    </div>
  )
}

function DataGate() {
  const { loading, error, reload } = useData()
  if (loading) return <FullScreenLoader />
  if (error)
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="card max-w-sm p-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-muted">
            <TriangleAlert className="size-6" aria-hidden />
          </div>
          <h1 className="text-lg font-semibold">Impossible de lire vos mots</h1>
          <p className="mt-1.5 text-[15px] text-muted">Le stockage de l'appareil n'a pas répondu. Réessayez, ou fermez les autres onglets de Lexio.</p>
          <p className="mt-2 text-xs break-words text-slate-400">{error}</p>
          <button type="button" className="btn-primary mt-5" onClick={reload}>
            <RefreshCw className="size-4.5" aria-hidden />
            Réessayer
          </button>
        </div>
      </div>
    )

  return (
    <QuizProvider>
      <WordDialogsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="dictionnaire" element={<DictionaryPage />} />
            <Route path="quiz" element={<QuizSetupPage />} />
            <Route path="quiz/session" element={<QuizPlayPage />} />
            <Route path="quiz/resultat" element={<QuizResultPage />} />
            <Route path="progression" element={<ProgressPage />} />
            <Route path="reglages" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </WordDialogsProvider>
    </QuizProvider>
  )
}

function Gate() {
  // undefined : vérification d'un espace déjà ouvert dans cet onglet ; null : code à saisir
  const [repo, setRepo] = useState<LocalRepository | null | undefined>(undefined)
  useEffect(() => {
    void LocalRepository.resume().then(setRepo)
  }, [])
  const navigate = useNavigate()
  // l'espace suivant s'ouvre sur l'accueil, pas sur la page de l'espace précédent
  const lock = useCallback(() => {
    setRepo(null)
    navigate('/', { replace: true })
  }, [navigate])
  if (repo === undefined) return <FullScreenLoader />
  if (repo === null) return <UnlockPage onOpen={setRepo} />
  return (
    <DataProvider key={repo.spaceId} repo={repo} onLock={lock}>
      <DataGate />
    </DataProvider>
  )
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </BrowserRouter>
  )
}
