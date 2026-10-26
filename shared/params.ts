// Types every part type shares. A part is a flat object of numbers, which
// keeps the sliders, share links and the API all generic.

export interface ParamDef<K extends string = string> {
  key: K
  label: string
  unit: 'mm' | 'deg' | ''
  min: number
  max: number
  step: number
  group: string
  integer?: boolean
}

export type Severity = 'error' | 'warning'

export interface Issue<K extends string = string> {
  severity: Severity
  message: string
  params: K[] // inputs to highlight
}

export interface ValidationResult<K extends string = string> {
  ok: boolean // no errors (warnings are fine)
  issues: Issue<K>[]
}

// Type, range and integer checks straight from the param table.
export function checkRanges<K extends string>(defs: ParamDef<K>[], p: Record<K, unknown>): Issue<K>[] {
  const issues: Issue<K>[] = []
  for (const def of defs) {
    const v = p[def.key]
    const fail = (message: string) => issues.push({ severity: 'error', message, params: [def.key] })
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${def.label} must be a number`)
    else if (v < def.min || v > def.max) fail(`${def.label} must be between ${def.min} and ${def.max}${def.unit ? ' ' + def.unit : ''}`)
    else if (def.integer && !Number.isInteger(v)) fail(`${def.label} must be a whole number`)
  }
  return issues
}

// Pull exactly the declared numeric fields out of an untrusted object.
export function pickParams<K extends string>(defs: ParamDef<K>[], input: unknown): Record<K, number> | null {
  if (typeof input !== 'object' || input === null) return null
  const obj = input as Record<string, unknown>
  const out = {} as Record<K, number>
  for (const def of defs) {
    const v = obj[def.key]
    if (typeof v !== 'number') return null
    out[def.key] = v
  }
  return out
}
