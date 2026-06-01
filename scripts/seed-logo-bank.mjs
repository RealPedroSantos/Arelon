#!/usr/bin/env node
// Usage: node scripts/seed-logo-bank.mjs <serverUrl> <username> <password> [--force]
// Example: node scripts/seed-logo-bank.mjs http://purolab.online:80 myuser mypass

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGOS_DIR = path.join(ROOT, 'public', 'assets', 'logos')
const MANIFEST_PATH = path.join(LOGOS_DIR, 'manifest.json')
const CONCURRENCY = 4
const TIMEOUT_MS = 12_000

// Mirrors src/lib/logoResolver.ts — keep in sync
function normalizeKey(name) {
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(hd|fhd|full\s*hd|sd|4k|h264|h265|hevc|1080p|720p|3d|vip|alt)\b/gi, '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\|[^|]*\|/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim()

  if (cleaned.includes('aande') || cleaned === 'ae') return 'aande'
  if (cleaned.includes('foxsports2') || cleaned.includes('foxsport2')) return 'foxsports2'
  if (cleaned.includes('foxsports') || cleaned.includes('foxsport')) return 'foxsports'
  if (cleaned.includes('sportv3')) return 'sportv3'
  if (cleaned.includes('sportv2')) return 'sportv2'
  if (cleaned.includes('sportv') || cleaned.includes('spoptv')) return 'sportv'
  if (cleaned.includes('espnbrasil')) return 'espnbrasil'
  if (cleaned.includes('espn2')) return 'espn2'
  if (cleaned.includes('espnextra')) return 'espnextra'
  if (cleaned.includes('espn')) return 'espn'
  if (cleaned.includes('premiere2')) return 'premiere2'
  if (cleaned.includes('premiere3')) return 'premiere3'
  if (cleaned.includes('premiere4')) return 'premiere4'
  if (cleaned.includes('premiere5')) return 'premiere5'
  if (cleaned.includes('premiere6')) return 'premiere6'
  if (cleaned.includes('premiere7')) return 'premiere7'
  if (cleaned.includes('premiere8')) return 'premiere8'
  if (cleaned.includes('premiereclubes')) return 'premiereclubes'
  if (cleaned.includes('premierefc') || cleaned.includes('premiere')) return 'premiere'
  if (cleaned.includes('globonews')) return 'globonews'
  if (cleaned.includes('gloob')) return 'gloob'
  if (cleaned.includes('globorj') || cleaned.includes('globo')) return 'globo'
  if (cleaned.includes('telecineaction')) return 'telecineaction'
  if (cleaned.includes('telecinefun')) return 'telecinefun'
  if (cleaned.includes('telecinepipoca')) return 'telecinepipoca'
  if (cleaned.includes('telecinepremium')) return 'telecinepremium'
  if (cleaned.includes('telecinetouch')) return 'telecinetouch'
  if (cleaned.includes('telecinecult')) return 'telecinecult'
  if (cleaned.includes('hbo2')) return 'hbo2'
  if (cleaned.includes('hbofamily')) return 'hbofamily'
  if (cleaned.includes('hboplus')) return 'hboplus'
  if (cleaned.includes('hbosignature')) return 'hbosignature'
  if (cleaned.includes('hbo')) return 'hbo'
  if (cleaned.includes('disneyjunior') || cleaned.includes('disneyjr')) return 'disneyjunior'
  if (cleaned.includes('nickelodeon') || cleaned.includes('nick')) return cleaned.includes('jr') ? 'nickjr' : 'nickelodeon'
  if (cleaned.includes('discoverykids')) return 'discoverykids'
  if (cleaned.includes('discoveryhomehealth') || cleaned.includes('discoveryhomeandhealth')) return 'discoveryhomehealth'
  if (cleaned.includes('discoverychannel')) return 'discoverychannel'
  if (cleaned.includes('discoveryscience')) return 'discoveryscience'
  if (cleaned.includes('discoveryturbo')) return 'discoveryturbo'
  if (cleaned.includes('discoverycivilization')) return 'discoverycivilization'
  if (cleaned.includes('discoverytheater')) return 'discoverytheater'
  if (cleaned.includes('discoveryworld')) return 'discoveryworld'
  if (cleaned.includes('animalplanet')) return 'animalplanet'
  if (cleaned.includes('comedycentral')) return 'comedycentral'
  if (cleaned.includes('history2') || cleaned.includes('h2')) return 'history2'
  if (cleaned.includes('history')) return 'history'
  if (cleaned.includes('nationalgeographic') || cleaned.includes('natgeo')) {
    if (cleaned.includes('wild')) return 'natgeowild'
    if (cleaned.includes('kids')) return 'natgeokids'
    return 'nationalgeographic'
  }
  if (cleaned.includes('warner')) return 'warner'
  if (cleaned.includes('studiouniversal')) return 'studiouniversal'
  if (cleaned.includes('cnn')) return 'cnn'

  return cleaned
}

