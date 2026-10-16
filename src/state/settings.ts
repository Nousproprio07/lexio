import { useCallback, useSyncExternalStore } from 'react'

/** Préférences propres à l'appareil (confort), conservées dans le navigateur. */
const KEY = 'lexio:ignoreAccents'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0' // tolérance des accents activée par défaut
  } catch {
    return true
  }
}

export function useIgnoreAccents(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => void listeners.delete(cb)),
    read,
    () => true,
  )
  const set = useCallback((v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? '1' : '0')
    } catch {
      /* ignoré */
    }
    listeners.forEach((l) => l())
  }, [])
  return [value, set]
}
