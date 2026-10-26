// Data access for saved designs. Handlers validate first; nothing in here
// checks parameter values.

import type { Db } from './db'

export interface DesignRow {
  id: string
  part_type: string
  params_json: string
  params_hash: string
  schema_ver: number
  created_at: string
  downloads: number
}

// No 0/1/i/l/o, so links survive being read out loud or typed from a photo.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export const ID_LENGTH = 6
export const ID_PATTERN = new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`)

export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH))
  // 256 % 31 leaves a tiny bias toward the first few letters; fine for ids
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

export async function getDesign(db: Db, id: string): Promise<DesignRow | null> {
  return db.prepare('SELECT * FROM designs WHERE id = ?').bind(id).first<DesignRow>()
}

export async function findByHash(db: Db, hash: string): Promise<DesignRow | null> {
  return db.prepare('SELECT * FROM designs WHERE params_hash = ?').bind(hash).first<DesignRow>()
}

// Insert, or return the existing row if this exact design was saved before.
// Returns whether a new row was created.
export async function saveDesign(
  db: Db,
  design: { part_type: string; params_json: string; params_hash: string; schema_ver: number },
): Promise<{ row: DesignRow; created: boolean }> {
  const existing = await findByHash(db, design.params_hash)
  if (existing) return { row: existing, created: false }

  // A clash on a 6-char id is ~1 in 900 million per save; retry a few times anyway.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newId()
    const created_at = new Date().toISOString()
    const inserted = await db
      .prepare(
        `INSERT INTO designs (id, part_type, params_json, params_hash, schema_ver, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING
         RETURNING *`,
      )
      .bind(id, design.part_type, design.params_json, design.params_hash, design.schema_ver, created_at)
      .first<DesignRow>()
    if (inserted) return { row: inserted, created: true }

    // Either the id clashed, or someone saved the same design in between.
    const raced = await findByHash(db, design.params_hash)
    if (raced) return { row: raced, created: false }
  }
  throw new Error('could not allocate a design id')
}
