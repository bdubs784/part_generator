// Cloudflare Worker for the part generator. Geometry stays in the browser;
// this only stores designs and serves the bearing catalog.
//
// Handlers are thin: parse, validate with the same shared code the UI uses,
// call the data layer, respond.

import type { Db, Env } from './db'
import { countDownload, getDesign, ID_PATTERN, listRecent, saveDesign, type Cursor, type DesignRow } from './designs'
import { checkRateLimit } from './ratelimit'
import { resolveBearing, SCHEMA_VER } from '../shared/bearing'
import { parseBearingInputs, validateBearing } from '../shared/validate'
import { sha256Hex, stableStringify } from '../shared/hash'

const ALLOWED_ORIGINS = [/^https:\/\/bdubs784\.github\.io$/, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/]
const MAX_BODY_BYTES = 10_000
const PAGE_DEFAULT = 20
const PAGE_MAX = 50
// downloads are cheap and frequent; saves are rarer
const DOWNLOAD_LIMIT = 120

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.some((re) => re.test(origin))) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

const error = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  json({ error: message, ...extra }, status)

async function health(db: Db): Promise<Response> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM catalog_bearings').first<{ n: number }>()
  return json({ ok: true, catalog: row?.n ?? 0 })
}

async function listCatalog(db: Db): Promise<Response> {
  const { results } = await db
    .prepare('SELECT designation, bore_mm, od_mm, width_mm, notes FROM catalog_bearings ORDER BY bore_mm, od_mm')
    .all()
  return json({ bearings: results }, 200, { 'Cache-Control': 'public, max-age=3600' })
}

async function createDesign(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const limit = Number(env.WRITE_LIMIT) || undefined
  const rate = await checkRateLimit(env.DB, ip, env.IP_SALT ?? 'dev-salt', limit)
  if (!rate.allowed) {
    return json({ error: 'Too many saves, try again later' }, 429, { 'Retry-After': String(rate.retryAfter) })
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return error(413, 'Request body too large')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return error(400, 'Body must be JSON')
  }

  const { part_type, params } = (body ?? {}) as { part_type?: unknown; params?: unknown }
  if (part_type !== 'bearing') return error(400, 'Unknown part_type')
  const inputs = parseBearingInputs(params)
  if (!inputs) return error(400, 'params is missing fields or has non-numeric values')

  // Same rules as the UI. Never trust the client.
  const result = validateBearing(resolveBearing(inputs))
  if (!result.ok) {
    const issues = result.issues.filter((i) => i.severity === 'error').map((i) => i.message)
    return error(400, 'Invalid parameters', { issues })
  }

  const params_json = stableStringify(inputs)
  const params_hash = await sha256Hex(`${part_type}:${SCHEMA_VER}:${params_json}`)
  const { row, created } = await saveDesign(env.DB, { part_type, params_json, params_hash, schema_ver: SCHEMA_VER })
  return json({ id: row.id, url: `${env.SITE_URL}?d=${row.id}` }, created ? 201 : 200)
}

const publicDesign = (row: DesignRow) => ({
  id: row.id,
  part_type: row.part_type,
  schema_ver: row.schema_ver,
  params: JSON.parse(row.params_json),
  created_at: row.created_at,
  downloads: row.downloads,
})

async function readDesign(env: Env, id: string): Promise<Response> {
  if (!ID_PATTERN.test(id)) return error(404, 'Design not found')
  const row = await getDesign(env.DB, id)
  if (!row) return error(404, 'Design not found')
  // short cache: the params never change, but the download count does
  return json(publicDesign(row), 200, { 'Cache-Control': 'public, max-age=60' })
}

// The cursor is just the last row's (created_at, id), base64'd so clients
// treat it as opaque.
const encodeCursor = (c: Cursor) => btoa(JSON.stringify([c.created_at, c.id]))
function decodeCursor(raw: string): Cursor | null {
  try {
    const [created_at, id] = JSON.parse(atob(raw))
    return typeof created_at === 'string' && typeof id === 'string' && ID_PATTERN.test(id) ? { created_at, id } : null
  } catch {
    return null
  }
}

async function listDesigns(url: URL, env: Env): Promise<Response> {
  const sort = url.searchParams.get('sort') ?? 'recent'
  if (sort !== 'recent') return error(400, 'sort must be "recent"')
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw === null ? PAGE_DEFAULT : Number(limitRaw)
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) return error(400, `limit must be 1-${PAGE_MAX}`)
  const beforeRaw = url.searchParams.get('before')
  const before = beforeRaw ? decodeCursor(beforeRaw) : undefined
  if (before === null) return error(400, 'Bad cursor')

  // one extra row tells us whether there's another page
  const rows = await listRecent(env.DB, limit + 1, before)
  const page = rows.slice(0, limit)
  const next = rows.length > limit ? encodeCursor(page[page.length - 1]) : null
  return json({ designs: page.map(publicDesign), next }, 200, { 'Cache-Control': 'public, max-age=30' })
}

async function recordDownload(request: Request, env: Env, id: string): Promise<Response> {
  if (!ID_PATTERN.test(id)) return error(404, 'Design not found')
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const rate = await checkRateLimit(env.DB, `download:${ip}`, env.IP_SALT ?? 'dev-salt', DOWNLOAD_LIMIT)
  if (!rate.allowed) return json({ error: 'Too many requests' }, 429, { 'Retry-After': String(rate.retryAfter) })
  if (!(await countDownload(env.DB, id))) return error(404, 'Design not found')
  return new Response(null, { status: 204 })
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const { pathname } = url
  const method = request.method

  if (pathname === '/api/health' && method === 'GET') return health(env.DB)
  if (pathname === '/api/catalog/bearings' && method === 'GET') return listCatalog(env.DB)
  if (pathname === '/api/designs' && method === 'POST') return createDesign(request, env)
  if (pathname === '/api/designs' && method === 'GET') return listDesigns(url, env)
  const one = pathname.match(/^\/api\/designs\/([^/]+)$/)
  if (one && method === 'GET') return readDesign(env, one[1])
  const download = pathname.match(/^\/api\/designs\/([^/]+)\/download$/)
  if (download && method === 'POST') return recordDownload(request, env, download[1])

  const known = ['/api/health', '/api/catalog/bearings', '/api/designs'].includes(pathname) || one || download
  return known ? error(405, 'Method not allowed') : error(404, 'Not found')
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(request.headers.get('Origin'))
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

  let response: Response
  try {
    response = await route(request, env)
  } catch (e) {
    console.error(e)
    response = error(500, 'Something went wrong')
  }
  for (const [k, v] of Object.entries(cors)) response.headers.set(k, v)
  return response
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
}
