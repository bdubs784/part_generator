// "Make it fit": repair a broken design while keeping the user's edits.
//
// The user's edited fields are pinned. We first drop overrides they didn't
// make, then change one field at a time to the nearest value that fixes the
// design (or leaves the fewest errors), trying untouched fields before
// pinned ones and the oldest edit before the newest. Greedy, but every step
// is a single visible change the user can undo.

import { clearOverride, setField, type WithOverrides } from './form'
import type { FieldDef, ParamDef, ValidationResult } from './params'

const MAX_ROUNDS = 8
const SAMPLES = 120 // candidate values per number field

export interface FitChange {
  key: string
  from: number
  to: number
}

export interface FitResult<I> {
  inputs: I
  changes: FitChange[]
  ok: boolean
}

interface FitOptions<I, P> {
  fields: FieldDef[]
  defs: Map<string, ParamDef>
  pinned: string[] // edited fields, oldest first
  order: string[] // which untouched fields to give up first
  resolve: (i: I) => P
  validate: (p: P) => ValidationResult
}

function candidates(field: FieldDef, def: ParamDef, current: number): number[] {
  let values: number[]
  if (field.kind === 'select') {
    values = (field.options ?? []).map((o) => o.value)
  } else {
    const step = def.integer ? 1 : def.step
    values = []
    for (let i = 0; i <= SAMPLES; i++) {
      const v = def.min + ((def.max - def.min) * i) / SAMPLES
      values.push(Number((Math.round(v / step) * step).toFixed(6)))
    }
  }
  return [...new Set(values)].filter((v) => v !== current).sort((a, b) => Math.abs(a - current) - Math.abs(b - current))
}

export function fitAround<I extends WithOverrides, P extends object>(start: I, opts: FitOptions<I, P>): FitResult<I> {
  const value = (i: I, key: string) => (opts.resolve(i) as Record<string, number>)[key]
  const errorCount = (i: I) => opts.validate(opts.resolve(i)).issues.filter((x) => x.severity === 'error').length
  const byKey = new Map(opts.fields.map((f) => [f.key, f]))
  const pinned = new Set(opts.pinned)

  let inputs = start
  const changes: FitChange[] = []
  const record = (key: string, from: number, to: number) => {
    const prev = changes.find((c) => c.key === key)
    if (prev) prev.to = to
    else changes.push({ key, from, to })
  }

  // Overrides the user didn't make this session (e.g. from a preset) go back to auto.
  for (const field of opts.fields) {
    if (!field.derived || pinned.has(field.key) || inputs.overrides[field.key] === undefined) continue
    const from = value(inputs, field.key)
    inputs = clearOverride(inputs, field)
    record(field.key, from, value(inputs, field.key))
  }

  // untouched fields in the part's preferred order, then edits oldest first
  const order = [...opts.order.filter((k) => !pinned.has(k)), ...opts.pinned]

  let errors = errorCount(inputs)
  for (let round = 0; round < MAX_ROUNDS && errors > 0; round++) {
    let best: { key: string; v: number; errors: number } | null = null
    for (const key of order) {
      const field = byKey.get(key)
      const def = opts.defs.get(key)
      if (!field || !def || field.kind === 'toggle') continue
      const current = value(inputs, key)
      let keyBest: { v: number; errors: number } | null = null
      for (const v of candidates(field, def, current)) {
        const e = errorCount(setField(inputs, field, v))
        if (e < (keyBest?.errors ?? errors)) keyBest = { v, errors: e }
        if (e === 0) break // nearest value that fixes everything
      }
      if (keyBest && keyBest.errors < (best?.errors ?? errors)) best = { key, ...keyBest }
      if (best?.errors === 0) break // earliest field in the order wins
    }
    if (!best) break
    const field = byKey.get(best.key)!
    const from = value(inputs, best.key)
    inputs = setField(inputs, field, best.v)
    record(best.key, from, best.v)
    errors = best.errors
  }

  return { inputs, changes: changes.filter((c) => c.from !== c.to), ok: errors === 0 }
}
