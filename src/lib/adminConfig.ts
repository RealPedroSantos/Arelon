import { DEFAULT_SERVER_URLS, normalizeServerUrl, setServerUrls } from './pool'

export type ServerType = 'xtream' | 'm3u' | 'manifest'

export interface SharedServer {
  id: string
  name: string
  baseUrl: string
  type: ServerType
  parameters: Record<string, string>
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface TestAccount {
  username: string
  password: string
}

export interface PlayerSettings {
  streamTimeoutMs: number
  maxRetryCount: number
  retryBackoffMs: number
}

export interface SharedAdminConfig {
  servers: SharedServer[]
  activeServerId?: string
  playerSettings: PlayerSettings
  testAccount: TestAccount
  updatedAt: string
}

interface RuntimeConfig {
  sharedConfigEndpoint?: string
  tvSharedConfigEndpoint?: string
}

const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  streamTimeoutMs: 15000,
  maxRetryCount: 2,
  retryBackoffMs: 1200,
}

const DEFAULT_SHARED_CONFIG_ENDPOINT = '/api/admin/shared-config'
const LOCAL_CACHE_KEY = 'arelon-shared-admin-config-cache'

function nowIso(): string {
  return new Date().toISOString()
}

export function createSharedServer(baseUrl: string, index = 0): SharedServer {
  const normalized = normalizeServerUrl(baseUrl)
  const now = nowIso()

  return {
    id: `srv_${Date.now().toString(36)}_${index.toString(36)}`,
    name: normalized,
    baseUrl: normalized,
    type: 'xtream',
    parameters: {},
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}

export function getDefaultSharedAdminConfig(): SharedAdminConfig {
  const servers = DEFAULT_SERVER_URLS.map((url, index) => ({
    ...createSharedServer(url, index),
    id: `srv_default_${index + 1}`,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }))

  return {
    servers,
    activeServerId: servers[0]?.id,
    playerSettings: DEFAULT_PLAYER_SETTINGS,
    testAccount: { username: '', password: '' },
    updatedAt: new Date(0).toISOString(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizePlayerSettings(raw: unknown): PlayerSettings {
  if (!isRecord(raw)) return DEFAULT_PLAYER_SETTINGS

  const { streamTimeoutMs, maxRetryCount, retryBackoffMs } = raw
  if (
    typeof streamTimeoutMs !== 'number' ||
    !Number.isFinite(streamTimeoutMs) ||
    typeof maxRetryCount !== 'number' ||
    !Number.isFinite(maxRetryCount) ||
    typeof retryBackoffMs !== 'number' ||
    !Number.isFinite(retryBackoffMs)
  ) {
    return DEFAULT_PLAYER_SETTINGS
  }

  return { streamTimeoutMs, maxRetryCount, retryBackoffMs }
}

function normalizeSharedServer(raw: unknown, index: number): SharedServer | null {
  if (!isRecord(raw)) return null

  const baseUrl = typeof raw.baseUrl === 'string' ? normalizeServerUrl(raw.baseUrl) : ''
  if (!baseUrl) return null

  const now = nowIso()
  const type = raw.type === 'm3u' || raw.type === 'manifest' ? raw.type : 'xtream'
  const parameters = isRecord(raw.parameters)
    ? Object.fromEntries(Object.entries(raw.parameters).filter(([, value]) => typeof value === 'string')) as Record<string, string>
    : {}

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `srv_imported_${index}_${Date.now().toString(36)}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : baseUrl,
    baseUrl,
    type,
    parameters,
    isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  }
}

export function normalizeSharedAdminConfig(raw: unknown): SharedAdminConfig {
  if (!isRecord(raw)) return getDefaultSharedAdminConfig()

  const servers = Array.isArray(raw.servers)
    ? raw.servers.map((server, index) => normalizeSharedServer(server, index)).filter((server): server is SharedServer => Boolean(server))
    : []
  const fallback = getDefaultSharedAdminConfig()
  const testAccount = isRecord(raw.testAccount)
    ? {
        username: typeof raw.testAccount.username === 'string' ? raw.testAccount.username : '',
        password: typeof raw.testAccount.password === 'string' ? raw.testAccount.password : '',
      }
    : fallback.testAccount

  return {
    servers: servers.length > 0 ? servers : fallback.servers,
    activeServerId: typeof raw.activeServerId === 'string' ? raw.activeServerId : servers[0]?.id ?? fallback.activeServerId,
    playerSettings: normalizePlayerSettings(raw.playerSettings),
    testAccount,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
  }
}

export function getConfiguredServerUrls(config: SharedAdminConfig): string[] {
  const servers = config.servers.filter((server) => server.baseUrl)
  const activeServers = servers.filter((server) => server.isActive)
  const poolServers = activeServers.length > 0 ? activeServers : servers
  const preferred = config.activeServerId ? poolServers.find((server) => server.id === config.activeServerId) : null
  const ordered = preferred ? [preferred, ...poolServers.filter((server) => server.id !== preferred.id)] : poolServers
  const urls = ordered.map((server) => server.baseUrl)

  return [...new Set(urls.map(normalizeServerUrl).filter(Boolean))]
}

export function applySharedAdminConfig(config: SharedAdminConfig): void {
  setServerUrls(getConfiguredServerUrls(config))
}

function readCachedConfig(): SharedAdminConfig | null {
  try {
    const cached = window.localStorage.getItem(LOCAL_CACHE_KEY)
    if (!cached) return null
    return normalizeSharedAdminConfig(JSON.parse(cached))
  } catch {
    return null
  }
}

function writeCachedConfig(config: SharedAdminConfig): void {
  try {
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(config))
  } catch {
    // Cache local é apenas conveniência quando a API compartilhada está fora.
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      cache: init.cache ?? 'no-store',
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timer)
  }
}

function resolveEndpoint(endpoint: string | undefined): string | null {
  const trimmed = endpoint?.trim()
  if (!trimmed) return null

  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (window.location.protocol === 'file:' && trimmed.startsWith('/')) return null

  try {
    return new URL(trimmed, window.location.origin || window.location.href).toString()
  } catch {
    return null
  }
}

async function readRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const runtimeUrl = new URL('vetraio-runtime-config.json', document.baseURI || window.location.href).toString()
    const res = await fetchWithTimeout(runtimeUrl, {}, 2500)
    if (!res.ok) return {}
    return (await res.json()) as RuntimeConfig
  } catch {
    return {}
  }
}

export async function getSharedConfigEndpoints(): Promise<string[]> {
  const runtime = await readRuntimeConfig()
  const isTvFileBuild = window.location.protocol === 'file:'
  const env = import.meta.env as Record<string, string | undefined>
  const endpointCandidates = [
    isTvFileBuild ? runtime.tvSharedConfigEndpoint : runtime.sharedConfigEndpoint,
    env.VITE_SHARED_CONFIG_ENDPOINT,
    env.VITE_TV_SHARED_CONFIG_ENDPOINT,
    DEFAULT_SHARED_CONFIG_ENDPOINT,
  ]

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    endpointCandidates.push('http://localhost:8788/api/admin/shared-config')
    endpointCandidates.push('http://127.0.0.1:8788/api/admin/shared-config')
  }

  return [...new Set(endpointCandidates.map(resolveEndpoint).filter((endpoint): endpoint is string => Boolean(endpoint)))]
}

export async function loadSharedAdminConfig(): Promise<SharedAdminConfig> {
  const endpoints = await getSharedConfigEndpoints()

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(endpoint)
      if (!res.ok) continue
      const config = normalizeSharedAdminConfig(await res.json())
      writeCachedConfig(config)
      return config
    } catch {
      // Tenta o próximo endpoint; a tela pública não deve expor esse detalhe.
    }
  }

  return readCachedConfig() ?? getDefaultSharedAdminConfig()
}

export async function saveSharedAdminConfig(config: SharedAdminConfig): Promise<SharedAdminConfig> {
  const endpoints = await getSharedConfigEndpoints()
  const payload = normalizeSharedAdminConfig({ ...config, updatedAt: nowIso() })

  for (const endpoint of endpoints) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        8000,
      )

      if (!res.ok) continue

      const saved = normalizeSharedAdminConfig(await res.json())
      writeCachedConfig(saved)
      return saved
    } catch {
      // Tenta o próximo endpoint
    }
  }

  // Fallback: salva apenas no localStorage quando nenhuma API está disponível
  // (ex: GitHub Pages, file://, ou servidor offline)
  writeCachedConfig(payload)
  console.warn('[adminConfig] Nenhuma API disponível — config salva apenas no localStorage.')
  return payload
}
