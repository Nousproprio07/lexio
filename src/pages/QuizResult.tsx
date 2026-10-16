import { CircleCheck, CircleX, House, RotateCcw, Target } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router'
import { useWordDialogs } from '../components/WordDialogs'
import { plural } from '../components/ui'
import { computeScore } from '../lib/quiz'
import { useData } from '../state/data'
import { useQuiz } from '../state/quiz'

export function QuizResultPage() {
  const { run, start, abandon } = useQuiz()
  const { wordById } = useData()
  const { openDetail } = useWordDialogs()
  const navigate = useNavigate()

  if (!run) return <Navigate to="/quiz" replace />
  if (!run.finishedAt) return <Navigate to="/quiz/session" replace />

  const score = computeScore(run.results)
  const pairs = run.questions.map((q, i) => ({ q, r: run.results[i] }))
  const success = pairs.filter((p) => p.r?.correct)
  const toReview = pairs.filter((p) => p.r && !p.r.correct)
  const reviewIds = toReview.map((p) => p.q.wordId).filter((id) => wordById.has(id))

  const message =
    score.percent >= 90 ? 'Excellent travail !' : score.percent >= 70 ? 'Très bien, continuez ainsi.' : score.percent >= 40 ? 'Bon entraînement.' : 'Chaque erreur est une révision utile.'

  const relaunch = (ids: string[] | null) => {
    if (start(run.config, ids)) navigate('/quiz/session')
    else navigate('/quiz')
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-up">
      <section className="card px-6 py-8 text-center md:py-10" aria-labelledby="score-title">
        <ScoreRing percent={score.percent} />
        <h1 id="score-title" className="mt-5 text-2xl font-bold tracking-tight">
          {message}
        </h1>
        <p className="mt-1 text-[15px] text-muted">
          <strong className="text-ink">
            {score.correct} / {score.evaluated}
          </strong>{' '}
          {score.evaluated > 1 ? 'bonnes réponses' : 'bonne réponse'}
        </p>
      </section>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <button type="button" className="btn-primary h-12" onClick={() => relaunch(run.wordIds)}>
          <RotateCcw className="size-4.5" aria-hidden />
          Recommencer
        </button>
        {reviewIds.length > 0 && (
          <button type="button" className="btn-secondary h-12" onClick={() => relaunch(reviewIds)}>
            <Target className="size-4.5 text-brand" aria-hidden />
            Réviser mes erreurs
          </button>
        )}
        <button
          type="button"
          className={`btn-secondary h-12 ${reviewIds.length === 0 ? 'sm:col-span-2' : ''}`}
          onClick={() => {
            abandon()
            navigate('/')
          }}
        >
          <House className="size-4.5" aria-hidden />
          Retour à l'accueil
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <WordList
          title={`À retravailler · ${toReview.length}`}
          tone="danger"
          empty="Aucune erreur, bravo !"
          items={toReview.map((p) => ({ id: p.q.id, wordId: p.q.wordId, term: p.q.term, detail: p.r?.given ? `Votre réponse : ${p.r.given}` : null }))}
          onOpen={(id) => {
            const w = wordById.get(id)
            if (w) openDetail(w)
          }}
        />
        <WordList
          title={`Réussis · ${success.length}`}
          tone="success"
          empty="Pas encore de réussite cette fois."
          items={success.map((p) => ({ id: p.q.id, wordId: p.q.wordId, term: p.q.term, detail: null }))}
          onOpen={(id) => {
            const w = wordById.get(id)
            if (w) openDetail(w)
          }}
        />
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        {plural(score.evaluated, 'réponse enregistrée', 'réponses enregistrées')} dans votre progression.
      </p>
    </div>
  )
}

function ScoreRing({ percent }: { percent: number }) {
  const r = 52
  const c = 2 * Math.PI * r
  const color = percent >= 70 ? '#16A34A' : percent >= 40 ? '#2563EB' : '#DC2626'
  return (
    <div className="relative mx-auto size-36" role="img" aria-label={`${percent} % de réussite`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EFF6FF" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-3xl font-bold tracking-tight tabular-nums">{percent} %</span>
    </div>
  )
}

function WordList({
  title,
  tone,
  empty,
  items,
  onOpen,
}: {
  title: string
  tone: 'success' | 'danger'
  empty: string
  items: { id: string; wordId: string; term: string; detail: string | null }[]
  onOpen: (wordId: string) => void
}) {
  const Icon = tone === 'success' ? CircleCheck : CircleX
  return (
    <section className="card p-5">
      <h2 className={`mb-3 flex items-center gap-2 font-semibold ${tone === 'success' ? 'text-green-700' : 'text-red-700'}`}>
        <Icon className="size-5" aria-hidden />
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="-mx-2">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => onOpen(it.wordId)} className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50">
                <span className="block font-medium break-words">{it.term}</span>
                {it.detail && <span className="block truncate text-sm text-muted">{it.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
