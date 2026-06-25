import { put, head } from '@vercel/blob'

// Node.js serverless function (default runtime — Edge não suporta @vercel/blob)

const BLOB_PATHNAME = 'arelon/shared-admin-config.json'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function setCors(res: any) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v)
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

export default async function handler(req: any, res: any) {
  setCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method === 'GET') {
    const data = await getConfig()
    if (!data) {
      res.status(404).json({ error: 'Config not found' })
      return
    }
    res.status(200).json(data)
    return
  }

  if (req.method === 'PUT') {
    let body: unknown
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    } catch {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }

    const blob = await put(BLOB_PATHNAME, JSON.stringify(body), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    })

    const saved = await fetch(blob.url, { cache: 'no-store' }).then((r) => r.json())
    res.status(200).json(saved)
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
