// Bearing solids. Port of the CadQuery tower bearing script: same profiles,
// same frame (ring axis = Y, fill notch on the -Y "bottom" face), so the STEP
// files line up with the old ones in an assembly.
//
// Pure functions: params in, replicad shapes out. setOC() has to have been
// called before any of this runs (see oc.ts).

import { draw, drawPolysides, makeBox, makeCylinder, type Shape3D, type Sketch } from 'replicad'
import {
  boltCircle,
  BORE,
  boreDiameter,
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
  if (!p.fill_notch) return ring
  const y0 = -p.width / 2
  // start a hair below the face so the cut doesn't leave a zero-thickness skin
  const box = makeBox([r0, y0 - 0.01, -p.notch_w / 2], [r1, y0 + p.notch_h, p.notch_w / 2])
  return ring.cut(box)
}

export function buildOuterRing(p: BearingParams): Shape3D {
  const g = raceGeometry(p)
  let ring = revolveProfile(outerProfile(p, g))
  ring = cutHoles(ring, boltCircle(p.outer_bolt_d, p.outer_bolt_angle, p.hole_n), p.hole_d, p.width)
  // from inside the ring gap out to just past the outer race flat
  return cutNotch(ring, p, p.inner_od / 2, g.outerFlatR + NOTCH_OVERCUT)
}

// Hex prism along Y, across flats = af. drawPolysides takes the corner radius.
function hexPrism(af: number, length: number): Shape3D {
  const sketch = drawPolysides(af / Math.sqrt(3), 6).sketchOnPlane('XY', [0, 0, -length / 2]) as Sketch
  return sketch.extrude(length).rotate(90, [0, 0, 0], [1, 0, 0])
}

// The material a D-flat adds back into a round bore: the circular segment
// beyond the flat, on the +X side (same side as the fill notch).
function dFlatSegment(boreR: number, depth: number, width: number): Shape3D {
  const box = makeBox([boreR - depth, -width / 2, -boreR], [boreR + 0.5, width / 2, boreR])
  return box.intersect(makeCylinder(boreR + 0.5, width, [0, -width / 2, 0], [0, 1, 0]))
}

function cutBore(p: BearingParams, g: ReturnType<typeof raceGeometry>): Shape3D {
  const d = boreDiameter(p)
  if (p.bore_shape === BORE.HEX) {
    // revolve with a smaller round hole, then cut the hex through it
    const ring = revolveProfile(innerProfile(p, g, d * 0.45))
    return ring.cut(hexPrism(d, p.width + 2))
  }
  const ring = revolveProfile(innerProfile(p, g))
  if (p.bore_shape === BORE.DFLAT) return ring.fuse(dFlatSegment(d / 2, p.dflat, p.width))
  return ring
}

export function buildInnerRing(p: BearingParams): Shape3D {
  const g = raceGeometry(p)
  let ring = cutBore(p, g)
  ring = cutHoles(ring, boltCircle(p.inner_bolt_d, p.inner_bolt_angle, p.hole_n), p.hole_d, p.width)
  // from just inside the inner race flat out into the ring gap
  return cutNotch(ring, p, g.innerFlatR - NOTCH_OVERCUT, p.outer_id / 2)
}

export function buildBearing(p: BearingParams): BearingShapes {
  return { inner: buildInnerRing(p), outer: buildOuterRing(p) }
}
