import { ImageOff } from 'lucide-react'
import { useImageUrl } from '../state/images'

/** Image d'une question de culture générale, déchiffrée à la demande. */
export function QuestionImage({
  imageId,
  alt,
  className = '',
  fit = 'contain',
}: {
  imageId: string | null | undefined
  alt: string
  className?: string
  fit?: 'contain' | 'cover'
}) {
  const url = useImageUrl(imageId)
  if (!imageId) return null
  if (url === undefined) return <div className={`animate-pulse bg-slate-100 motion-reduce:animate-none ${className}`} aria-hidden />
  if (url === null)
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-slate-400 ${className}`} role="img" aria-label="Image introuvable">
        <ImageOff className="size-6" aria-hidden />
      </div>
    )
  return <img src={url} alt={alt} className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`} draggable={false} />
}
