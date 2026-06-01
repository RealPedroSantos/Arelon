import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { checkServerHealth, type ServerHealth } from '../api/xtream'
import { Keyboard } from '../components/Keyboard'
import { VolumeControlWidget } from '../components/VolumeControlWidget'
import { moveFocus, useRemote } from '../hooks/useRemote'
import {
  applySharedAdminConfig,
  createSharedServer,
  getDefaultSharedAdminConfig,
  getSharedConfigEndpoints,
  loadSharedAdminConfig,
  normalizeSharedAdminConfig,
  saveSharedAdminConfig,
  type SharedAdminConfig,
  type SharedServer,
} from '../lib/adminConfig'
import { normalizeServerUrl } from '../lib/pool'
import { useStore } from '../store'

type ServerTest = {
  status: 'idle' | 'checking' | 'ok' | 'fail'
  live: number
  vod: number
  series: number
  epg: boolean
  message?: string
}

type EditTarget =
  | { kind: 'serverUrl'; serverId: string; title: string; masked?: false }
  | { kind: 'testUsername'; title: string; masked?: false }
  | { kind: 'testPassword'; title: string; masked: true }

function formatServerTest(t: ServerTest | undefined): string {
  if (!t) return 'Não testado'
  if (t.status === 'checking') return 'Testando...'
  if (t.status === 'fail') return t.message || 'Falha'
  if (t.status === 'ok') {
    return 'OK'
  }
  return 'Não testado'
}

function getStatusClass(t: ServerTest | undefined): string {
  if (!t) return 'idle'
  if (t.status === 'checking') return 'checking'
  if (t.status === 'ok') return 'connected'
  if (t.status === 'fail') return 'disconnected'
  return 'idle'
}

function maskValue(value: string): string {
  return value ? '•'.repeat(Math.min(value.length, 18)) : '—'
}

function normalizeServerList(servers: SharedServer[]): SharedServer[] {
  const now = new Date().toISOString()
  const normalized: SharedServer[] = []

  for (const server of servers) {
    const baseUrl = normalizeServerUrl(server.baseUrl)
    if (!baseUrl) continue

    normalized.push({
      ...server,
      name: baseUrl,
      baseUrl,
      type: 'xtream',
      parameters: server.parameters ?? {},
      updatedAt: now,
    })
  }

  return normalized
}

