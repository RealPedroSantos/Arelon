import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const STORE_STORAGE_KEY = 'vetraio-v2'

function removePersistedServerCredentials(): void {
  if (typeof window === 'undefined') return

  try {
    const raw = window.localStorage.getItem(STORE_STORAGE_KEY)
    if (!raw) return

    const parsed = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number }
    if (!parsed?.state) return

    delete parsed.state.server
    delete parsed.state.continueWatching
    window.localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // A limpeza e defensiva; se falhar, a hidratacao abaixo ainda ignora server.
  }
}

removePersistedServerCredentials()

export type Screen =
  | 'search'
  | 'home'
  | 'tv'
  | 'esporte'
  | 'kids'
  | 'recent'
  | 'movies'
  | 'series'
  | 'live'
  | 'multiview'

export interface ServerConfig {
  username: string
  password: string
  // URL é gerenciada pelo pool — não precisa ficar aqui
  activeServer: string
}

export interface Category {
  id: string
  name: string
}

export interface Channel {
  id: string
  name: string
  logo: string
  logoCdn?: string
  logoPlaylist?: string
  logoPlaceholder?: string
  categoryId: string
  streamUrl: string // URL original (pode ser reescrita pelo pool)
  streams?: Record<string, string> // e.g. { FHD: 'url', HD: 'url', SD: 'url' }
}

export interface Movie {
  id: string
  name: string
  poster: string
  backdrop?: string
  logoText?: string
  categoryId: string
  streamUrl: string
  ext: string
  plot?: string
  year?: string
  rating?: string
  backdrop?: string
  logoText?: string
}

export interface Series {
  id: string
  name: string
  cover: string
  backdrop?: string
  logoText?: string
  categoryId: string
  plot?: string
  year?: string
  rating?: string
  backdrop?: string
  logoText?: string
}

export interface Episode {
  id: string
  title: string
  episodeNum: number
  season: number
  ext: string
  image?: string
}

export interface EpisodePlaybackItem {
  id: string
  title: string
  url: string
  season: number
  episodeNum: number
  poster?: string
}

export interface MediaItem {
  id: string
  title: string
  url: string
  type: 'live' | 'movie' | 'episode'
  poster?: string
  isLive?: boolean
  assignedServer?: string
  streams?: Record<string, string>
  plot?: string
  year?: string
  rating?: string
  backdrop?: string
  logoText?: string
  duration?: string
  startPosition?: number
  seriesId?: string
  seriesTitle?: string
  season?: number
  episodeNum?: number
  episodeQueue?: EpisodePlaybackItem[]
}

export interface MultiViewChannel {
  channel: Channel
  assignedServer: string
}

export interface ContinueWatchingItem extends Omit<MediaItem, 'startPosition'> {
  position: number
  durationSeconds: number
  progress: number
  updatedAt: number
}

export type FavoriteKind = 'live' | 'movie' | 'series'

export interface FavoriteItem {
  id: string
  title: string
  type: FavoriteKind
  poster?: string
  url?: string
  isLive?: boolean
  assignedServer?: string
  streams?: Record<string, string>
  plot?: string
  year?: string
  rating?: string
  addedAt: number
}

export interface MainReturnPoint {
  screen: Screen
  focusKey?: string
  mediaId?: string
  focusIndex?: number
  layoutScrollTop?: number
  innerScrollTop?: number
  rowScrollLeft?: number
  createdAt: number
}

interface AppStore {
  server: ServerConfig | null
  isAuthenticated: boolean
  isAdminAuthenticated: boolean
  screen: Screen
  liveCategories: Category[]
  liveChannels: Channel[]
  movieCategories: Category[]
  movies: Movie[]
  seriesCategories: Category[]
  series: Series[]
  currentMedia: MediaItem | null
  selectedDetailMedia: MediaItem | null
  playerReturnDetail: MediaItem | null   // usado para voltar do player para a tela de detalhe correta
  mainReturnPoint: MainReturnPoint | null
  continueWatching: ContinueWatchingItem[]
  favorites: FavoriteItem[]
  multiviewChannels: (MultiViewChannel | null)[]
  isLoading: boolean
  error: string | null

