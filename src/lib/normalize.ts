/**
 * Normalisation des textes pour comparer une réponse saisie au mot attendu.
 * Tolère : majuscules, espaces superflus, apostrophes et tirets typographiques,
 * ponctuation finale, ligatures œ/æ. Les accents ne sont ignorés que si
 * `ignoreAccents` est vrai (réglage utilisateur).
 */
export function normalizeAnswer(input: string, ignoreAccents: boolean): string {
  let s = input
    .normalize('NFC')
    .toLocaleLowerCase('fr')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*(['-])\s*/g, '$1')
    .replace(/[.!?…;:,]+$/u, '')
    .trim()
  if (ignoreAccents) s = stripAccents(s)
  return s
}

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
}

/** Clé de comparaison « même texte » (doublons, définitions identiques). */
export function textKey(s: string): string {
  return s.normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim()
}

/** Clé de recherche : insensible à la casse et aux accents. */
export function searchKey(s: string): string {
  return stripAccents(s.toLocaleLowerCase('fr'))
}

export function isCorrectAnswer(given: string, accepted: string[], ignoreAccents: boolean): boolean {
  const g = normalizeAnswer(given, ignoreAccents)
  if (!g) return false
  return accepted.some((a) => normalizeAnswer(a, ignoreAccents) === g)
}
