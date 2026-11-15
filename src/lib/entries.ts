/**
 * Règles communes aux mots et aux questions de culture générale.
 */
import { textKey } from './normalize'
import { entryKind, isQuestion, type Word } from './types'

type EntryLike = Pick<Word, 'kind' | 'term' | 'definition' | 'categoryId' | 'imageId'>

/**
 * Doublon : même nature et même catégorie, puis
 *  - mot : même intitulé ;
 *  - question : même question, même réponse et même image (deux tableaux
 *    différents de Monet sont deux questions distinctes).
 */
export function sameEntry(a: EntryLike, b: EntryLike): boolean {
  if (entryKind(a) !== entryKind(b) || (a.categoryId ?? null) !== (b.categoryId ?? null)) return false
  if (textKey(a.term) !== textKey(b.term)) return false
  return !isQuestion(a) || (textKey(a.definition) === textKey(b.definition) && (a.imageId ?? null) === (b.imageId ?? null))
}

/** La question désigne l'image (« Qui est-ce ? », « ce tableau »…) : l'image en est l'indice. */
export function questionRefersToImage(question: string): boolean {
  return /\b(?:qui est-ce|c'est qui|ce (?:tableau|monument|lieu|personnage|bâtiment|portrait|paysage|site|musée|château|pont|édifice)|cette (?:œuvre|oeuvre|personne|peinture|sculpture|statue|photo|image|ville|église|cathédrale|place)|ces? (?:personnes|monuments))\b/iu.test(
    question.replace(/[’]/g, "'"),
  )
}

/** « Monet, C. Monet » → ['Monet', 'C. Monet'] (vides et doublons retirés). */
export function parseAlternates(text: string): string[] {
  const seen = new Set<string>()
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s && !seen.has(textKey(s)) && seen.add(textKey(s)))
}

/** Un mot rangé dans « Mots » qui ressemble à une question de culture générale. */
export function looksLikeQuestion(w: Pick<Word, 'kind' | 'term' | 'definition'>, categoryName: string | null): boolean {
  if (isQuestion(w)) return false
  return /\?\s*$/.test(w.term) || /\?\s*$/.test(w.definition) || (!!categoryName && textKey(categoryName).startsWith('culture'))
}