  selectedState: string | null
  setSelectedState: (state: string | null) => void
  setServer: (server: ServerConfig) => void
  setAuthenticated: (v: boolean) => void
  setAdminAuthenticated: (v: boolean) => void
  setScreen: (screen: Screen) => void
  setLive: (categories: Category[], channels: Channel[]) => void
  appendLiveChannels: (channels: Channel[]) => void
  setMovies: (categories: Category[], movies: Movie[]) => void
  appendMovies: (movies: Movie[]) => void
  setSeries: (categories: Category[], series: Series[]) => void
  appendSeries: (series: Series[]) => void
  setCurrentMedia: (media: MediaItem | null) => void
  setSelectedDetailMedia: (media: MediaItem | null) => void
  setPlayerReturnDetail: (media: MediaItem | null) => void
  setMainReturnPoint: (point: MainReturnPoint | null) => void
  updateContinueWatching: (media: MediaItem, position: number, durationSeconds: number) => void
  toggleFavorite: (favorite: Omit<FavoriteItem, 'addedAt'>) => void
  setMultiViewChannel: (index: number, mv: MultiViewChannel | null) => void
  clearMultiView: () => void
  setLoading: (v: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
}

function favoriteKey(item: Pick<FavoriteItem, 'id' | 'type'>): string {
  return `${item.type}:${item.id}`
}

function normalizeFavoriteItem(value: unknown): FavoriteItem | null {
  if (!value || typeof value !== 'object') return null

  const item = value as Partial<FavoriteItem>
  if (typeof item.id !== 'string' || typeof item.title !== 'string') return null
  if (item.type !== 'live' && item.type !== 'movie' && item.type !== 'series') return null

  const rawStreams = item.streams
  const streams =
    rawStreams && typeof rawStreams === 'object' && !Array.isArray(rawStreams)
      ? Object.fromEntries(Object.entries(rawStreams).filter(([, stream]) => typeof stream === 'string'))
      : undefined

  return {
    id: item.id,
    title: item.title,
    type: item.type,
    poster: typeof item.poster === 'string' ? item.poster : undefined,
    url: typeof item.url === 'string' ? item.url : undefined,
    isLive: item.isLive === true,
    assignedServer: typeof item.assignedServer === 'string' ? item.assignedServer : undefined,
    streams: streams && Object.keys(streams).length > 0 ? streams : undefined,
    plot: typeof item.plot === 'string' ? item.plot : undefined,
    year: typeof item.year === 'string' ? item.year : undefined,
    rating: typeof item.rating === 'string' ? item.rating : undefined,
    addedAt: typeof item.addedAt === 'number' && Number.isFinite(item.addedAt) ? item.addedAt : Date.now(),
  }
}

function normalizeFavorites(value: unknown): FavoriteItem[] {
  if (!Array.isArray(value)) return []

  const byKey = new Map<string, FavoriteItem>()
  for (const item of value) {
    const favorite = normalizeFavoriteItem(item)
    if (favorite) byKey.set(favoriteKey(favorite), favorite)
  }

  return Array.from(byKey.values()).sort((a, b) => b.addedAt - a.addedAt)
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      server: null,
      isAuthenticated: false,
      isAdminAuthenticated: false,
      screen: 'home',
      liveCategories: [],
      liveChannels: [],
      movieCategories: [],
      movies: [],
      seriesCategories: [],
      series: [],
      currentMedia: null,
      selectedDetailMedia: null,
      playerReturnDetail: null,
      mainReturnPoint: null,
      continueWatching: [],
      favorites: [],
      multiviewChannels: [null, null, null, null],
      isLoading: false,
      error: null,
      selectedState: null,

      setSelectedState: (selectedState) => set({ selectedState }),
      setServer: (server) => set({ server }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setAdminAuthenticated: (isAdminAuthenticated) =>
        set({
          isAdminAuthenticated,
          currentMedia: null,
          selectedDetailMedia: null,
          playerReturnDetail: null,
          mainReturnPoint: null,
          screen: 'home',
        }),
      setScreen: (screen) => set({ screen }),
      setLive: (liveCategories, liveChannels) => set({ liveCategories, liveChannels }),
      appendLiveChannels: (channels) =>
        set((state) => {
          const byId = new Map(state.liveChannels.map((channel) => [channel.id, channel]))
          for (const channel of channels) byId.set(channel.id, channel)
          return { liveChannels: Array.from(byId.values()) }
        }),
      setMovies: (movieCategories, movies) => set({ movieCategories, movies }),
      appendMovies: (movies) =>
        set((state) => {
          const byId = new Map(state.movies.map((movie) => [movie.id, movie]))
          for (const movie of movies) byId.set(movie.id, movie)
          return { movies: Array.from(byId.values()) }
        }),
      setSeries: (seriesCategories, series) => set({ seriesCategories, series }),
      appendSeries: (series) =>
        set((state) => {
          const byId = new Map(state.series.map((item) => [item.id, item]))
          for (const item of series) byId.set(item.id, item)
          return { series: Array.from(byId.values()) }
        }),
      setCurrentMedia: (currentMedia) => set({ currentMedia }),
      setSelectedDetailMedia: (selectedDetailMedia) => set({ selectedDetailMedia }),
      setPlayerReturnDetail: (playerReturnDetail) => set({ playerReturnDetail }),
      setMainReturnPoint: (mainReturnPoint) => set({ mainReturnPoint }),
      updateContinueWatching: (media, position, durationSeconds) =>
        set((state) => {
          if (media.isLive || media.type === 'live' || !media.url) return state
          if (!Number.isFinite(position) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return state

          const progress = position / durationSeconds
          const key = `${media.type}:${media.id}`
          const existing = state.continueWatching.filter((item) => `${item.type}:${item.id}` !== key)

          // Considera "assistido" se chegou perto do fim (>=95%) — remove da fila
          if (progress >= 0.95) {
            if (existing.length === state.continueWatching.length) return state
            return { continueWatching: existing }
          }

          // Só salva se assistiu pelo menos 3 minutos absolutos
          if (position < 180) return state

          const item: ContinueWatchingItem = {
            ...media,
            position,
            durationSeconds,
            progress,
            updatedAt: Date.now(),
          }

          return {
            continueWatching: [item, ...existing]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 20),
          }
        }),
      toggleFavorite: (favorite) =>
        set((state) => {
          const key = favoriteKey(favorite)
          const exists = state.favorites.some((item) => favoriteKey(item) === key)

          if (exists) {
            return { favorites: state.favorites.filter((item) => favoriteKey(item) !== key) }
          }

          return {
            favorites: [
              { ...favorite, addedAt: Date.now() },
              ...state.favorites.filter((item) => favoriteKey(item) !== key),
            ].slice(0, 100),
          }
        }),
      setMultiViewChannel: (index, mv) =>
        set((state) => {
          const arr = [...state.multiviewChannels]
          arr[index] = mv
          return { multiviewChannels: arr }
        }),
      clearMultiView: () => set({ multiviewChannels: [null, null, null, null] }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      logout: () =>
        set({
          server: null,
          isAuthenticated: false,
          isAdminAuthenticated: false,
          screen: 'home',
          liveCategories: [],
          liveChannels: [],
          movieCategories: [],
          movies: [],
          seriesCategories: [],
          series: [],
          currentMedia: null,
          selectedDetailMedia: null,
          playerReturnDetail: null,
          mainReturnPoint: null,
          multiviewChannels: [null, null, null, null],
          continueWatching: [],
          favorites: [],
          error: null,
          selectedState: null,
        }),
    }),
    {
      name: STORE_STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedState: state.selectedState,
        favorites: state.favorites,
      }),
      migrate: (persisted) => {
        const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<AppStore>
        return {
          selectedState: typeof state.selectedState === 'string' ? state.selectedState : null,
          favorites: normalizeFavorites(state.favorites),
        }
      },
      merge: (persisted, current) => {
        const state = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<AppStore>
        return {
          ...current,
          selectedState: typeof state.selectedState === 'string' ? state.selectedState : current.selectedState,
          favorites: normalizeFavorites(state.favorites),
        }
      },
    },
  ),
)

export function shouldShowChannel(channelName: string, selectedState: string | null): boolean {
  if (!selectedState) return true

  const name = channelName.toUpperCase()
  // Procura por siglas de estado como palavras completas ou entre parênteses
  // Ex: "GLOBO SP", "GLOBO (SP)", "GLOBO - SP"
  const stateRegex = /\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/
  const match = name.match(stateRegex)

  if (match) {
    const channelState = match[1]
    return channelState === selectedState.toUpperCase()
  }

  return true
}
