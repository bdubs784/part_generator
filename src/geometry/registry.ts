// Every part type the app knows about. Adding a gear later means writing
// shared/gear.ts (inputs, auto rules, validation) and src/geometry/gear.ts
// (solids), then adding one entry here.

import type { Shape3D } from 'replicad'
import type { FieldDef, ParamDef, ValidationResult } from '../../shared/params'
import type { WithOverrides } from '../../shared/form'
import {
  DEFAULT_INPUTS,
  FIELDS,
  PARAMS,
  PRESETS,
  resolveBearing,
  type BearingInputs,
  type BearingParams,
} from '../../shared/bearing'
import { validateBearing } from '../../shared/validate'
import { buildBearing } from './bearing'

export interface PartType<I extends WithOverrides, P extends object> {
  id: string
  name: string
  defaults: I
  presets: { name: string; inputs: I }[]
  params: ParamDef<keyof P & string>[]
  fields: FieldDef<keyof P & string>[]
  resolve: (inputs: I) => P
  // Fix-ups after any edit, e.g. turning off negative play clears it.
  normalize: (inputs: I) => I
  validate: (p: P) => ValidationResult<keyof P & string>
  // Named bodies, each one becomes its own STEP/STL download.
  build: (p: P) => Record<string, Shape3D>
}

export const bearing: PartType<BearingInputs, BearingParams> = {
  id: 'bearing',
  name: 'Ball bearing',
  defaults: DEFAULT_INPUTS,
  presets: PRESETS,
  params: PARAMS,
  fields: FIELDS,
  resolve: resolveBearing,
  normalize: (i) => (!i.negative_play && i.play < 0 ? { ...i, play: 0 } : i),
  validate: validateBearing,
  build: (p) => {
    const { inner, outer } = buildBearing(p)
    return { inner_ring: inner, outer_ring: outer }
  },
}
