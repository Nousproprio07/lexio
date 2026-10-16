import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DemoRepository } from '../data/demo'
import type { Repository } from '../data/repository'
import { supabase, supabaseConfigured, SupabaseRepository } from '../data/supabase'

const DEMO_FLAG = 'lexio:demo'

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'recovery' } // lien « mot de passe oublié » : choisir un nouveau mot de passe
  | { status: 'ready'; repo: Repository; scope: string; email: string | null }

interface AuthApi {
  state: AuthState
  enterDemo(): void
  exitDemo(): void
  signOut(): Promise<void>
  finishRecovery(): void
}

const AuthContext = createContext<AuthApi | null>(null)

const readDemoFlag = () => {
  try {
    return localStorage.getItem(DEMO_FLAG) === '1'
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(readDemoFlag)
  const [session, setSession] = useState<Session | null | undefined>(supabaseConfigured ? undefined : null)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const email = session?.user.email ?? null

  const state = useMemo<AuthState>(() => {
    if (demo) return { status: 'ready', repo: new DemoRepository(), scope: 'demo', email: null }
    if (session === undefined) return { status: 'loading' }
    if (recovery && session) return { status: 'recovery' }
    if (!session || !supabase || !userId) return { status: 'signedOut' }
    return { status: 'ready', repo: new SupabaseRepository(supabase), scope: userId, email }
    // le dépôt ne dépend que de l'identité, pas du rafraîchissement du jeton
  }, [demo, session === undefined, userId, recovery])

  const enterDemo = useCallback(() => {
    try {
      localStorage.setItem(DEMO_FLAG, '1')
    } catch {
      /* démo non mémorisée */
    }
    setDemo(true)
  }, [])

  const exitDemo = useCallback(() => {
    try {
      localStorage.removeItem(DEMO_FLAG)
    } catch {
      /* ignoré */
    }
    setDemo(false)
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
  }, [])

  const finishRecovery = useCallback(() => setRecovery(false), [])

  return (
    <AuthContext.Provider value={{ state, enterDemo, exitDemo, signOut, finishRecovery }}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth hors AuthProvider')
  return ctx
}
