// Every part type the app knows about. Adding a gear later means writing
// shared/gear.ts (params + validation) and src/geometry/gear.ts (solids),
// then adding one entry here.

import type { Shape3D } from 'replicad'
import type { ParamDef, ValidationResult } from '../../shared/params'
import { DEFAULTS, PARAMS, PRESETS, type BearingParams } from '../../shared/bearing'
import { validateBearing } from '../../shared/validate'
import { buildBearing } from './bearing'

export interface PartType<P extends object> {
  id: string
  name: string
  defaults: P
  params: ParamDef<keyof P & string>[]
  presets: { name: string; params: P }[]
  validate: (p: P) => ValidationResult<keyof P & string>
  // Named bodies, each one becomes its own STEP/STL download.
  build: (p: P) => Record<string, Shape3D>
}

export const bearing: PartType<BearingParams> = {
  id: 'bearing',
  name: 'Ball bearing',
  defaults: DEFAULTS,
  params: PARAMS,
  presets: PRESETS,
  validate: validateBearing,
  build: (p) => {
    const { inner, outer } = buildBearing(p)
    return { inner_ring: inner, outer_ring: outer }
  },
}
