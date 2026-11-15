import { useEffect, useState } from 'react'
import { useData } from './data'

/** Images déchiffrées, gardées le temps de l'onglet : identifiant d'espace + d'image → URL locale. */
const cache = new Map<string, Promise<string | null>>()

/** URL affichable de l'image d'une question (déchiffrée à la demande). `undefined` pendant le chargement. */
export function useImageUrl(imageId: string | null | undefined): string | null | undefined {
  const { repo, scope } = useData()
  const key = imageId ? `${scope}:${imageId}` : null
  const [state, setState] = useState<{ key: string | null; url: string | null | undefined }>({ key, url: undefined })

  useEffect(() => {
    if (!imageId || !key) return
    let alive = true
    let pending = cache.get(key)
    if (!pending) {
      pending = repo.getImage(imageId).then(
        (blob) => (blob ? URL.createObjectURL(blob) : null),
        () => null,
      )
      cache.set(key, pending)
    }
    void pending.then((url) => alive && setState({ key, url }))
    return () => {
      alive = false
    }
  }, [repo, imageId, key])

  if (!imageId) return null
  return state.key === key ? state.url : undefined
}
