// The C++/WebAssembly engine (engine/src/bearing.cpp, built on Manifold).
// This file turns a bearing into the plain numbers the C++ takes: the ring's
// cross-section plus a list of cutting tools, computed from the same shared
// functions the OpenCascade builder uses, so both engines build the same ring.

import {
  BORE,
  boltCircle,
  boreDiameter,
  innerProfile,
  NOTCH_OVERCUT,
  outerProfile,
  raceGeometry,
  type BearingParams,
} from '../../shared/bearing'
import type { MeshData } from './mesh'

export interface RingRecipe {
  profile: number[] // x0, y0, x1, y1, ...
  segments: number
  cylinders: number[] // x, z, r, y0, y1 per tool
  boxes: number[] // x0, y0, z0, x1, y1, z1 per tool
  hexAcrossFlats: number // 0 = round bore
  dflatR: number
  dflatDepth: number // 0 = no D-flat
  width: number
}

export interface RingResult {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  volume: number
  ms: number // time spent inside the C++, without the JS <-> wasm copying
  ok: boolean
}

export interface BearingEngine {
  buildRing(
    profile: number[],
    segments: number,
    cylinders: number[],
    boxes: number[],
    hexAcrossFlats: number,
    dflatR: number,
    dflatDepth: number,
    width: number,
  ): RingResult
}

// Enough segments around the ring that the facets are within 0.02 mm of the
// true circle (the sagitta of each chord), clamped to a sane range.
export function segmentsFor(radius: number, tolerance = 0.02): number {
  const step = Math.acos(1 - Math.min(tolerance / radius, 1))
  return Math.min(512, Math.max(64, Math.ceil((2 * Math.PI) / step)))
}

function holeCylinders(p: BearingParams, diameter: number, angle: number): number[] {
  if (p.hole_d <= 0) return []
  const h = p.width / 2
  const out: number[] = []
  for (const [x, z] of boltCircle(diameter, angle, p.hole_n)) {
    out.push(x, z, p.hole_d / 2, -h - 1, h + 1)
    if (p.counterbore) out.push(x, z, p.cb_d / 2, h - p.cb_depth, h + 1)
  }
  return out
}

function notchBox(p: BearingParams, r0: number, r1: number): number[] {
  if (!p.fill_notch) return []
  const y0 = -p.width / 2
  return [r0, y0 - 0.01, -p.notch_w / 2, r1, y0 + p.notch_h, p.notch_w / 2]
}

const flat = (pts: [number, number][]) => pts.flat()

export function innerRecipe(p: BearingParams): RingRecipe {
  const g = raceGeometry(p)
  const d = boreDiameter(p)
  const hex = p.bore_shape === BORE.HEX
  return {
    // a hex bore starts from a smaller round hole, same as the OpenCascade path
    profile: flat(hex ? innerProfile(p, g, d * 0.45) : innerProfile(p, g)),
    segments: segmentsFor(p.inner_od / 2),
    cylinders: holeCylinders(p, p.inner_bolt_d, p.inner_bolt_angle),
    boxes: notchBox(p, g.innerFlatR - NOTCH_OVERCUT, p.outer_id / 2),
    hexAcrossFlats: hex ? d : 0,
    dflatR: p.bore_shape === BORE.DFLAT ? d / 2 : 0,
    dflatDepth: p.bore_shape === BORE.DFLAT ? p.dflat : 0,
    width: p.width,
  }
}

export function outerRecipe(p: BearingParams): RingRecipe {
  const g = raceGeometry(p)
  return {
    profile: flat(outerProfile(p, g)),
    segments: segmentsFor((p.flange ? p.flange_od : p.od) / 2),
    cylinders: holeCylinders(p, p.outer_bolt_d, p.outer_bolt_angle),
    boxes: notchBox(p, p.inner_od / 2, g.outerFlatR + NOTCH_OVERCUT),
    hexAcrossFlats: 0,
    dflatR: 0,
    dflatDepth: 0,
    width: p.width,
  }
}

export function runRecipe(engine: BearingEngine, r: RingRecipe): RingResult {
  return engine.buildRing(r.profile, r.segments, r.cylinders, r.boxes, r.hexAcrossFlats, r.dflatR, r.dflatDepth, r.width)
}

// Manifold already gives smooth normals with sharp edges split, so the
// preview can use its mesh directly. Edges are left empty: there are no B-rep
// edges to draw.
export function toMeshData(r: RingResult): MeshData {
  return { positions: r.positions, normals: r.normals, indices: r.indices, edges: new Float32Array(0) }
}
