// Reading and writing form values for parts whose inputs are "base values +
// overrides of derived values". Shared so the bearing (and later the gear)
// don't each reimplement it.

import { snapRange, validRange } from './bounds'
import type { FieldDef, ParamDef, ValidationResult } from './params'

export interface WithOverrides {
  overrides: Partial<Record<string, number>>
}

export function isOverridden<I extends WithOverrides>(inputs: I, field: FieldDef): boolean {
  return field.derived === true && inputs.overrides[field.key] !== undefined
}

// Derived fields write to overrides; everything else writes straight through.
export function setField<I extends WithOverrides>(inputs: I, field: FieldDef, value: number): I {
  if (field.derived) return { ...inputs, overrides: { ...inputs.overrides, [field.key]: value } }
  return { ...inputs, [field.key]: value }
}

export function clearOverride<I extends WithOverrides>(inputs: I, field: FieldDef): I {
  const overrides = { ...inputs.overrides }
  delete overrides[field.key]
  return { ...inputs, overrides }
}

// Slider range for one field: as far as it can go with everything else held.
// Derived values that aren't overridden keep following along while we probe.
export function fieldRange<I extends WithOverrides, P>(
  inputs: I,
  field: FieldDef,
  def: ParamDef,
  current: number,
  resolve: (i: I) => P,
  validate: (p: P) => ValidationResult,
): [number, number] {
  // integer fields (ball count, hole count) only make sense at whole numbers
  const ok = (v: number) => validate(resolve(setField(inputs, field, def.integer ? Math.round(v) : v))).ok
  const range = validRange(current, def.min, def.max, ok)
  return snapRange(range, def.integer ? 1 : def.step, current, ok)
}

// Whether picking an option from a select would leave a valid design.
export function optionValid<I extends WithOverrides, P>(
  inputs: I,
  field: FieldDef,
  value: number,
  resolve: (i: I) => P,
  validate: (p: P) => ValidationResult,
): boolean {
  return validate(resolve(setField(inputs, field, value))).ok
}
