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

export interface ImageRef {
  id: string
  credit: string | null
}

type ImageFields = Pick<Word, 'imageId' | 'imageCredit' | 'imageAsClue' | 'answerImageId' | 'answerImageCredit'>

/** Images d'une question : celle de la question (indice) et celle de la réponse. */
export function questionImages(w: ImageFields): { clue: ImageRef | null; answer: ImageRef | null } {
  const main = w.imageId ? { id: w.imageId, credit: w.imageCredit ?? null } : null
  const second = w.answerImageId ? { id: w.answerImageId, credit: w.answerImageCredit ?? null } : null
  return w.imageAsClue ? { clue: main, answer: second } : { clue: null, answer: main }
}

/** Champs à enregistrer pour ces deux images (format compatible avec les questions à une image). */
export function imageFields(clue: ImageRef | null, answer: ImageRef | null): Required<ImageFields> {
  if (clue)
    return { imageId: clue.id, imageCredit: clue.credit, imageAsClue: true, answerImageId: answer?.id ?? null, answerImageCredit: answer?.credit ?? null }
  return { imageId: answer?.id ?? null, imageCredit: answer?.credit ?? null, imageAsClue: false, answerImageId: null, answerImageCredit: null }
}

/** Question sur une œuvre (tableau, sculpture…) : on veut l'œuvre et son auteur. */
export function isArtworkQuestion(question: string, categoryName: string | null): boolean {
  return (
    /(?:peint|tableau|toile|peinture|œuvre|oeuvre|fresque|sculpt)/iu.test(question) ||
    (!!categoryName && /(?:peint|tableau|œuvre|oeuvre|sculpt)/iu.test(categoryName))
  )
}

/**
 * Images qui manquent à une question :
 *  - question sur une œuvre (tableau…) : l'œuvre avec la question, son auteur avec la réponse ;
 *  - question qui désigne l'image (« Qui est-ce ? ») sans image : l'indice ;
 *  - autre question sans image : une illustration de la réponse.
 * Un emplacement déjà occupé n'est jamais proposé.
 */
export function missingSlots(w: Word, categoryName: string | null): ('clue' | 'answer')[] {
  const { clue, answer } = questionImages(w)
  if (isArtworkQuestion(w.definition, categoryName)) return [...(clue ? [] : ['clue' as const]), ...(answer ? [] : ['answer' as const])]
  if (clue || answer) return []
  return [questionRefersToImage(w.definition) ? 'clue' : 'answer']
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
