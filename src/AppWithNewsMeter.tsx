import { useEffect, useState } from 'react'
import { App } from './App'
import { useStore } from './store'
import {
  NEWSMETER_CONSENT_KEY,
  NEWSMETER_POLICY_VERSION,
  useAudienceTelemetry,
} from './lib/audienceTelemetry'
import { NewsMeterDashboard } from './screens/NewsMeterDashboard'

function readConsent(): 'accepted' | 'declined' | null {
  try {
    const value = localStorage.getItem(NEWSMETER_CONSENT_KEY)
    return value === 'accepted' || value === 'declined' ? value : null
  } catch {
    return null
  }
}

export function AppWithNewsMeter() {
  const isAdminAuthenticated = useStore((state) => state.isAdminAuthenticated)
  const [consent, setConsent] = useState<'accepted' | 'declined' | null>(() => readConsent())
  const [dashboardOpen, setDashboardOpen] = useState(false)

  useAudienceTelemetry(consent === 'accepted')

  useEffect(() => {
    const onHashChange = () => setDashboardOpen(window.location.hash === '#newsmeter')
    onHashChange()
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!isAdminAuthenticated && dashboardOpen) {
      setDashboardOpen(false)
      if (window.location.hash === '#newsmeter') history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [dashboardOpen, isAdminAuthenticated])

  const saveConsent = (value: 'accepted' | 'declined') => {
    try {
      localStorage.setItem(NEWSMETER_CONSENT_KEY, value)
      localStorage.setItem('arelon-newsmeter-policy-version', NEWSMETER_POLICY_VERSION)
    } catch {
      // O aplicativo continua funcionando mesmo quando o armazenamento local está indisponível.
    }
    setConsent(value)
  }

  if (isAdminAuthenticated && dashboardOpen) {
    return (
      <NewsMeterDashboard
        onClose={() => {
          setDashboardOpen(false)
          history.replaceState(null, '', window.location.pathname + window.location.search)
        }}
      />
    )
  }

  return (
    <>
      <App />

      {isAdminAuthenticated && (
        <button
          className="newsmeter-launcher"
          data-focusable="true"
          onClick={() => {
            setDashboardOpen(true)
            window.location.hash = 'newsmeter'
          }}
        >
          Audiência
        </button>
      )}

      {consent === null && (
        <div className="newsmeter-consent" role="dialog" aria-label="Coleta anônima de audiência">
          <div>
            <strong>Medição interna de audiência</strong>
            <p>
              O Arelon pode registrar, de forma anônima, canal reproduzido, duração e qualidade técnica.
              Os dados representam somente o uso deste aplicativo e não medem a audiência total da televisão brasileira.
            </p>
          </div>
          <div className="newsmeter-consent__actions">
            <button data-focusable="true" onClick={() => saveConsent('declined')}>Desativar</button>
            <button data-focusable="true" onClick={() => saveConsent('accepted')}>Permitir</button>
          </div>
        </div>
      )}
    </>
  )
}
