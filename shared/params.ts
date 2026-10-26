// Types every part type shares. A part's resolved params are a flat object of
// numbers (switches are 0/1), which keeps the sliders, share links and the API
// all generic.

export interface ParamDef<K extends string = string> {
  key: K
  label: string
  unit: 'mm' | 'deg' | ''
  min: number
  max: number
  step: number
  integer?: boolean
}

// How a param shows up in the form.
export interface FieldDef<K extends string = string> {
  key: K
  section: 'basic' | 'advanced'
  group: string // heading inside the section
  kind: 'number' | 'select' | 'toggle'
  dependsOn?: K // hidden while that value is 0 (e.g. hole count with no holes)
  derived?: boolean // worked out automatically unless the user overrides it
  options?: { label: string; value: number }[]
  custom?: boolean // select that also allows typing any value
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
