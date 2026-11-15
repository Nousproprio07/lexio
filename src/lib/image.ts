/**
 * Préparation des images de questions : redimensionnées et recompressées sur
 * l'appareil (une photo d'iPhone de 4 Mo devient environ 150 Ko).
 */
export const MAX_IMAGE_SIDE = 1400
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

export async function compressImage(file: Blob): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Image trop lourde (25 Mo maximum).')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error("Ce format d'image n'est pas lu par le navigateur. Essayez une image JPEG ou PNG.")
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Impossible de préparer l'image.")
  ctx.fillStyle = '#fff' // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error("Impossible de préparer l'image.")
  // une petite image déjà compressée peut être plus légère telle quelle
  return scale === 1 && file.size <= blob.size && /^image\/(jpeg|png|webp|gif)$/.test(file.type) ? file : blob
}

/** Empreinte du contenu d'une image : sert d'identifiant (même image = même identifiant). */
export async function imageIdOf(blob: Blob): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))
  return [...digest.slice(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(url)
  if (!m) return null
  try {
    const bin = atob(m[2].replace(/\s/g, ''))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: m[1] })
  } catch {
    return null
  }
}
