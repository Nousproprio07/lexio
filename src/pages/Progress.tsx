import { ChartColumn, Flame, GraduationCap, Library, Target, Trophy } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useWordDialogs } from '../components/WordDialogs'
import { EmptyState, PageHeader, plural, StatusBadge } from '../components/ui'
import { hardestWords } from '../lib/quiz'
import { MODE_LABELS, type QuizSession } from '../lib/types'
import { useData } from '../state/data'
import { useQuiz } from '../state/quiz'
import { useStats } from '../state/stats'

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export function ProgressPage() {
  const stats = useStats()
  const { words, progress } = useData()
  const { run, start } = useQuiz()
  const { openDetail } = useWordDialogs()
  const navigate = useNavigate()
  const hardest = useMemo(() => hardestWords(words, progress, 5), [words, progress])

  const reviewHardest = () => {
    if (run && !run.finishedAt) return navigate('/quiz')
    const ok = start(
      { mode: 'word', size: 'all', filters: { categoryId: null, onlyUnmastered: false, smart: false } },
      hardest.map((w) => w.id),
    )
    if (ok) navigate('/quiz/session')
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Progression" />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat icon={<Library />} label="Mots enregistrés" value={stats.total.toLocaleString('fr-FR')} />
        <Stat icon={<GraduationCap />} label="Mots maîtrisés" value={stats.mastered.toLocaleString('fr-FR')} />
        <Stat icon={<Target />} label="Taux de réussite" value={stats.successRate === null ? '—' : `${stats.successRate} %`} />
        <Stat icon={<Trophy />} label="Quiz terminés" value={stats.finishedCount.toLocaleString('fr-FR')} />
        <Stat icon={<Flame />} label="Série en cours" value={plural(stats.streak, 'jour')} wide />
      </dl>

      <section className="card mt-5 p-5 md:p-6" aria-labelledby="chart-title">
        <h2 id="chart-title" className="font-semibold">
          Réussite des dernières sessions
        </h2>
        <p className="mt-0.5 text-sm text-muted">Pourcentage de bonnes réponses par quiz terminé</p>
        {stats.recent.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon={<ChartColumn className="size-7" />} title="Pas encore de session terminée">
              Vos résultats apparaîtront ici après votre premier quiz.
            </EmptyState>
          </div>
        ) : (
          <SessionChart sessions={stats.recent} />
        )}
      </section>

      <section className="card mt-5 p-5 md:p-6" aria-labelledby="hard-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="hard-title" className="font-semibold">
              Mots les plus difficiles
            </h2>
            <p className="mt-0.5 text-sm text-muted">Ceux qui vous résistent le plus</p>
          </div>
          {hardest.length > 0 && (
            <button type="button" className="btn-primary" onClick={reviewHardest}>
              <Target className="size-4.5" aria-hidden />
              Réviser ces mots
            </button>
          )}
        </div>
        {hardest.length === 0 ? (
          <p className="mt-4 text-[15px] text-muted">Aucun mot difficile pour l'instant. Ils apparaîtront ici après vos premières erreurs.</p>
        ) : (
          <ul className="-mx-2 mt-3 divide-y divide-line">
            {hardest.map((w) => {
              const p = progress.get(w.id)!
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(w)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-words">{w.term}</span>
                      <span className="block text-sm text-muted">
                        {plural(p.failures, 'erreur')} · {plural(p.successes, 'réussite')}
                      </span>
                    </span>
                    <StatusBadge status={p.status} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ icon, label, value, wide }: { icon: ReactNode; label: string; value: string; wide?: boolean }) {
  return (
    <div className={`card p-4 md:p-5 ${wide ? 'col-span-2 md:col-span-1' : ''}`}>
      <dt className="flex items-center gap-1.5 text-[13px] text-muted [&_svg]:size-4">
        <span aria-hidden>{icon}</span>
        {label}
      </dt>
      <dd className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</dd>
    </div>
  )
}

/** Histogramme sobre : une série, une teinte, info-bulle au survol / focus, tableau pour les lecteurs d'écran. */
function SessionChart({ sessions }: { sessions: QuizSession[] }) {
  const [active, setActive] = useState<number | null>(null)
  const data = sessions.map((s) => ({ s, pct: Math.round((s.correctCount / s.answeredCount) * 100) }))
  const H = 160

  return (
    <div className="mt-5">
      <div className="relative" onMouseLeave={() => setActive(null)}>
        {/* grille discrète */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }} aria-hidden>
          {[100, 50, 0].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-9 text-right text-[11px] text-muted tabular-nums">{v} %</span>
              <span className={`h-px flex-1 ${v === 0 ? 'bg-slate-300' : 'bg-line'}`} />
            </div>
          ))}
        </div>
        <div className="relative ml-11 flex items-end gap-1.5 sm:gap-3" style={{ height: H }} aria-hidden>
          {data.map(({ s, pct }, i) => (
            <button
              key={s.id}
              type="button"
              tabIndex={-1}
              className="group relative flex h-full flex-1 items-end justify-center"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <span
                className={`w-full max-w-7 rounded-t-[4px] transition-colors ${active === i ? 'bg-brand-dark' : 'bg-brand'}`}
                style={{ height: `${Math.max(pct, 1.5)}%` }}
              />
            </button>
          ))}
        </div>
        {active !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-(--shadow-pop)"
            style={{
              left: `calc(2.75rem + (100% - 2.75rem) * ${(active + 0.5) / data.length})`,
              bottom: H - (H * data[active].pct) / 100 + 8,
            }}
          >
            <p className="font-semibold whitespace-nowrap">
              {data[active].pct} % · {data[active].s.correctCount}/{data[active].s.answeredCount}
            </p>
            <p className="whitespace-nowrap text-slate-300">{dayFmt.format(new Date(data[active].s.startedAt))} · {MODE_LABELS[data[active].s.mode]}</p>
          </div>
        )}
        <div className="mt-2 ml-11 flex justify-between text-[11px] text-muted" aria-hidden>
          <span>{dayFmt.format(new Date(data[0].s.startedAt))}</span>
          {data.length > 1 && <span>{dayFmt.format(new Date(data[data.length - 1].s.startedAt))}</span>}
        </div>
      </div>

      <table className="sr-only">
        <caption>Résultats des dernières sessions</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Exercice</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map(({ s, pct }) => (
            <tr key={s.id}>
              <td>{fullFmt.format(new Date(s.startedAt))}</td>
              <td>{MODE_LABELS[s.mode]}</td>
              <td>
                {s.correctCount} sur {s.answeredCount} ({pct} %)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
