/**
 * File d'attente des écritures de quiz (session, réponses, progression).
 *
 * Pendant un quiz, chaque réponse est appliquée immédiatement à l'écran puis
 * envoyée en arrière-plan. Si le réseau coupe (métro, mode avion…), les
 * écritures restent dans cette file, conservée dans le navigateur, et sont
 * rejouées dans l'ordre dès que la connexion revient. Toutes les opérations
 * sont idempotentes (identifiants générés côté client, upserts), donc les
 * rejouer deux fois est sans danger.
 */
import type { QuizAnswer, QuizSession, WordProgress } from '../lib/types'
import type { Repository } from './repository'

export type OutboxOp =
  | { kind: 'session'; session: QuizSession }
  | { kind: 'answers'; answers: QuizAnswer[] }
  | { kind: 'progress'; items: WordProgress[] }

export class Outbox {
  private queue: OutboxOp[] = []
  private flushing: Promise<void> | null = null
  private listeners = new Set<(pending: number) => void>()
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private failures = 0

  constructor(
    private repo: Repository,
    private storageKey: string,
  ) {
    try {
      this.queue = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as OutboxOp[]
    } catch {
      this.queue = []
    }
    window.addEventListener('online', this.onOnline)
  }

  dispose() {
    window.removeEventListener('online', this.onOnline)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.listeners.clear()
  }

  private onOnline = () => void this.flush()

  get pending() {
    return this.queue.length
  }

  subscribe(fn: (pending: number) => void) {
    this.listeners.add(fn)
    fn(this.queue.length)
    return () => void this.listeners.delete(fn)
  }

  private persist() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue))
    } catch {
      /* stockage plein ou indisponible : la file reste en mémoire */
    }
    for (const l of this.listeners) l(this.queue.length)
  }

  private setAside(op: OutboxOp, e: unknown) {
    try {
      const key = `${this.storageKey}:rejected`
      const list = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]
      list.push({ op, error: String(e), at: new Date().toISOString() })
      localStorage.setItem(key, JSON.stringify(list.slice(-200)))
    } catch {
      /* ignoré */
    }
  }

  push(...ops: OutboxOp[]) {
    this.queue.push(...ops)
    this.persist()
    void this.flush()
  }

  /** Envoie les opérations en attente, dans l'ordre. Ne lève jamais. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.run().finally(() => (this.flushing = null))
    }
    return this.flushing
  }

  private async run() {
    while (this.queue.length > 0) {
      const op = this.queue[0]
      try {
        if (op.kind === 'session') await this.repo.upsertSession(op.session)
        else if (op.kind === 'answers') await this.repo.insertAnswers(op.answers)
        else await this.repo.upsertProgress(op.items)
      } catch (e) {
        // Hors ligne : on attend simplement le retour du réseau.
        // En ligne, une opération refusée à répétition est mise de côté
        // (conservée dans le navigateur) pour ne pas bloquer les suivantes.
        if (navigator.onLine && ++this.failures >= 5) {
          this.setAside(op, e)
        } else {
          if (this.retryTimer) clearTimeout(this.retryTimer)
          this.retryTimer = setTimeout(() => void this.flush(), 15_000)
          return
        }
      }
      this.failures = 0
      this.queue.shift()
      this.persist()
    }
  }
}
