import { useEffect, useState } from 'react'
import { useStore } from './store'
import {
  authenticate,
  getAllSeries,
  getLiveCategories,
  getLiveChannels,
  getMovieCategories,
  getMovies,
  getSeriesCategories,
} from './api/xtream'
import { LoginScreen } from './screens/LoginScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LiveScreen } from './screens/LiveScreen'
import { MoviesScreen } from './screens/MoviesScreen'
import { SeriesScreen } from './screens/SeriesScreen'
import { KidsScreen } from './screens/KidsScreen'
import { PlayerScreen } from './screens/PlayerScreen'
import { MultiViewScreen } from './screens/MultiViewScreen'
import { MediaDetailScreen } from './screens/MediaDetailScreen'
import { SearchScreen } from './screens/SearchScreen'
import { AdminScreen } from './screens/AdminScreen'
import { applySharedAdminConfig, loadSharedAdminConfig } from './lib/adminConfig'
import { loadLogoBank, resolveChannelLogoCandidates } from './lib/logoResolver'
import { preloadImages } from './lib/imagePreload'
import type { Category, Channel, Movie, Series } from './store'

import { AppShell } from './components/AppShell'
import { CatalogLoadingScreen } from './components/CatalogLoadingScreen'

type CatalogLoadResult =
  | { kind: 'live'; k: string; n: number; categories: Category[]; channels: Channel[] }
  | { kind: 'movies'; k: string; n: number; categories: Category[]; items: Movie[] }
  | { kind: 'series'; k: string; n: number; categories: Category[]; items: Series[] }

function collectInitialArtwork(results: CatalogLoadResult[]): string[] {
  const live = results.find((result) => result.kind === 'live')?.channels ?? []
  const movies = results.find((result) => result.kind === 'movies')?.items ?? []
  const series = results.find((result) => result.kind === 'series')?.items ?? []
  const urls: string[] = [
    '/assets/arelon/logo-arelon-padrao.png',
    '/assets/arelon/fundo-imagem-app-padrao.png',
  ]

  for (let index = 0; index < 10 && (index < movies.length || index < series.length); index += 1) {
    const movie = movies[index]
    const item = series[index]
    if (movie?.poster) urls.push(movie.poster)
    if (item?.cover) urls.push(item.cover)
  }

  for (const movie of movies.slice(0, 10)) {
    if (movie.poster) urls.push(movie.poster)
  }

  for (const item of series.slice(5, 15)) {
    if (item.cover) urls.push(item.cover)
  }

  for (const channel of live.slice(0, 8)) {
    urls.push(
      ...resolveChannelLogoCandidates(channel.name, channel.logo, {
        logoCdn: channel.logoCdn,
        logoPlaylist: channel.logoPlaylist,
        logoPlaceholder: channel.logoPlaceholder,
      }).slice(0, 2),
    )
  }

  return urls
}

