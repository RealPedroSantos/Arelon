import { MediaCard } from './MediaCard'
import { MediaRow } from './MediaRow'
import type { Episode } from '../store'

interface SimilarSeriesItem {
  id: string
  name: string
  cover: string
}

function cleanEpisodeTitle(title: string, epNum: number): string {
  if (!title) return `Episódio ${epNum}`

  let cleaned = title

  // 1. Remove patterns like S01E01, E01, etc.
  cleaned = cleaned.replace(/\bS\d+E\d+\b/gi, '')
  cleaned = cleaned.replace(/\bE\d+\b/gi, '')

  // 2. Remove word-based episode indicators like "Episódio 01", "Ep 1", etc.
  cleaned = cleaned.replace(/\b(Epis[óo]dio|Epis[oó]dios|Ep|EP)\b\s*\d+/gi, '')

  // 3. Remove season terms like "Temporada 1", "Temp 1", etc.
  cleaned = cleaned.replace(/\b(Temporada|Temp|T)\b\s*\d+/gi, '')

  // 4. Remove leading episode number prefix like "01 - " or "1 - " or "1 -"
  const prefixRegex = new RegExp(`^\\s*0*${epNum}\\s*[-–—:]\\s*`, 'i')
  cleaned = cleaned.replace(prefixRegex, '')

  // 5. Remove any leading/trailing punctuation and whitespace
  cleaned = cleaned.trim().replace(/^[-–—\s:|]+|[-–—\s:|]+$/g, '')

  // 6. If nothing is left (e.g. title was just "Episódio 1"), default to "Episódio X"
  if (!cleaned) {
    return `Episódio ${epNum}`
  }

  return cleaned
}

interface SeriesEpisodesProps {
  episodes: Record<string, Episode[]>
  seasons: string[]
  currentSeason: string | null
  setCurrentSeason: (season: string) => void
  playEpisode: (ep: Episode) => void
  similarSeries?: SimilarSeriesItem[]
  onSelectSeries?: (s: SimilarSeriesItem) => void
}

export function SeriesEpisodes({
  episodes,
  seasons,
  currentSeason,
  setCurrentSeason,
  playEpisode,
  similarSeries,
  onSelectSeries,
}: SeriesEpisodesProps) {
  if (!currentSeason || seasons.length === 0) return null

  const list = (episodes[currentSeason] ?? []).sort((a, b) => a.episodeNum - b.episodeNum)

  return (
    <div className="series-episodes-new">
      {/* Seletor de temporadas - visual copiado das tabs da Home (opção 1: indicador ativo + scale no focus/hover) */}
      <div className="season-selector">
        {seasons.map((s) => (
          <button
            key={s}
            className={`season-tab ${currentSeason === s ? 'active' : ''}`}
            data-focusable="true"
            onClick={() => setCurrentSeason(s)}
          >
            T{s}
          </button>
        ))}
      </div>

      {/* A FAIXA DE EPISÓDIOS: usa EXATAMENTE o mesmo div da página inicial (arelon-home-rails)
          para garantir largura fixa em relação à tela da TV (16:9 / 1920px).
          Isso resolve o erro de largura infinita.
          O MediaRow interno + CSS + nudge faz com que L/R mova só os mini cards dentro da faixa,
          exatamente como na Home, filmes, séries etc. */}
      <div className="arelon-home-rails episodes-rail">
        <MediaRow title="Episódios">
          {list.map((ep) => {
            const epName = cleanEpisodeTitle(ep.title, ep.episodeNum)
            return (
              <MediaCard
                key={ep.id}
                id={ep.id}
                title={epName}
                imageUrl={ep.image || ''}
                aspectRatio="landscape"
                data-focusable="true"
                onClick={() => playEpisode(ep)}
              />
            )
          })}
        </MediaRow>
      </div>

      {/* FAIXA DE SÉRIES SIMILARES: conteúdo similar por gênero, descrição e tipo */}
      {similarSeries && similarSeries.length > 0 && onSelectSeries && (
        <div className="arelon-home-rails similar-rail">
          <MediaRow title="Séries similares">
            {similarSeries.map((s) => (
              <MediaCard
                key={s.id}
                id={`similar-${s.id}`}
                title={s.name}
                imageUrl={s.cover || ''}
                aspectRatio="poster"
                data-focusable="true"
                onClick={() => onSelectSeries(s)}
              />
            ))}
          </MediaRow>
        </div>
      )}
    </div>
  )
}
