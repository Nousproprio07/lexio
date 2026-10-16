/**
 * Espaces protégés par un code d'accès, sans serveur.
 *
 * Le code n'est jamais enregistré. On en dérive (PBKDF2-SHA-256) :
 *  - un identifiant d'espace, qui sert de clé de rangement sur l'appareil ;
 *  - une clé AES-GCM, qui chiffre le contenu de l'espace.
 * Sans le code, les mots stockés sont illisibles ; un autre code ouvre un autre espace.
 */

export const MIN_CODE_LENGTH = 4
const SALT = 'lexio:espace:v1'
const ITERATIONS = 210_000

export interface SpaceKey {
  /** Identifiant de rangement (hexadécimal), dérivé du code. */
  id: string
  key: CryptoKey
  /** Matériau brut, gardé le temps de l'onglet pour ne pas redemander le code à chaque rechargement. */
  raw: Uint8Array
}

export interface Sealed {
  v: 1
  iv: Uint8Array
  data: ArrayBuffer
}

export const normalizeCode = (code: string) => code.normalize('NFC').trim()

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')

export function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}

export { hex as toHex }

export async function importSpaceKey(raw: Uint8Array): Promise<SpaceKey> {
  const key = await crypto.subtle.importKey('raw', raw.slice(16, 48), 'AES-GCM', false, ['encrypt', 'decrypt'])
  return { id: hex(raw.slice(0, 16)), key, raw }
}

export async function deriveSpaceKey(code: string): Promise<SpaceKey> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(normalizeCode(code)), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITERATIONS }, base, 48 * 8)
  return importSpaceKey(new Uint8Array(bits))
}

export async function seal(space: SpaceKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, space.key, new TextEncoder().encode(JSON.stringify(value)))
  return { v: 1, iv, data }
}

export async function open<T>(space: SpaceKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(sealed.iv) }, space.key, sealed.data)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}
