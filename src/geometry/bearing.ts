// Bearing solids. Port of the CadQuery tower bearing script: same profiles,
// same frame (ring axis = Y, fill notch on the -Y "bottom" face), so the STEP
// files line up with the old ones in an assembly.
//
// Pure functions: params in, replicad shapes out. setOC() has to have been
// called before any of this runs (see oc.ts).

import { draw, makeBox, makeCylinder, type Shape3D, type Sketch } from 'replicad'
import {
  boltCircle,
  innerProfile,
  NOTCH_OVERCUT,
  outerProfile,
  raceGeometry,
  type BearingParams,
  type Profile,
} from '../../shared/bearing'

export interface BearingShapes {
  inner: Shape3D
  outer: Shape3D
}

function revolveProfile(pts: Profile): Shape3D {
  let pen = draw(pts[0])
  for (const pt of pts.slice(1)) pen = pen.lineTo(pt)
  // a single closed profile always sketches to one Sketch
  const sketch = pen.close().sketchOnPlane('XY') as Sketch
  // revolve around the Y axis through the origin, like revolve(360,(0,0,0),(0,1,0))
  return sketch.revolve([0, 1, 0])
}

function cutHoles(ring: Shape3D, holes: [number, number][], hole_d: number, width: number): Shape3D {
  if (hole_d <= 0) return ring
  const len = width + 2
  for (const [x, z] of holes) {
    ring = ring.cut(makeCylinder(hole_d / 2, len, [x, -len / 2, z], [0, 1, 0]))
  }
  return ring
}

// Rectangular notch in the bottom face, centred on +X, spanning radius r0..r1.
function cutNotch(ring: Shape3D, p: BearingParams, r0: number, r1: number): Shape3D {
  if (p.notch_w <= 0 || p.notch_h <= 0) return ring
  const y0 = -p.width / 2
  // start a hair below the face so the cut doesn't leave a zero-thickness skin
  const box = makeBox([r0, y0 - 0.01, -p.notch_w / 2], [r1, y0 + p.notch_h, p.notch_w / 2])
  return ring.cut(box)
}

export function buildOuterRing(p: BearingParams): Shape3D {
  const g = raceGeometry(p)
  let ring = revolveProfile(outerProfile(p, g))
  ring = cutHoles(ring, boltCircle(p.outer_bolt_d, p.outer_bolt_angle), p.hole_d, p.width)
  // from inside the ring gap out to just past the outer race flat
  return cutNotch(ring, p, p.inner_od / 2, g.outerFlatR + NOTCH_OVERCUT)
}

export function buildInnerRing(p: BearingParams): Shape3D {
  const g = raceGeometry(p)
  let ring = revolveProfile(innerProfile(p, g))
  ring = cutHoles(ring, boltCircle(p.inner_bolt_d, p.inner_bolt_angle), p.hole_d, p.width)
  // from just inside the inner race flat out into the ring gap
  return cutNotch(ring, p, g.innerFlatR - NOTCH_OVERCUT, p.outer_id / 2)
}

export function buildBearing(p: BearingParams): BearingShapes {
  return { inner: buildInnerRing(p), outer: buildOuterRing(p) }
}
