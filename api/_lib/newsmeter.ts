import { createHmac, timingSafeEqual } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { z } from 'zod'

export type VercelRequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  query: Record<string, string | string[] | undefined>
}

export type VercelResponseLike = {
  status: (code: number) => VercelResponseLike
  json: (value: unknown) => void
  send: (value: unknown) => void
  end: () => void
  setHeader: (name: string, value: string | string[]) => void
}

const eventTypes = [
  'app_opened', 'player_opened', 'playback_requested', 'playback_started',
  'playback_paused', 'playback_resumed', 'playback_buffering', 'playback_recovered',
  'heartbeat', 'channel_changed', 'playback_stopped', 'playback_failed',
  'app_backgrounded', 'app_closed', 'session_expired',
] as const

const eventSchema = z.object({
  event_id: z.string().min(8).max(128),
  event_type: z.enum(eventTypes),
  session_id: z.string().min(8).max(128),
  client_device_token: z.string().min(16).max(512),
  channel_id: z.string().uuid().nullable().optional(),
  program_id: z.string().uuid().nullable().optional(),
  stream_id: z.string().max(512).nullable().optional(),
  timestamp: z.string().datetime({ offset: true }),
  playback_position: z.number().finite().nonnegative().nullable().optional(),
  player_state: z.string().max(80).nullable().optional(),
  app_version: z.string().max(80),
  platform: z.string().max(80),
  country: z.string().length(2).nullable().optional(),
  state: z.string().max(10).nullable().optional(),
  network_type: z.string().max(60).nullable().optional(),
  error_code: z.string().max(160).nullable().optional(),
  buffering_duration: z.number().finite().nonnegative().max(86_400).nullable().optional(),
  previous_channel_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).strict()

const channelSchema = z.object({
  canonical_key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  name: z.string().min(2).max(160),
  country: z.string().length(2).default('BR'),
  language: z.string().min(2).max(12).default('pt-BR'),
  category: z.string().min(2).max(80).default('news'),
  logo_url: z.string().url().nullable().optional(),
  stream_id: z.string().max(512).nullable().optional(),
  epg_channel_id: z.string().max(512).nullable().optional(),
  source_provider: z.string().max(160).nullable().optional(),
  is_active: z.boolean().default(true),
}).strict()

const channelPatchSchema = channelSchema.partial().strict()
const simulationSchema = z.object({
  viewers: z.number().int().min(1).max(500).default(40),
  duration_minutes: z.number().int().min(1).max(120).default(10),
}).strict()

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

const rateBuckets = new Map<string, { startedAt: number; count: number }>()
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 360

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`)
  return value
}

function setHeaders(res: VercelResponseLike): void {
  for (const [name, value] of Object.entries(CORS_HEADERS)) res.setHeader(name, value)
}

function json(res: VercelResponseLike, status: number, body: unknown): void {
  res.status(status).json(body)
}

function textHeader(req: VercelRequestLike, name: string): string {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function isAdminTokenAuthorized(authorization: string, configured: string): boolean {
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  return !!supplied && !!configured && safeEqual(supplied, configured)
}

function requireAdmin(req: VercelRequestLike, res: VercelResponseLike): boolean {
  const configured = process.env.NEWSMETER_ADMIN_TOKEN?.trim()
  if (!configured) {
    json(res, 503, { error: 'NEWSMETER_ADMIN_TOKEN não configurado.' })
    return false
  }
  const authorization = textHeader(req, 'authorization')
  if (!isAdminTokenAuthorized(authorization, configured)) {
    json(res, 401, { error: 'Não autorizado.' })
    return false
  }
  return true
}

function deviceHash(clientToken: string): string {
  return createHmac('sha256', env('NEWSMETER_DEVICE_HMAC_SECRET')).update(clientToken).digest('hex')
}

function rateLimit(key: string): boolean {
  const now = Date.now()
  const current = rateBuckets.get(key)
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.startedAt > RATE_WINDOW_MS * 2) rateBuckets.delete(bucketKey)
    }
  }
  return current.count <= RATE_LIMIT
}

function parseBody(req: VercelRequestLike): unknown {
  if (typeof req.body !== 'string') return req.body
  if (Buffer.byteLength(req.body, 'utf8') > 128_000) throw new Error('Payload excede o limite permitido.')
  return JSON.parse(req.body)
}

function supabaseHeaders(prefer?: string): Record<string, string> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

async function supabase(path: string, init: RequestInit = {}): Promise<Response> {
  const base = env('SUPABASE_URL').replace(/\/$/, '')
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(), ...(init.headers || {}) },
    cache: 'no-store',
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error(JSON.stringify({ scope: 'newsmeter', path, status: response.status, detail: detail.slice(0, 800) }))
    throw new Error(`Falha no banco (${response.status}).`)
  }
  return response
}

async function rpc<T = unknown>(name: string, body: unknown): Promise<T> {
  const response = await supabase(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) })
  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

function queryValue(req: VercelRequestLike, name: string, fallback = ''): string {
  const value = req.query[name]
  return Array.isArray(value) ? value[0] || fallback : value || fallback
}

function rangeStart(range: string): string {
  const now = new Date()
  const start = new Date(now)
  if (range === '15m') start.setMinutes(start.getMinutes() - 15)
  else if (range === '1h') start.setHours(start.getHours() - 1)
  else if (range === 'today') start.setHours(0, 0, 0, 0)
  else if (range === 'yesterday') {
    start.setDate(start.getDate() - 1)
    start.setHours(0, 0, 0, 0)
  } else if (range === '7d') start.setDate(start.getDate() - 7)
  else if (range === '30d') start.setDate(start.getDate() - 30)
  else start.setHours(start.getHours() - 1)
  return start.toISOString()
}

async function ingest(req: VercelRequestLike, res: VercelResponseLike, expectedType?: 'heartbeat'): Promise<void> {
  try {
    const payload = eventSchema.parse(parseBody(req))
    if (expectedType && payload.event_type !== expectedType) {
      json(res, 400, { error: 'Tipo de evento incompatível com o endpoint.' })
      return
    }
    const anonymousDeviceId = deviceHash(payload.client_device_token)
    if (!rateLimit(anonymousDeviceId)) {
      json(res, 429, { error: 'Limite de eventos excedido.' })
      return
    }
    const occurredAt = new Date(payload.timestamp)
    const delaySeconds = Math.max(0, Math.round((Date.now() - occurredAt.getTime()) / 1000))
    const enriched = {
      ...payload,
      anonymous_device_id: anonymousDeviceId,
      client_device_token: undefined,
      is_late_event: delaySeconds > 300,
      ingest_delay_seconds: delaySeconds,
      accepted_policy_version: String(payload.metadata.privacy_policy_version || ''),
    }
    const result = await rpc<{ accepted?: boolean; duplicate?: boolean; reason?: string }>('newsmeter_ingest_event', { payload: enriched })
    json(res, result?.duplicate ? 200 : 202, { accepted: result?.accepted !== false, duplicate: !!result?.duplicate, reason: result?.reason || null })
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(res, 400, { error: 'Evento inválido.', issues: error.issues })
      return
    }
    json(res, 500, { error: error instanceof Error ? error.message : 'Falha ao registrar evento.' })
  }
}

async function live(res: VercelResponseLike): Promise<void> {
  const payload = await rpc('newsmeter_live_snapshot', {})
  json(res, 200, payload || { summary: {}, ranking: [], trend: [], platforms: [], versions: [] })
}

async function history(req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  const start = rangeStart(queryValue(req, 'range', '1h'))
  const response = await supabase(
    `audience_minute_aggregates?select=minute_timestamp,channel_id,program_id,active_viewers,unique_viewers,valid_watch_seconds,sessions_started,sessions_ended,channel_entries,channel_exits,average_watch_time,buffering_seconds,playback_errors,share,internal_rating,peak_concurrent,channels(name)&minute_timestamp=gte.${encodeURIComponent(start)}&order=minute_timestamp.asc&limit=25000`,
  )
  const rows = await response.json() as Array<Record<string, unknown> & { channels?: { name?: string } | null }>
  json(res, 200, { data: rows.map(({ channels, ...row }) => ({ ...row, channel_name: channels?.name || null })) })
}

async function transitions(req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  const data = await rpc('newsmeter_transition_matrix', { from_timestamp: rangeStart(queryValue(req, 'range', '1h')) })
  json(res, 200, { data: data || [] })
}

async function technical(req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  const data = await rpc('newsmeter_technical_health', { from_timestamp: rangeStart(queryValue(req, 'range', '1h')) })
  json(res, 200, { data: data || [] })
}

async function channelDetail(id: string, res: VercelResponseLike): Promise<void> {
  const response = await supabase(`channels?select=*,streams(*),programs(*)&id=eq.${encodeURIComponent(id)}&limit=1`)
  const rows = await response.json() as unknown[]
  if (!rows[0]) {
    json(res, 404, { error: 'Canal não encontrado.' })
    return
  }
  json(res, 200, rows[0])
}

async function programDetail(id: string, res: VercelResponseLike): Promise<void> {
  const response = await supabase(`programs?select=*,channels(name,canonical_key)&id=eq.${encodeURIComponent(id)}&limit=1`)
  const rows = await response.json() as unknown[]
  if (!rows[0]) {
    json(res, 404, { error: 'Programa não encontrado.' })
    return
  }
  json(res, 200, rows[0])
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value)
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function makeCsv(rows: Array<Record<string, unknown>>): Buffer {
  const columns = rows.length ? Object.keys(rows[0]) : ['message']
  const lines = [columns.map(csvCell).join(';')]
  if (!rows.length) lines.push(csvCell('Sem dados para o período.'))
  else for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(';'))
  lines.push('')
  lines.push(csvCell('Os dados representam exclusivamente a utilização medida dentro deste aplicativo e não correspondem à audiência total da televisão brasileira.'))
  return Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8')
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name)
    const compressed = deflateRawSync(file.data)
    const crc = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, compressed)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, ...centrals, end])
}

function xmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] || char)
}

function makeXlsx(rows: Array<Record<string, unknown>>): Buffer {
  const safeRows = rows.length ? rows : [{ mensagem: 'Sem dados para o período.' }]
  const columns = Object.keys(safeRows[0])
  const allRows = [columns, ...safeRows.map((row) => columns.map((column) => row[column])), [
    'Aviso', 'Os dados representam exclusivamente a utilização medida dentro deste aplicativo e não correspondem à audiência total da televisão brasileira.',
  ]]
  const sheetRows = allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
    const reference = `${String.fromCharCode(65 + (columnIndex % 26))}${rowIndex + 1}`
    return typeof cell === 'number' ? `<c r="${reference}"><v>${cell}</v></c>` : `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`
  }).join('')}</row>`).join('')
  const files = [
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: Buffer.from('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="NewsMeter" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`) },
  ]
  return zip(files)
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function makePdf(rows: Array<Record<string, unknown>>): Buffer {
  const lines = ['NewsMeter Brasil - Relatório interno', '', ...rows.slice(0, 45).map((row) => Object.values(row).slice(0, 7).join(' | ')), '', 'Os dados representam exclusivamente a utilização medida dentro deste aplicativo', 'e não correspondem à audiência total da televisão brasileira.']
  const content = lines.map((line, index) => `BT /F1 ${index === 0 ? 16 : 8} Tf 42 ${800 - index * 15} Td (${pdfEscape(line.slice(0, 145))}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(body, 'latin1')
}

async function exportReport(req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  const format = queryValue(req, 'format', 'csv').toLowerCase()
  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    json(res, 400, { error: 'Formato inválido.' })
    return
  }
  const start = rangeStart(queryValue(req, 'range', '1h'))
  const response = await supabase(`audience_minute_aggregates?select=minute_timestamp,channel_id,program_id,active_viewers,unique_viewers,valid_watch_seconds,sessions_started,sessions_ended,channel_entries,channel_exits,average_watch_time,buffering_seconds,playback_errors,share,internal_rating,peak_concurrent&minute_timestamp=gte.${encodeURIComponent(start)}&order=minute_timestamp.asc&limit=50000`)
  const rows = await response.json() as Array<Record<string, unknown>>
  const filename = `newsmeter-${new Date().toISOString().slice(0, 10)}.${format}`
  const buffer = format === 'csv' ? makeCsv(rows) : format === 'xlsx' ? makeXlsx(rows) : makePdf(rows)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf')
  res.status(200).send(buffer)
}

async function simulate(req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.NEWSMETER_ALLOW_SIMULATION !== 'true') {
    json(res, 404, { error: 'Simulador indisponível em produção.' })
    return
  }
  try {
    const input = simulationSchema.parse(parseBody(req) || {})
    const result = await rpc('newsmeter_simulate', input)
    json(res, 202, { accepted: true, result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(res, 400, { error: 'Configuração de simulação inválida.', issues: error.issues })
      return
    }
    throw error
  }
}

export async function handleAudience(req: VercelRequestLike, res: VercelResponseLike, segments: string[]): Promise<void> {
  setHeaders(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  const [resource, id] = segments
  try {
    if (req.method === 'POST' && resource === 'events') return await ingest(req, res)
    if (req.method === 'POST' && resource === 'heartbeat') return await ingest(req, res, 'heartbeat')
    if (!requireAdmin(req, res)) return
    if (req.method === 'GET' && (resource === 'live' || resource === 'ranking')) return await live(res)
    if (req.method === 'GET' && resource === 'history') return await history(req, res)
    if (req.method === 'GET' && resource === 'transitions') return await transitions(req, res)
    if (req.method === 'GET' && resource === 'technical-health') return await technical(req, res)
    if (req.method === 'GET' && resource === 'export') return await exportReport(req, res)
    if (req.method === 'GET' && resource === 'channels' && id) return await channelDetail(id, res)
    if (req.method === 'GET' && resource === 'programs' && id) return await programDetail(id, res)
    if (req.method === 'POST' && resource === 'simulate') return await simulate(req, res)
    json(res, 404, { error: 'Endpoint não encontrado.' })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Erro interno.' })
  }
}

async function listChannels(res: VercelResponseLike): Promise<void> {
  const response = await supabase('channels?select=*,streams(*)&order=name.asc')
  json(res, 200, { data: await response.json() })
}

async function createChannel(req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  try {
    const channel = channelSchema.parse(parseBody(req))
    const response = await supabase('channels', {
      method: 'POST',
      headers: supabaseHeaders('return=representation'),
      body: JSON.stringify(channel),
    })
    const rows = await response.json() as unknown[]
    json(res, 201, rows[0])
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(res, 400, { error: 'Canal inválido.', issues: error.issues })
      return
    }
    throw error
  }
}

async function patchChannel(id: string, req: VercelRequestLike, res: VercelResponseLike): Promise<void> {
  try {
    const patch = channelPatchSchema.parse(parseBody(req))
    const response = await supabase(`channels?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: supabaseHeaders('return=representation'),
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    })
    const rows = await response.json() as unknown[]
    if (!rows[0]) {
      json(res, 404, { error: 'Canal não encontrado.' })
      return
    }
    json(res, 200, rows[0])
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(res, 400, { error: 'Alteração inválida.', issues: error.issues })
      return
    }
    throw error
  }
}

async function validateChannel(id: string, res: VercelResponseLike): Promise<void> {
  const result = await rpc<{ valid: boolean; issues: string[] }>('newsmeter_validate_channel_mapping', { target_channel_id: id })
  json(res, 200, result)
}

export async function handleAdminChannels(req: VercelRequestLike, res: VercelResponseLike, segments: string[]): Promise<void> {
  setHeaders(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (!requireAdmin(req, res)) return
  const [id, action] = segments
  try {
    if (!id && req.method === 'GET') return await listChannels(res)
    if (!id && req.method === 'POST') return await createChannel(req, res)
    if (id && !action && req.method === 'PATCH') return await patchChannel(id, req, res)
    if (id && action === 'validate-mapping' && req.method === 'POST') return await validateChannel(id, res)
    json(res, 404, { error: 'Endpoint administrativo não encontrado.' })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Erro interno.' })
  }
}
