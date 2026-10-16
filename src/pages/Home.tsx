import type { ReactNode } from 'react'
import { ArrowRight, BookPlus, CalendarCheck, Flame, GraduationCap, Library, Play, Plus, RotateCcw, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useWordDialogs } from '../components/WordDialogs'
import { EmptyState, plural } from '../components/ui'
import { useData } from '../state/data'
import { SMART_REVIEW, useQuiz } from '../state/quiz'
import { useLastBackup } from '../state/settings'
import { useStats } from '../state/stats'

export function HomePage() {
  const { words } = useData()
  const stats = useStats()
  const { openNew } = useWordDialogs()
  const { run, start } = useQuiz()
  const navigate = useNavigate()
  const activeRun = run && !run.finishedAt ? run : null
  const [lastBackup] = useLastBackup()
  const backupDue = words.length >= 10 && (!lastBackup || Date.now() - new Date(lastBackup).getTime() > 30 * 86_400_000)

  const reviewNow = () => {
    if (activeRun) return navigate('/quiz')
    if (start(SMART_REVIEW)) navigate('/quiz/session')
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-7 md:mb-9">
        <p className="text-sm font-medium text-brand">{greeting()}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-bold tracking-tight text-balance md:text-4xl">Un mot de plus, chaque jour.</h1>
      </header>

      {words.length === 0 ? (
        <EmptyState
          icon={<BookPlus className="size-7" />}
          title="Votre dictionnaire vous attend"
          action={
            <button type="button" className="btn-primary px-6" onClick={openNew}>
              <Plus className="size-4.5" aria-hidden />
              Ajouter mon premier mot
            </button>
          }
        >
          Notez un mot découvert aujourd'hui avec sa définition. Lexio en fera automatiquement des quiz pour vous aider à le retenir.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {activeRun && (
            <Link
              to="/quiz"
              className="card flex items-center gap-4 border-brand/30 bg-brand-soft/60 p-4 transition-colors hover:bg-brand-soft"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                <RotateCcw className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Session en cours</span>
                <span className="block text-sm text-muted">
                  Question {activeRun.index + 1} sur {activeRun.questions.length} — reprendre où vous en étiez
                </span>
              </span>
              <ArrowRight className="size-5 shrink-0 text-brand" aria-hidden />
            </Link>
          )}

          <dl className="grid grid-cols-3 gap-3">
            <Stat icon={<Library className="size-4.5" />} label="Mots enregistrés" value={stats.total} />
            <Stat icon={<GraduationCap className="size-4.5" />} label="Mots maîtrisés" value={stats.mastered} />
            <Stat
              icon={<Flame className={`size-4.5 ${stats.streak > 0 ? 'text-orange-500' : ''}`} />}
              label={stats.streak > 1 ? 'Jours d’affilée' : 'Jour d’affilée'}
              value={stats.streak}
            />
          </dl>

          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" className="btn-secondary h-14 text-base" onClick={openNew}>
              <Plus className="size-5 text-brand" aria-hidden />
              Ajouter un mot
            </button>
            <Link to="/quiz" className="btn-primary h-14 text-base">
              <Play className="size-5" aria-hidden />
              Commencer un quiz
            </Link>
          </div>

          <section aria-labelledby="due-title" className="card p-5 md:p-6">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                {stats.due > 0 ? <Sparkles className="size-5" aria-hidden /> : <CalendarCheck className="size-5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="due-title" className="font-semibold">
                  À réviser aujourd'hui
                </h2>
                {stats.due > 0 ? (
                  <p className="mt-0.5 text-[15px] text-muted">
                    <strong className="text-2xl font-bold text-ink">{stats.due.toLocaleString('fr-FR')}</strong>{' '}
                    {stats.due > 1 ? 'mots vous attendent' : 'mot vous attend'}. Quelques minutes suffisent.
                  </p>
                ) : (
                  <p className="mt-0.5 text-[15px] text-muted">
                    Tout est à jour{stats.studiedToday ? ', bravo' : ''}. Vos prochaines révisions arriveront d'elles-mêmes.
                  </p>
                )}
              </div>
            </div>
            {stats.due > 0 && (
              <button type="button" className="btn-primary mt-5 w-full sm:w-auto" onClick={reviewNow}>
                Réviser maintenant
                <ArrowRight className="size-4.5" aria-hidden />
              </button>
            )}
          </section>

          {backupDue && (
            <p className="text-center text-sm text-muted">
              Vos mots ne sont stockés que sur cet appareil.{' '}
              <Link to="/reglages" className="font-medium text-brand hover:underline">
                Faire une sauvegarde
              </Link>
            </p>
          )}

          {stats.streak > 0 && !stats.studiedToday && (
            <p className="text-center text-sm text-muted">
              Révisez aujourd'hui pour prolonger votre série de {plural(stats.streak, 'jour')}.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="card flex flex-col p-3.5 md:p-5">
      <dt className="order-2 mt-1 text-[12px] leading-tight text-muted md:text-sm">{label}</dt>
      <dd className="order-1 flex items-center justify-between gap-2">
        <span className="text-2xl font-bold tracking-tight tabular-nums md:text-3xl">{value.toLocaleString('fr-FR')}</span>
        <span className="hidden text-muted sm:inline" aria-hidden>
          {icon}
        </span>
      </dd>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h >= 5 && h < 18) return 'Bonjour'
  return 'Bonsoir'
}
