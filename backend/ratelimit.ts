// Fixed-window rate limit on writes, counted in D1.
//
// A Durable Object or Cloudflare's rate limiting binding would be more exact,
// but this is one upsert per POST, works the same in local dev and tests, and
// saves are rare enough that a D1 write each is nothing.

import type { Db } from './db'
import { sha256Hex } from '../shared/hash'

export const WINDOW_SECONDS = 600
export const MAX_WRITES = 20

export interface RateResult {
  allowed: boolean
  retryAfter: number // seconds until the window resets
}

export async function checkRateLimit(
  db: Db,
  ip: string,
  salt: string,
  limit = MAX_WRITES,
  now = Date.now(),
): Promise<RateResult> {
  const key = await sha256Hex(`${salt}:${ip}`)
  const nowSec = Math.floor(now / 1000)
  const windowStart = nowSec - (nowSec % WINDOW_SECONDS)

  // New window resets the count; same window adds one.
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>()

  // Old windows are dead weight; sweep them now and then.
  if (Math.random() < 0.02) {
    await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(windowStart).run()
  }

  const count = row?.count ?? 1
  return { allowed: count <= limit, retryAfter: windowStart + WINDOW_SECONDS - nowSec }
}