export function AdminScreen() {
  const setAdminAuthenticated = useStore((s) => s.setAdminAuthenticated)
  const pageRef = useRef<HTMLDivElement>(null)

  const [config, setConfig] = useState<SharedAdminConfig>(() => getDefaultSharedAdminConfig())
  const [servers, setServers] = useState<SharedServer[]>([])
  const [testUsername, setTestUsername] = useState('')
  const [testPassword, setTestPassword] = useState('')
  const [tests, setTests] = useState<Record<string, ServerTest>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showVolumeWidget, setShowVolumeWidget] = useState(false)

  const activeCount = useMemo(() => servers.filter((server) => server.isActive).length, [servers])

  const openEditor = useCallback((target: EditTarget, value: string) => {
    setEditTarget(target)
    setEditValue(value)
  }, [])

  const applyEdit = useCallback(() => {
    if (!editTarget) return

    if (editTarget.kind === 'serverUrl') {
      const baseUrl = normalizeServerUrl(editValue)
      if (!baseUrl) {
        setMessage('Informe um link de servidor válido.')
        return
      }

      setServers((current) =>
        current.map((server) =>
          server.id === editTarget.serverId
            ? { ...server, name: baseUrl, baseUrl, updatedAt: new Date().toISOString() }
            : server,
        ),
      )
      setTests((current) => ({ ...current, [editTarget.serverId]: { status: 'idle', live: 0, vod: 0, series: 0, epg: false } }))
    } else if (editTarget.kind === 'testUsername') {
      setTestUsername(editValue.trim())
      setTests({})
    } else {
      setTestPassword(editValue)
      setTests({})
    }

    setEditTarget(null)
    setEditValue('')
  }, [editTarget, editValue])

  const runHealthChecks = useCallback(async (serverList: SharedServer[], username?: string, password?: string) => {
    const u = (username ?? testUsername).trim()
    const p = password ?? testPassword

    if (!u || !p) {
      setTests(Object.fromEntries(serverList.map((server) => [
        server.id,
        { status: 'fail', live: 0, vod: 0, series: 0, epg: false, message: 'Sem usuário de teste salvo' } as ServerTest,
      ])))
      setMessage('Salve um usuário e senha de teste para validar os servidores.')
      return
    }

    setIsChecking(true)
    setMessage('')
    setTests((current) => {
      const next: Record<string, ServerTest> = { ...current }
      for (const server of serverList) {
        next[server.id] = { status: 'checking', live: 0, vod: 0, series: 0, epg: false }
      }
      return next
    })

    await Promise.all(
      serverList.map(async (server) => {
        try {
          const health: ServerHealth = await checkServerHealth(server.baseUrl, u, p)
          setTests((current) => ({
            ...current,
            [server.id]: {
              status: health.authOk ? 'ok' : 'fail',
              live: health.liveCategories,
              vod: health.vodCategories,
              series: health.seriesCategories,
              epg: health.epgOk,
              message: health.message,
            },
          }))
        } catch (e: any) {
          setTests((current) => ({
            ...current,
            [server.id]: {
              status: 'fail',
              live: 0,
              vod: 0,
              series: 0,
              epg: false,
              message: e?.message || 'Erro no teste',
            },
          }))
        }
      }),
    )

    setIsChecking(false)
  }, [testPassword, testUsername])

  const loadConfig = useCallback(async () => {
    setIsLoading(true)
    setMessage('')

    const endpoints = await getSharedConfigEndpoints()
      setEndpoint(endpoints[0] ?? 'API não configurada')

    try {
      const loaded = await loadSharedAdminConfig()
      applySharedAdminConfig(loaded)
      setConfig(loaded)
      setServers(loaded.servers)
      setTestUsername(loaded.testAccount.username)
      setTestPassword(loaded.testAccount.password)
      setTests({})
    } catch {
      const fallback = getDefaultSharedAdminConfig()
      setConfig(fallback)
      setServers(fallback.servers)
      setTests({})
      setMessage('Não foi possível carregar a configuração compartilhada.')
    } finally {
      setIsLoading(false)
      window.setTimeout(() => {
        pageRef.current?.querySelector<HTMLElement>('[data-focusable="true"]')?.focus()
      }, 120)
    }
  }, [])

  const saveConfig = useCallback(async () => {
    const normalizedServers = normalizeServerList(servers)
    if (normalizedServers.length === 0) {
      setMessage('Cadastre pelo menos um link de servidor válido.')
      return
    }

    const preferred =
      normalizedServers.find((server) => server.id === config.activeServerId && server.isActive) ??
      normalizedServers.find((server) => server.isActive) ??
      normalizedServers[0]

    const nextConfig = normalizeSharedAdminConfig({
      ...config,
      servers: normalizedServers,
      activeServerId: preferred?.id,
      testAccount: {
        username: testUsername.trim(),
        password: testPassword,
      },
      updatedAt: new Date().toISOString(),
    })

    setIsSaving(true)
    setMessage('')
    try {
      const saved = await saveSharedAdminConfig(nextConfig)
      applySharedAdminConfig(saved)
      setServers(saved.servers)

      // IMPORTANTE: O backend pode não ecoar o testAccount no response.
      // Por isso priorizamos os valores que acabamos de enviar (que sabemos que são válidos).
      const finalTestUsername = (saved.testAccount?.username?.trim() || testUsername.trim())
      const finalTestPassword = (saved.testAccount?.password || testPassword)

      // Mantém o config consistente também
      setConfig({
        ...saved,
        testAccount: { username: finalTestUsername, password: finalTestPassword },
      })

      setTestUsername(finalTestUsername)
      setTestPassword(finalTestPassword)

      setMessage('Configuração salva e aplicada para o app.')

      // Passa as credenciais finais (não as do 'saved', que podem vir vazias)
      void runHealthChecks(saved.servers, finalTestUsername, finalTestPassword)
    } catch {
      setMessage('Não foi possível salvar. Verifique se a API de configuração está ativa.')
    } finally {
      setIsSaving(false)
    }
  }, [config, runHealthChecks, servers, testPassword, testUsername])

  const addServer = useCallback(() => {
    const server = createSharedServer('http://novo-servidor.com', servers.length)
    setServers((current) => [...current, server])
    setTests((current) => ({ ...current, [server.id]: { status: 'idle', live: 0, vod: 0, series: 0, epg: false } }))
    window.setTimeout(() => openEditor({ kind: 'serverUrl', serverId: server.id, title: 'Editar servidor' }, server.baseUrl), 80)
  }, [openEditor, servers.length])

  const removeServer = useCallback((serverId: string) => {
    setServers((current) => current.filter((server) => server.id !== serverId))
    setTests((current) => {
      const next = { ...current }
      delete next[serverId]
      return next
    })
  }, [])

  const toggleServer = useCallback((serverId: string) => {
    setServers((current) =>
      current.map((server) => (server.id === serverId ? { ...server, isActive: !server.isActive } : server)),
    )
  }, [])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  useEffect(() => {
    if (!editTarget) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === 'Escape') {
        event.preventDefault()
        setEditTarget(null)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        applyEdit()
        return
      }

      if (event.key === 'Backspace') {
        event.preventDefault()
        setEditValue((value) => value.slice(0, -1))
        return
      }

      if (event.key.length === 1) {
        event.preventDefault()
        setEditValue((value) => value + event.key)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [applyEdit, editTarget])

  useRemote((cmd, type) => {
    if (type !== 'keydown' && type !== 'tizenhwkey') return

    const active = document.activeElement as HTMLElement | null
    if (editTarget && active?.closest('.kb-wrap')) {
      if (cmd === 'BACK') setEditTarget(null)
      return
    }

    if (cmd === 'BACK') {
      if (editTarget) setEditTarget(null)
      else setAdminAuthenticated(false)
      return
    }

    if (cmd === 'UP' || cmd === 'DOWN' || cmd === 'LEFT' || cmd === 'RIGHT') moveFocus(cmd)
    else if (cmd === 'ENTER') (document.activeElement as HTMLElement)?.click()
  }, true, { allowWhenModal: true })

  return (
    <div className="admin-page" ref={pageRef}>
      <header className="admin-header">
        <div className="admin-brand-block">
          <img className="admin-logo" src="assets/arelon/logo-arelon-padrao.png" alt="Arelon" />
          <div>
            <div className="admin-kicker">Admin Master</div>
            <h1>Servidores do sistema</h1>
          </div>
        </div>

        <div className="admin-actions">
          <button className="admin-action-btn" data-focusable="true" onClick={() => void runHealthChecks(servers)}>
            {isChecking ? 'Testando...' : 'Testar'}
          </button>
          <button className="admin-action-btn admin-action-btn--primary" data-focusable="true" onClick={() => void saveConfig()}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
          <button className="admin-action-btn admin-action-btn--quiet" data-focusable="true" onClick={() => setAdminAuthenticated(false)}>
            Sair
          </button>
          <button
            className="admin-action-btn"
            data-focusable="true"
            onClick={() => setShowVolumeWidget(true)}
          >
            Controle de Volume
          </button>
        </div>
      </header>

      <main className="admin-main">
        <aside className="admin-side">
          <section className="admin-panel admin-test-user">
            <div className="admin-panel-title">
              <span>Usuário cobaia</span>
              <strong>{testUsername ? 'salvo' : 'pendente'}</strong>
            </div>

            <button
              className="admin-field"
              data-focusable="true"
              onClick={() => openEditor({ kind: 'testUsername', title: 'Usuário de teste' }, testUsername)}
            >
              <span>Usuário</span>
              <strong>{testUsername || '—'}</strong>
            </button>

            <button
              className="admin-field"
              data-focusable="true"
              onClick={() => openEditor({ kind: 'testPassword', title: 'Senha de teste', masked: true }, testPassword)}
            >
              <span>Senha</span>
              <strong>{maskValue(testPassword)}</strong>
            </button>
          </section>

          <section className="admin-panel admin-summary">
            <div>
              <span>Total</span>
              <strong>{servers.length}</strong>
            </div>
            <div>
              <span>Ativos no app</span>
              <strong>{activeCount}</strong>
            </div>
            <div>
              <span>Config API</span>
              <small>{endpoint}</small>
            </div>
          </section>
        </aside>

        <section className="admin-server-panel">
          <div className="admin-server-toolbar">
            <div>
              <h2>Links dos servidores</h2>
              <p>Os links ativos entram automaticamente no login, catálogo e player.</p>
            </div>
            <button className="admin-action-btn" data-focusable="true" onClick={addServer}>
              Adicionar
            </button>
          </div>

          {isLoading ? (
            <div className="admin-loading">Carregando configuração...</div>
          ) : (
            <div className="admin-server-list">
              {servers.map((server, index) => {
                const t = tests[server.id]
                return (
                  <article className={`admin-server-row ${server.isActive ? 'admin-server-row--active' : ''}`} key={server.id}>
                    <div className="admin-server-index">{String(index + 1).padStart(2, '0')}</div>
                    <div className="admin-server-body">
                      <button
                        className="admin-server-url"
                        data-focusable="true"
                        onClick={() => openEditor({ kind: 'serverUrl', serverId: server.id, title: 'Editar servidor' }, server.baseUrl)}
                      >
                        {server.baseUrl}
                      </button>
                      <div className="admin-server-meta">
                        <span className={`admin-status admin-status--${getStatusClass(t)}`}>{formatServerTest(t)}</span>

                        {/* Bolinhas de saúde por categoria (verde = ok, vermelho = falha/zero) */}
                        {t && (t.status === 'ok' || t.status === 'fail') && (
                          <div className="server-health-dots" title="Verde = tem categorias / EPG funcionando">
                            <span className={`dot ${t.live > 0 ? 'ok' : 'fail'}`} title={`Ao Vivo: ${t.live}`} />
                            <span className={`dot ${t.vod > 0 ? 'ok' : 'fail'}`} title={`VOD/Filmes: ${t.vod}`} />
                            <span className={`dot ${t.series > 0 ? 'ok' : 'fail'}`} title={`Séries: ${t.series}`} />
                            <span className={`dot ${t.epg ? 'ok' : 'fail'}`} title={`EPG`} />
                          </div>
                        )}

                        <span>{server.isActive ? 'Usado no app' : 'Desativado'}</span>
                      </div>
                    </div>
                    <div className="admin-server-controls">
                      <button className="admin-mini-btn" data-focusable="true" onClick={() => toggleServer(server.id)}>
                        {server.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="admin-mini-btn" data-focusable="true" onClick={() => void runHealthChecks([server])}>
                        Status
                      </button>
                      <button className="admin-mini-btn admin-mini-btn--danger" data-focusable="true" onClick={() => removeServer(server.id)}>
                        Remover
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {message && <div className="admin-message">{message}</div>}
        </section>

        {/* Volume Control Widget */}
        {showVolumeWidget && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}
          >
            <VolumeControlWidget onClose={() => setShowVolumeWidget(false)} />
          </div>
        )}
      </main>

      {editTarget && (
        <div className="modal-overlay admin-edit-overlay">
          <div className="modal-content admin-edit-dialog">
            <div className="admin-edit-heading">
              <h2>{editTarget.title}</h2>
              <button className="admin-mini-btn" data-focusable="true" onClick={() => setEditTarget(null)}>
                Fechar
              </button>
            </div>
            <div className="admin-edit-value">{editTarget.masked ? maskValue(editValue) : editValue || '—'}</div>
            <Keyboard
              label={editTarget.title}
              value={editValue}
              masked={editTarget.masked}
              doneLabel="Aplicar"
              onChange={setEditValue}
              onDone={applyEdit}
              allowWhenModal
            />
          </div>
        </div>
      )}
    </div>
  )
}
