import { memo, useEffect, useRef, useState } from 'react'
import { resolveChannelLogoCandidates } from '../lib/logoResolver'

export interface MediaCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  id: string
  title: string
  imageUrl: string
  aspectRatio?: 'poster' | 'landscape' | 'square'
  topNumber?: number
  /** Trata a imagem como logo de canal: fundo de tile + logo centralizado (contain),
   *  em vez de cover. Use para logos (proporções/margens variadas), não para artes cheias. */
  logoTile?: boolean
  logoCdn?: string
  logoPlaylist?: string
  logoPlaceholder?: string
  focusKey?: string
  'data-focusable'?: string
}

function MediaCardComponent({
  id,
  title,
  imageUrl,
  aspectRatio = 'landscape',
  topNumber,
  logoTile = false,
  logoCdn,
  logoPlaylist,
  logoPlaceholder,
  focusKey,
  onClick,
  className = '',
  'data-focusable': dataFocusable = 'true',
  ...rest
}: MediaCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imageCandidates, setImageCandidates] = useState<string[]>(() =>
    logoTile ? resolveChannelLogoCandidates(title, imageUrl, { logoCdn, logoPlaylist, logoPlaceholder }) : imageUrl ? [imageUrl] : [],
  )
  const [imageIndex, setImageIndex] = useState(0)

  useEffect(() => {
    const nextCandidates = logoTile ? resolveChannelLogoCandidates(title, imageUrl, { logoCdn, logoPlaylist, logoPlaceholder }) : imageUrl ? [imageUrl] : []

    setImageCandidates(nextCandidates)
    setImageIndex(0)
    setImgError(nextCandidates.length === 0)
    setImgLoaded(false)
  }, [imageUrl, logoCdn, logoPlaceholder, logoPlaylist, logoTile, title])

  const handleError = () => {
    const nextIndex = imageIndex + 1

    if (nextIndex < imageCandidates.length) {
      setImageIndex(nextIndex)
      setImgLoaded(false)
    } else {
      setImgError(true)
    }
  }

  const currentSrc = imageCandidates[imageIndex] ?? ''

  return (
    <button
      ref={cardRef}
      className={`media-card media-card--${aspectRatio}${logoTile ? ' media-card--logo' : ''}${topNumber ? ' media-card--has-top-number' : ''} ${className}`}
      onClick={onClick}
      data-focusable={dataFocusable}
      data-media-id={id}
      data-return-focus-key={focusKey ?? id}
      {...rest}
    >
      {topNumber && <div className="media-card-top-number">{topNumber}</div>}
      <div className="media-card-inner">
        {imgError || !currentSrc ? (
          <div className="media-card-img media-card-placeholder" aria-label={title}>
            {title.charAt(0).toUpperCase()}
          </div>
        ) : (
          <>
            {!imgLoaded && <div className="media-card-skeleton" />}
            <img
              src={currentSrc}
              alt={title}
              className="media-card-img"
              style={{ opacity: imgLoaded ? 1 : 0 }}
              loading={logoTile ? 'lazy' : 'eager'}
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={handleError}
            />
          </>
        )}
      </div>
    </button>
  )
}

export const MediaCard = memo(MediaCardComponent)
