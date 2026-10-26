// Bearing solids. Port of the CadQuery tower bearing script: same profiles,
// same frame (ring axis = Y, fill notch on the -Y "bottom" face), so the STEP
// files line up with the old ones in an assembly.
//
// Pure functions: params in, replicad shapes out. setOC() has to have been
// called before any of this runs (see oc.ts).

import { draw, drawPolysides, makeBox, makeCompound, makeCylinder, type Shape3D, type Sketch } from 'replicad'
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

// Cutting tools for the bolt holes: a through hole each, with its counterbore
// fused on from the top (+Y) face if they're on.
function holeTools(holes: [number, number][], p: BearingParams): Shape3D[] {
  if (p.hole_d <= 0) return []
  const len = p.width + 2
  return holes.map(([x, z]) => {
    const hole: Shape3D = makeCylinder(p.hole_d / 2, len, [x, -len / 2, z], [0, 1, 0])
    if (!p.counterbore) return hole
    const floor = p.width / 2 - p.cb_depth
    return hole.fuse(makeCylinder(p.cb_d / 2, p.cb_depth + 1, [x, floor, z], [0, 1, 0]))
  })
}

// Rectangular notch in the bottom face, centred on +X, spanning radius r0..r1.
function notchTool(p: BearingParams, r0: number, r1: number): Shape3D[] {
  if (!p.fill_notch) return []
  const y0 = -p.width / 2
  // start a hair below the face so the cut doesn't leave a zero-thickness skin
  return [makeBox([r0, y0 - 0.01, -p.notch_w / 2], [r1, y0 + p.notch_h, p.notch_w / 2])]
}

// One boolean with every tool in a compound, instead of one cut per hole:
// each cut re-processes the whole ring, so batching them is much faster.
function cutAll(ring: Shape3D, tools: Shape3D[]): Shape3D {
  if (tools.length === 0) return ring
  return ring.cut(makeCompound(tools) as Shape3D)
}

export function buildOuterRing(p: BearingParams): Shape3D {
  const g = raceGeometry(p)
  const ring = revolveProfile(outerProfile(p, g))
  return cutAll(ring, [
    ...holeTools(boltCircle(p.outer_bolt_d, p.outer_bolt_angle, p.hole_n), p),
    // from inside the ring gap out to just past the outer race flat
    ...notchTool(p, p.inner_od / 2, g.outerFlatR + NOTCH_OVERCUT),
  ])
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
  return cutAll(cutBore(p, g), [
    ...holeTools(boltCircle(p.inner_bolt_d, p.inner_bolt_angle, p.hole_n), p),
    // from just inside the inner race flat out into the ring gap
    ...notchTool(p, g.innerFlatR - NOTCH_OVERCUT, p.outer_id / 2),
  ])
}

export function buildBearing(p: BearingParams): BearingShapes {
  return { inner: buildInnerRing(p), outer: buildOuterRing(p) }
}
