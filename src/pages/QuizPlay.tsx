import { ArrowRight, Check, CircleCheck, CircleX, Eye, ThumbsUp, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ProgressBar } from '../components/ui'
import { isCorrectAnswer } from '../lib/normalize'
import { maskTerm, type Question, type QuestionResult } from '../lib/quiz'
import { useQuiz } from '../state/quiz'
import { useIgnoreAccents } from '../state/settings'

const LETTERS = ['A', 'B', 'C', 'D']

export function QuizPlayPage() {
  const { run, answer, next, reveal } = useQuiz()
  const navigate = useNavigate()

  if (!run) return <Navigate to="/quiz" replace />
  if (run.finishedAt) return <Navigate to="/quiz/resultat" replace />

  const q = run.questions[run.index]
  const result = run.results[run.index]
  const total = run.questions.length
  const isLast = run.index === total - 1
  const answeredCount = run.results.filter(Boolean).length

  const goNext = () => {
    next()
    if (isLast) navigate('/quiz/resultat')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <button type="button" className="icon-btn -ml-2 shrink-0" onClick={() => navigate('/quiz')} aria-label="Quitter la session (elle sera conservée)">
          <X className="size-5" />
        </button>
        <div className="flex-1">
          <ProgressBar value={(answeredCount / total) * 100} label="Progression de la session" />
        </div>
        <p className="shrink-0 text-sm font-semibold text-muted tabular-nums" aria-live="polite">
          Question {run.index + 1} sur {total}
        </p>
      </div>

      {/* la clé force une transition douce à chaque question */}
      <div key={q.id} className="animate-fade-up">
        {q.kind === 'word' && <WordQuestion q={q} result={result} onAnswer={answer} onNext={goNext} isLast={isLast} />}
        {q.kind === 'definition' && <ChoiceQuestion q={q} result={result} onAnswer={answer} onNext={goNext} isLast={isLast} />}
        {q.kind === 'recall' && (
          <RecallQuestion
            q={q}
            revealed={run.revealed}
            onReveal={reveal}
            onAnswer={(r) => {
              answer(r, true)
              if (isLast) navigate('/quiz/resultat')
            }}
          />
        )}
      </div>
    </div>
  )
}

interface QuestionProps {
  q: Question
  result: QuestionResult | null
  onAnswer: (r: QuestionResult) => void
  onNext: () => void
  isLast: boolean
}