export function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const isAdminAuthenticated = useStore((s) => s.isAdminAuthenticated)
  const server = useStore((s) => s.server)
  const setAuthenticated = useStore((s) => s.setAuthenticated)
  const setServer = useStore((s) => s.setServer)
  const screen = useStore((s) => s.screen)
  const currentMedia = useStore((s) => s.currentMedia)
  const selectedDetailMedia = useStore((s) => s.selectedDetailMedia)
  const liveChannels = useStore((s) => s.liveChannels)
  const movies = useStore((s) => s.movies)
  const series = useStore((s) => s.series)
  const setLive = useStore((s) => s.setLive)
  const setMovies = useStore((s) => s.setMovies)
  const setSeries = useStore((s) => s.setSeries)
  const setLoading = useStore((s) => s.setLoading)

  const [configReady, setConfigReady] = useState(false)
  const hasStoredCredentials = configReady && !isAuthenticated && !isAdminAuthenticated && !!server?.username && !!server?.password
  const [autoLogging, setAutoLogging] = useState(false)
  const [catalogReady, setCatalogReady] = useState(false)
  const [catalogLoadingMessage, setCatalogLoadingMessage] = useState('Preparando catálogo...')
  const hasCatalogContent = liveChannels.length > 0 || movies.length > 0 || series.length > 0

  useEffect(() => {
    fetch('/assets/logos/manifest.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((bank: Record<string, string>) => loadLogoBank(bank))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false

    loadSharedAdminConfig()
      .then((config) => {
        applySharedAdminConfig(config)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setConfigReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hasStoredCredentials || !server) return
    let cancelled = false
    setAutoLogging(true)

    authenticate(server.username, server.password)
      .then((activeServerUrl) => {
        if (!cancelled && activeServerUrl) {
          setServer({ ...server, activeServer: activeServerUrl })
          setAuthenticated(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAutoLogging(false)
      })

    return () => {
      cancelled = true
    }
  }, [hasStoredCredentials, server, setAuthenticated, setServer])

  useEffect(() => {
    if (!isAuthenticated || isAdminAuthenticated || !server) {
      setCatalogReady(false)
      return
    }

    if (hasCatalogContent) {
      setCatalogReady(true)
      return
    }

    let cancelled = false
    setCatalogReady(false)
    setCatalogLoadingMessage('Carregando catálogo...')
    setLoading(true)

    const tasks: Array<() => Promise<CatalogLoadResult>> = [
      async () => {
        const [categories, channels] = await Promise.all([
          getLiveCategories(server.activeServer, server.username, server.password),
          getLiveChannels(server.activeServer, server.username, server.password),
        ])
        return { kind: 'live' as const, k: 'canais', n: channels.length, categories, channels }
      },
      async () => {
        const [categories, items] = await Promise.all([
          getMovieCategories(server.activeServer, server.username, server.password),
          getMovies(server.activeServer, server.username, server.password),
        ])
        return { kind: 'movies' as const, k: 'filmes', n: items.length, categories, items }
      },
      async () => {
        const [categories, items] = await Promise.all([
          getSeriesCategories(server.activeServer, server.username, server.password),
          getAllSeries(server.activeServer, server.username, server.password),
        ])
        return { kind: 'series' as const, k: 'séries', n: items.length, categories, items }
      },
    ]

    void Promise.allSettled(tasks.map((task) => task()))
      .then(async (results) => {
        if (cancelled) return

        const oks = results
          .filter((result): result is PromiseFulfilledResult<CatalogLoadResult> => result.status === 'fulfilled')
          .map((result) => result.value)
        const fails = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        const counts = oks.map((item) => `${item.k}:${item.n}`).join(', ')

        setCatalogLoadingMessage('Carregando capas...')
        await preloadImages(collectInitialArtwork(oks), { batchSize: 8, limit: 36, timeoutMs: 4500 })
        if (cancelled) return

        for (const result of oks) {
          if (result.kind === 'live') setLive(result.categories, result.channels)
          else if (result.kind === 'movies') setMovies(result.categories, result.items)
          else setSeries(result.categories, result.items)
        }

        const totalItems = oks.reduce((total, item) => total + item.n, 0)
        if (fails.length > 0 || totalItems === 0) {
          console.error('[Arelon] carregamento inicial do catálogo', { server: server.activeServer, counts, fails })
          useStore.getState().setError(
            totalItems === 0
              ? 'Não foi possível carregar o catálogo (servidor de conteúdo indisponível).'
              : null,
          )
        }
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setCatalogReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [
    hasCatalogContent,
    isAdminAuthenticated,
    isAuthenticated,
    server,
    setLive,
    setLoading,
    setMovies,
    setSeries,
  ])


  let content;
  if (!configReady) {
    content = (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1920px', height: '1080px', background: '#000', color: '#fff', fontSize: '1.4rem', letterSpacing: '0.05em' }}>
        Carregando configuração…
      </div>
    )
  } else if (isAdminAuthenticated) {
    content = <AdminScreen />
  } else if (currentMedia) {
    content = <PlayerScreen />
  } else if (!isAuthenticated) {
    if (autoLogging) {
      content = (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '1920px', height: '1080px', background: '#000', color: '#fff', fontSize: '1.4rem', letterSpacing: '0.05em' }}>
          Conectando…
        </div>
      )
    } else {
      content = <LoginScreen />
    }
  } else if (!catalogReady) {
    content = <CatalogLoadingScreen message={catalogLoadingMessage} />
  } else {
    content = (
      <AppShell>
        {selectedDetailMedia ? (
          <MediaDetailScreen />
        ) : (
          (() => {
            switch (screen) {
              case 'live':      return <LiveScreen filter="all" />
              case 'tv':        return <LiveScreen filter="tv" />
              case 'esporte':   return <LiveScreen filter="esporte" />
              case 'movies':    return <MoviesScreen />
              case 'series':    return <SeriesScreen />
              case 'kids':      return <KidsScreen />
              case 'search':    return <SearchScreen />
              case 'multiview': return <MultiViewScreen />
              default:          return <HomeScreen />
            }
          })()
        )}
      </AppShell>
    )
  }

  return (
    <>
      {content}
    </>
  )
}
