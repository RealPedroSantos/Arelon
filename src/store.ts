import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Screen =
  | 'search'
  | 'home'
  | 'tv'
  | 'esporte'
  | 'kids'
  | 'mylist'
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
  categoryId: string
  streamUrl: string
  ext: string
  plot?: string
  year?: string
  rating?: string
}

export interface Series {
  id: string
  name: string
  cover: string
  categoryId: string
  plot?: string
  year?: string
  rating?: string
}

export interface Episode {
  id: string
  title: string
  episodeNum: number
  season: number
  ext: string
  image?: string
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
  duration?: string
  startPosition?: number
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
  continueWatching: ContinueWatchingItem[]
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
  setMovies: (categories: Category[], movies: Movie[]) => void
  setSeries: (categories: Category[], series: Series[]) => void
  setCurrentMedia: (media: MediaItem | null) => void
  setSelectedDetailMedia: (media: MediaItem | null) => void
  setPlayerReturnDetail: (media: MediaItem | null) => void
  updateContinueWatching: (media: MediaItem, position: number, durationSeconds: number) => void
  setMultiViewChannel: (index: number, mv: MultiViewChannel | null) => void
  clearMultiView: () => void
  setLoading: (v: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
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
      continueWatching: [],
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
          screen: 'home',
        }),
      setScreen: (screen) => set({ screen }),
      setLive: (liveCategories, liveChannels) => set({ liveCategories, liveChannels }),
      setMovies: (movieCategories, movies) => set({ movieCategories, movies }),
      setSeries: (seriesCategories, series) => set({ seriesCategories, series }),
      setCurrentMedia: (currentMedia) => set({ currentMedia }),
      setSelectedDetailMedia: (selectedDetailMedia) => set({ selectedDetailMedia }),
      setPlayerReturnDetail: (playerReturnDetail) => set({ playerReturnDetail }),
      updateContinueWatching: (media, position, durationSeconds) =>
        set((state) => {
          if (media.isLive || media.type === 'live' || !media.url) return state
          if (!Number.isFinite(position) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return state

          const progress = position / durationSeconds
          const key = `${media.type}:${media.id}`
          const existing = state.continueWatching.filter((item) => `${item.type}:${item.id}` !== key)

          if (progress >= 0.95) {
            if (existing.length === state.continueWatching.length) return state
            return { continueWatching: existing }
          }

          if (progress < 0.5) return state

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
          multiviewChannels: [null, null, null, null],
          continueWatching: [],
          error: null,
          selectedState: null,
        }),
    }),
    {
      name: 'vetraio-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ server: state.server, continueWatching: state.continueWatching, selectedState: state.selectedState }),
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
