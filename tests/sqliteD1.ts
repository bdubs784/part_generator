// Backs the backend's Db interface with node:sqlite so API tests run the
// real SQL and migrations without a Cloudflare runtime.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { Db, Statement } from '../backend/db'

class SqliteStatement implements Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): Statement {
    return new SqliteStatement(this.db, this.sql, values as SQLInputValue[])
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.args) as T | undefined) ?? null
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.args) as T[] }
  }

  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...this.args)
  }
}

export function createTestDb(): Db {
  const db = new DatabaseSync(':memory:')
  const dir = join(import.meta.dirname, '../backend/migrations')
  for (const file of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, file), 'utf8'))
  return { prepare: (sql) => new SqliteStatement(db, sql) }
}
