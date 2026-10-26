// CAD builders per part type. Only the geometry worker imports this, which
// keeps replicad and the OpenCascade glue out of the main bundle.

import type { BearingParams } from '../../shared/bearing'
import { buildInnerRing, buildOuterRing } from './bearing'
import type { Builder } from './service'

export const bearingBuilder: Builder<BearingParams> = (p) => ({
  inner_ring: () => buildInnerRing(p),
  outer_ring: () => buildOuterRing(p),
})
