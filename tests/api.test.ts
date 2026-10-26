import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../backend/index'
import type { Env } from '../backend/db'
import { MAX_WRITES } from '../backend/ratelimit'
import { DEFAULT_INPUTS, PRESETS } from '../shared/bearing'
import { createTestDb } from './sqliteD1'

const SITE = 'https://bdubs784.github.io/part_generator/'
let env: Env

beforeEach(() => {
  env = { DB: createTestDb(), SITE_URL: SITE, IP_SALT: 'test' }
})

const call = (path: string, init: RequestInit & { ip?: string } = {}) => {
  const headers = new Headers(init.headers)
  headers.set('CF-Connecting-IP', init.ip ?? '203.0.113.7')
  return handle(new Request(`https://api.test${path}`, { ...init, headers }), env)
}

const save = (body: unknown, ip?: string) =>
  call('/api/designs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ip,
  })

describe('GET /api/health', () => {
  it('reports ok and the catalog size', async () => {
    const res = await call('/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, catalog: 24 })
  })
})

describe('GET /api/catalog/bearings', () => {
  it('lists standard sizes with real dimensions', async () => {
    const res = await call('/api/catalog/bearings')
    const { bearings } = await res.json()
    expect(bearings.find((b: { designation: string }) => b.designation === '608')).toMatchObject({
      bore_mm: 8,
      od_mm: 22,
      width_mm: 7,
    })
    // sorted small to large
    expect(bearings[0].designation).toBe('623')
  })
})

describe('POST /api/designs', () => {
  it('saves a valid design and returns a share link', async () => {
    const res = await save({ part_type: 'bearing', params: DEFAULT_INPUTS })
    expect(res.status).toBe(201)
    const { id, url } = await res.json()
    expect(id).toMatch(/^[a-z2-9]{6}$/)
    expect(url).toBe(`${SITE}?d=${id}`)
  })

  it('returns the same id for the same design, regardless of key order', async () => {
    const first = await (await save({ part_type: 'bearing', params: DEFAULT_INPUTS })).json()
    const reordered = Object.fromEntries(Object.entries(DEFAULT_INPUTS).reverse())
    const again = await save({ part_type: 'bearing', params: reordered })
    expect(again.status).toBe(200)
    expect((await again.json()).id).toBe(first.id)
  })

  it('rejects invalid parameters with the validator messages', async () => {
    const res = await save({ part_type: 'bearing', params: { ...DEFAULT_INPUTS, od: 45 } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid parameters')
    expect(body.issues.length).toBeGreaterThan(0)
  })

  it('rejects malformed bodies', async () => {
    expect((await save('{not json')).status).toBe(400)
    expect((await save({ part_type: 'gear', params: DEFAULT_INPUTS })).status).toBe(400)
    expect((await save({ part_type: 'bearing', params: { ...DEFAULT_INPUTS, bore: '52' } })).status).toBe(400)
    expect((await save({ part_type: 'bearing' })).status).toBe(400)
  })

  it('rejects oversized bodies', async () => {
    const res = await save({ part_type: 'bearing', params: DEFAULT_INPUTS, junk: 'x'.repeat(20_000) })
    expect(res.status).toBe(413)
  })

  it('rate limits writes per IP', async () => {
    for (let i = 0; i < MAX_WRITES; i++) {
      expect((await save({ part_type: 'bearing', params: DEFAULT_INPUTS })).status).toBeLessThan(300)
    }
    const blocked = await save({ part_type: 'bearing', params: DEFAULT_INPUTS })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
    // someone else is unaffected
    expect((await save({ part_type: 'bearing', params: DEFAULT_INPUTS }, '198.51.100.1')).status).toBe(200)
  })
})

describe('GET /api/designs/:id', () => {
  it('returns exactly what was saved', async () => {
    const preset = PRESETS[1].inputs
    const { id } = await (await save({ part_type: 'bearing', params: preset })).json()
    const res = await call(`/api/designs/${id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ id, part_type: 'bearing', schema_ver: 1 })
    expect(body.params).toEqual(preset)
  })

  it('404s on unknown or malformed ids', async () => {
    expect((await call('/api/designs/zzzzzz')).status).toBe(404)
    expect((await call('/api/designs/../../etc')).status).toBe(404)
    expect((await call('/api/designs/abc')).status).toBe(404)
  })
})

describe('routing and CORS', () => {
  it('404s unknown paths and 405s wrong methods', async () => {
    expect((await call('/api/nope')).status).toBe(404)
    expect((await call('/api/designs')).status).toBe(405)
  })

  it('allows the Pages site and localhost', async () => {
    for (const origin of ['https://bdubs784.github.io', 'http://localhost:5173']) {
      const res = await call('/api/health', { headers: { Origin: origin } })
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    }
  })

  it('gives other origins no CORS headers', async () => {
    const res = await call('/api/health', { headers: { Origin: 'https://evil.example' } })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('answers preflight requests', async () => {
    const res = await call('/api/designs', {
      method: 'OPTIONS',
      headers: { Origin: 'https://bdubs784.github.io', 'Access-Control-Request-Method': 'POST' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })
})