function extFromUrl(url) {
  try {
    const pathname = new URL(url).pathname
    const m = pathname.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i)
    return m ? m[1].toLowerCase() : null
  } catch {
    return null
  }
}

function extFromContentType(ct) {
  if (!ct) return null
  if (ct.includes('png')) return 'png'
  if (ct.includes('svg')) return 'svg'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  return null
}

async function downloadLogo(key, logoUrl, force) {
  const urlExt = extFromUrl(logoUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(logoUrl, { signal: controller.signal, redirect: 'follow' })
    clearTimeout(timer)

    if (!res.ok) return { status: 'fail', reason: `HTTP ${res.status}` }

    const ct = res.headers.get('content-type') ?? ''
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) {
      return { status: 'fail', reason: `not image: ${ct.split(';')[0]}` }
    }

    const ext = urlExt ?? extFromContentType(ct) ?? 'png'
    const filename = `${key}.${ext}`
    const destPath = path.join(LOGOS_DIR, filename)
    const buf = await res.arrayBuffer()
    await writeFile(destPath, Buffer.from(buf))

    return { status: 'ok', path: `/assets/logos/${filename}`, bytes: buf.byteLength }
  } catch (err) {
    clearTimeout(timer)
    return { status: 'fail', reason: err.message }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const force = args.includes('--force')
  const positional = args.filter((a) => !a.startsWith('--'))
  const [serverUrl, username, password] = positional

  if (!serverUrl || !username || !password) {
    console.error('Usage: node scripts/seed-logo-bank.mjs <serverUrl> <username> <password> [--force]')
    process.exit(1)
  }

  await mkdir(LOGOS_DIR, { recursive: true })

  let manifest = {}
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  } catch {
    // starting fresh
  }

  const base = serverUrl.replace(/\/$/, '')
  const u = encodeURIComponent(username)
  const p = encodeURIComponent(password)
  const apiUrl = `${base}/player_api.php?username=${u}&password=${p}&action=get_live_streams`

  console.log(`Fetching channels from ${base}…`)
  const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(30_000) })
  if (!apiRes.ok) throw new Error(`API error: HTTP ${apiRes.status}`)
  const channels = await apiRes.json()
  if (!Array.isArray(channels)) throw new Error('Unexpected API response (not an array)')
  console.log(`Found ${channels.length} raw entries`)

  // Collect unique key → first valid logoUrl
  const toDownload = new Map()
  for (const ch of channels) {
    const logoUrl = ch.stream_icon?.trim()
    if (!logoUrl || !logoUrl.startsWith('http')) continue
    const key = normalizeKey(ch.name?.trim() ?? '')
    if (!key) continue
    if (!toDownload.has(key)) toDownload.set(key, logoUrl)
  }
  console.log(`Unique channel keys: ${toDownload.size}\n`)

  let downloaded = 0, skipped = 0, failed = 0
  const entries = [...toDownload.entries()]

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async ([key, logoUrl]) => {
        if (!force && manifest[key]) {
          skipped++
          return
        }

        const result = await downloadLogo(key, logoUrl, force)
        if (result.status === 'ok') {
          manifest[key] = result.path
          downloaded++
          console.log(`  OK   [${key}]  ${(result.bytes / 1024).toFixed(1)} KB`)
        } else {
          failed++
          console.warn(`  FAIL [${key}]  ${result.reason}`)
        }
      }),
    )
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')

  console.log(`\nDone.`)
  console.log(`  Downloaded : ${downloaded}`)
  console.log(`  Skipped    : ${skipped}`)
  console.log(`  Failed     : ${failed}`)
  console.log(`  Manifest   : ${Object.keys(manifest).length} entries → ${MANIFEST_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
