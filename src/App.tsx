import { useEffect, useState } from 'react'
import { useStore } from './store'
import { authenticate } from './api/xtream'
import { LoginScreen } from './screens/LoginScreen'
import { HomeScreen } from './screens/HomeScreen'
import { LiveScreen } from './screens/LiveScreen'
import { MoviesScreen } from './screens/MoviesScreen'
import { SeriesScreen } from './screens/SeriesScreen'
import { KidsScreen } from './screens/KidsScreen'
import { MyListScreen } from './screens/MyListScreen'
import { PlayerScreen } from './screens/PlayerScreen'
import { MultiViewScreen } from './screens/MultiViewScreen'
import { MediaDetailScreen } from './screens/MediaDetailScreen'
import { SearchScreen } from './screens/SearchScreen'
import { AdminScreen } from './screens/AdminScreen'
import { applySharedAdminConfig, loadSharedAdminConfig } from './lib/adminConfig'
import { loadLogoBank } from './lib/logoResolver'

import { AppShell } from './components/AppShell'

export function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated)
  const isAdminAuthenticated = useStore((s) => s.isAdminAuthenticated)
  const server = useStore((s) => s.server)
  const setAuthenticated = useStore((s) => s.setAuthenticated)
  const setServer = useStore((s) => s.setServer)
  const screen = useStore((s) => s.screen)
  const currentMedia = useStore((s) => s.currentMedia)
  const selectedDetailMedia = useStore((s) => s.selectedDetailMedia)

  const [configReady, setConfigReady] = useState(false)
  const hasStoredCredentials = configReady && !isAuthenticated && !isAdminAuthenticated && !!server?.username && !!server?.password
  const [autoLogging, setAutoLogging] = useState(false)

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
              case 'mylist':    return <MyListScreen />
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