function Prompt({ label, children, large }: { label: string; children: ReactNode; large?: boolean }) {
  return (
    <div className="card px-5 py-7 text-center md:px-10 md:py-10">
      <p className="text-xs font-semibold tracking-wider text-brand uppercase">{label}</p>
      <div
        className={`mx-auto mt-3 max-w-prose break-words text-balance ${
          large ? 'text-3xl font-bold tracking-tight md:text-4xl' : 'text-[17px] leading-relaxed font-medium md:text-xl md:leading-relaxed'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

/** Mode A : la définition est affichée, on saisit le mot. */
function WordQuestion({ q, result, onAnswer, onNext, isLast }: QuestionProps) {
  const [value, setValue] = useState('')
  const [ignoreAccents] = useIgnoreAccents()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!result) inputRef.current?.focus({ preventScroll: true })
  }, [result])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (result || !value.trim()) return
    onAnswer({ correct: isCorrectAnswer(value, q.accepted, ignoreAccents), given: value.trim() })
  }

  return (
    <div className="space-y-4">
      <Prompt label="Quel est ce mot ?">
        <p className="whitespace-pre-line">« {maskTerm(q.definition, q.term)} »</p>
        {q.categoryName && <p className="mt-3 text-sm font-normal text-muted">{q.categoryName}</p>}
      </Prompt>

      <form onSubmit={submit} className={result && !result.correct ? 'animate-shake' : ''}>
        <label htmlFor="answer" className="sr-only">
          Votre réponse
        </label>
        <input
          ref={inputRef}
          id="answer"
          className={`field h-14 text-center text-lg font-semibold ${
            result ? (result.correct ? 'border-success bg-success-soft text-green-900' : 'border-danger bg-danger-soft text-red-900 line-through decoration-2') : ''
          }`}
          placeholder="Votre réponse"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={!!result}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
        />
        {!result && (
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-ghost sm:w-auto"
              onClick={() => onAnswer({ correct: false, given: null })}
            >
              Je ne sais pas
            </button>
            <button type="submit" className="btn-primary h-12 flex-1 text-base" disabled={!value.trim()}>
              <Check className="size-5" aria-hidden />
              Valider <kbd className="kbd border-white/30 bg-white/15 text-white">Entrée</kbd>
            </button>
          </div>
        )}
      </form>

      {result && (
        <Feedback correct={result.correct} onNext={onNext} isLast={isLast}>
          <p className="text-2xl font-bold tracking-tight">{q.term}</p>
          <p className="mt-2 leading-relaxed whitespace-pre-line text-slate-700">{q.definition}</p>
          {q.example && <p className="mt-3 border-l-2 border-current/20 pl-3 text-[15px] leading-relaxed text-slate-600 italic">{q.example}</p>}
        </Feedback>
      )}
    </div>
  )
}

/** Mode B : le mot est affiché, on choisit parmi quatre définitions. */
function ChoiceQuestion({ q, result, onAnswer, onNext, isLast }: QuestionProps) {
  const [selected, setSelected] = useState<number | null>(null)

  const validate = () => {
    if (result || selected === null) return
    onAnswer({ correct: selected === q.correctIndex, given: q.options[selected].text })
  }

  // raccourcis : 1-4 / A-D pour choisir, Entrée pour valider
  useEffect(() => {
    if (result) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const k = e.key.toUpperCase()
      const i = /^[1-4]$/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k)
      if (i >= 0 && i < q.options.length) {
        e.preventDefault()
        setSelected(i)
      } else if (e.key === 'Enter' && selected !== null) {
        e.preventDefault()
        validate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="space-y-4">
      <Prompt label="Quelle est sa définition ?" large>
        {q.term}
      </Prompt>

      <div role="radiogroup" aria-label="Définitions proposées" className="space-y-2.5">
        {q.options.map((o, i) => {
          const isCorrect = i === q.correctIndex
          const isChosen = i === selected
          let tone = 'border-line bg-white hover:border-slate-300'
          if (!result && isChosen) tone = 'border-brand bg-brand-soft ring-1 ring-brand'
          if (result && isCorrect) tone = 'border-success bg-success-soft'
          else if (result && isChosen) tone = 'border-danger bg-danger-soft'
          else if (result) tone = 'border-line bg-white opacity-60'
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isChosen}
              disabled={!!result}
              onClick={() => setSelected(i)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left text-[15px] leading-relaxed transition-[border-color,background-color,opacity] disabled:cursor-default md:text-base ${tone}`}
            >
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                  result && isCorrect ? 'bg-success text-white' : result && isChosen ? 'bg-danger text-white' : isChosen ? 'bg-brand text-white' : 'bg-slate-100 text-muted'
                }`}
                aria-hidden
              >
                {result && isCorrect ? <Check className="size-4" /> : result && isChosen ? <X className="size-4" /> : LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1 break-words">
                {o.text}
                {result && !isCorrect && (
                  <span className="mt-1 block text-[13px] text-muted">Définition de « {o.term} »</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {!result && (
        <button type="button" className="btn-primary h-12 w-full text-base" disabled={selected === null} onClick={validate}>
          <Check className="size-5" aria-hidden />
          Valider <kbd className="kbd border-white/30 bg-white/15 text-white">Entrée</kbd>
        </button>
      )}

      {result && (
        <Feedback correct={result.correct} onNext={onNext} isLast={isLast}>
          <p className="text-xl font-bold tracking-tight">{q.term}</p>
          <p className="mt-1 leading-relaxed whitespace-pre-line text-slate-700">{q.definition}</p>
          {q.example && <p className="mt-3 border-l-2 border-current/20 pl-3 text-[15px] leading-relaxed text-slate-600 italic">{q.example}</p>}
        </Feedback>
      )}
    </div>
  )
}

/** Repli du mode B (moins de 4 définitions) : révéler puis s'auto-évaluer. */
function RecallQuestion({
  q,
  revealed,
  onReveal,
  onAnswer,
}: {
  q: Question
  revealed: boolean
  onReveal: () => void
  onAnswer: (r: QuestionResult) => void
}) {
  const revealRef = useRef<HTMLButtonElement>(null)
  const knewRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ;(revealed ? knewRef : revealRef).current?.focus({ preventScroll: true })
  }, [revealed])

  useEffect(() => {
    if (!revealed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (e.key === '1') onAnswer({ correct: true, given: null })
      if (e.key === '2') onAnswer({ correct: false, given: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, onAnswer])

  return (
    <div className="space-y-4">
      <Prompt label="Connaissez-vous sa définition ?" large>
        {q.term}
      </Prompt>

      {!revealed ? (
        <>
          <p className="text-center text-[15px] text-muted">Formulez-la mentalement, puis vérifiez.</p>
          <button ref={revealRef} type="button" className="btn-primary h-12 w-full text-base" onClick={onReveal}>
            <Eye className="size-5" aria-hidden />
            Afficher la définition
          </button>
        </>
      ) : (
        <>
          <div className="card animate-fade-up p-5">
            <p className="leading-relaxed whitespace-pre-line">{q.definition}</p>
            {q.example && <p className="mt-3 border-l-2 border-brand/30 pl-3 text-[15px] leading-relaxed text-slate-600 italic">{q.example}</p>}
          </div>
          <p className="text-center text-[15px] font-medium">Aviez-vous trouvé ?</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn h-12 border border-danger/30 bg-danger-soft text-red-800 hover:bg-red-100" onClick={() => onAnswer({ correct: false, given: null })}>
              <RotateCcw className="size-4.5" aria-hidden />À revoir <kbd className="kbd">2</kbd>
            </button>
            <button ref={knewRef} type="button" className="btn h-12 bg-success text-white hover:bg-green-700" onClick={() => onAnswer({ correct: true, given: null })}>
              <ThumbsUp className="size-4.5" aria-hidden />
              Je savais <kbd className="kbd border-white/30 bg-white/15 text-white">1</kbd>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Feedback({ correct, onNext, isLast, children }: { correct: boolean; onNext: () => void; isLast: boolean; children: ReactNode }) {
  const nextRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // le focus va sur « Question suivante » : Entrée enchaîne
    nextRef.current?.focus({ preventScroll: true })
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    nextRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [])

  return (
    <div className="animate-fade-up space-y-4">
      <div
        role="status"
        className={`rounded-2xl border p-5 ${correct ? 'border-success/30 bg-success-soft' : 'border-danger/25 bg-danger-soft'}`}
      >
        <p className={`mb-3 flex items-center gap-2 font-semibold ${correct ? 'text-green-700' : 'text-red-700'}`}>
          {correct ? <CircleCheck className="size-5" aria-hidden /> : <CircleX className="size-5" aria-hidden />}
          {correct ? 'Bonne réponse !' : 'Pas tout à fait. La bonne réponse :'}
        </p>
        {children}
      </div>
      <button ref={nextRef} type="button" className="btn-primary h-12 w-full text-base" onClick={onNext}>
        {isLast ? 'Voir mes résultats' : 'Question suivante'}
        <ArrowRight className="size-5" aria-hidden />
        <kbd className="kbd border-white/30 bg-white/15 text-white">Entrée</kbd>
      </button>
    </div>
  )
}
