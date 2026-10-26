// The slice of Cloudflare's D1 API the backend uses. Typed here instead of
// pulling in @cloudflare/workers-types, and small enough that the tests can
// back it with node:sqlite.

export interface Statement {
  bind(...values: unknown[]): Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

export interface Db {
  prepare(query: string): Statement
}

export interface Env {
  DB: Db
  SITE_URL: string // share links point here
  IP_SALT?: string // secret, mixed into hashed IPs for rate limiting
  WRITE_LIMIT?: string // saves per IP per window; raised for local e2e runs
}
