import { describe, expect, it } from 'vitest'
import { deriveSpaceKey, fromHex, importSpaceKey, normalizeCode, open, seal, toHex } from '../src/data/space'

describe('espaces à code', () => {
  it('un même code donne toujours le même espace, un autre code un autre espace', async () => {
    const a = await deriveSpaceKey('soleil42')
    const b = await deriveSpaceKey('  soleil42 ')
    const c = await deriveSpaceKey('Soleil42')
    expect(a.id).toBe(b.id)
    expect(a.id).not.toBe(c.id)
    expect(a.id).toMatch(/^[0-9a-f]{32}$/)
  })

  it('chiffre puis déchiffre le contenu, illisible avec un autre code', async () => {
    const space = await deriveSpaceKey('1234')
    const sealed = await seal(space, { words: ['Résilience'] })
    expect(new TextDecoder().decode(sealed.data)).not.toContain('Résilience')
    expect(await open(space, sealed)).toEqual({ words: ['Résilience'] })
    await expect(open(await deriveSpaceKey('1235'), sealed)).rejects.toThrow()
  })

  it('la clé gardée pour l’onglet rouvre le même espace', async () => {
    const space = await deriveSpaceKey('mon code')
    const again = await importSpaceKey(fromHex(toHex(space.raw)))
    expect(again.id).toBe(space.id)
    expect(await open(again, await seal(space, 42))).toBe(42)
  })

  it('normalise la forme Unicode et les espaces autour', () => {
    expect(normalizeCode(' été ')).toBe('été')
  })
})
