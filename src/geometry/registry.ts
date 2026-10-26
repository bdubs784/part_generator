// Every part type the app knows about. Adding a gear later means writing
// shared/gear.ts (inputs, auto rules, validation), src/geometry/gear.ts
// (solids, registered in builders.ts for the worker), then one entry here.
// Nothing in here imports CAD code, so the main bundle stays small.

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
  // Untouched fields "Make it fit" may change, most expendable first.
  fitOrder: (keyof P & string)[]
  validate: (p: P) => ValidationResult<keyof P & string>
  // Named bodies the worker builds; each becomes its own STEP/STL download.
  bodies: string[]
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
  // holes are an accessory, the shaft and ball size usually aren't negotiable,
  // and the OD is the envelope it has to fit in
  fitOrder: ['hole_d', 'hole_n', 'bore', 'ball_d', 'od'],
  validate: validateBearing,
  bodies: ['inner_ring', 'outer_ring'],
}
