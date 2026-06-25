import { put, head } from '@vercel/blob'

export const config = { runtime: 'edge' }

const BLOB_PATHNAME = 'arelon/shared-admin-config.json'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  })
}

async function getConfig(): Promise<unknown | null> {
  try {
    const meta = await head(BLOB_PATHNAME)
    if (!meta?.url) return null
    const res = await fetch(meta.url, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (request.method === 'GET') {
    const data = await getConfig()
    if (!data) {
      return json(404, { error: 'Config not found' })
    }
    return json(200, data)
  }

  if (request.method === 'PUT') {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const blob = await put(BLOB_PATHNAME, JSON.stringify(body), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    })

    const saved = await fetch(blob.url, { cache: 'no-store' }).then((r) => r.json())
    return json(200, saved)
  }

  return json(405, { error: 'Method not allowed' })
}
