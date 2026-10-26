// Bearing parameters and the race math. No CAD library in here on purpose:
// the backend imports this too, and it can't load a 10 MB OpenCascade wasm.

import type { ParamDef } from './params'

export const SCHEMA_VER = 1

export interface BearingParams {
  ball_d: number // steel ball diameter
  ball_n: number // balls loaded (preview + validation only, they aren't modelled)
  pitch_d: number // ball circle diameter
  play: number // total play, axial = radial because the flanks are 45 deg
  flat: number // flat at the bottom of each V-groove
  width: number // ring thickness
  bore: number // inner ring bore
  inner_od: number // inner ring outside diameter (its lands)
  outer_id: number // outer ring inside diameter (its lands)
  od: number // outer ring outside diameter
  notch_w: number // ball fill notch width, 0 = no notch
  notch_h: number // fill notch depth from the bottom face
  hole_d: number // bolt hole diameter, 0 = no holes
  inner_bolt_d: number
  inner_bolt_angle: number // deg, angle of the first hole from +X
  outer_bolt_d: number
  outer_bolt_angle: number
}

export type ParamKey = keyof BearingParams

// Defaults are the 3/16" tower (base rotation) bearing from the arm, v5 pair.
export const DEFAULTS: BearingParams = {
  ball_d: 4.7625,
  ball_n: 33,
  pitch_d: 73.89,
  play: 0.05,
  flat: 1.0,
  width: 6.4,
  bore: 52,
  inner_od: 72,
  outer_id: 76.7,
  od: 91.7,
  notch_w: 6.3,
  notch_h: 1.8,
  hole_d: 3.0,
  inner_bolt_d: 58,
  inner_bolt_angle: 47.43,
  outer_bolt_d: 85.7,
  outer_bolt_angle: 45,
}

export const PRESETS: { name: string; params: BearingParams }[] = [
  { name: 'Tower 3/16" v5 (0.05 play)', params: DEFAULTS },
  // v5 inner + v7_zero outer. Same inner ring; the ball circle moves in by
  // half the old play so only the outer race changes.
  { name: 'Tower 3/16" v7 (zero play)', params: { ...DEFAULTS, pitch_d: 73.84, play: 0 } },
]

export const PARAMS: ParamDef<ParamKey>[] = [
  { key: 'ball_d', label: 'Ball diameter', unit: 'mm', min: 2, max: 12.7, step: 0.01, group: 'Balls' },
  { key: 'ball_n', label: 'Ball count', unit: '', min: 3, max: 120, step: 1, group: 'Balls', integer: true },
  { key: 'pitch_d', label: 'Ball circle', unit: 'mm', min: 10, max: 200, step: 0.01, group: 'Balls' },
  { key: 'play', label: 'Play', unit: 'mm', min: -0.1, max: 0.5, step: 0.005, group: 'Balls' },
  { key: 'flat', label: 'Groove flat', unit: 'mm', min: 0, max: 3, step: 0.05, group: 'Rings' },
  { key: 'width', label: 'Thickness', unit: 'mm', min: 2, max: 30, step: 0.1, group: 'Rings' },
  { key: 'bore', label: 'Bore', unit: 'mm', min: 1, max: 190, step: 0.1, group: 'Rings' },
  { key: 'inner_od', label: 'Inner ring OD', unit: 'mm', min: 5, max: 200, step: 0.05, group: 'Rings' },
  { key: 'outer_id', label: 'Outer ring ID', unit: 'mm', min: 5, max: 210, step: 0.05, group: 'Rings' },
  { key: 'od', label: 'Outer diameter', unit: 'mm', min: 10, max: 250, step: 0.1, group: 'Rings' },
  { key: 'notch_w', label: 'Notch width', unit: 'mm', min: 0, max: 20, step: 0.1, group: 'Fill notch' },
  { key: 'notch_h', label: 'Notch depth', unit: 'mm', min: 0, max: 15, step: 0.1, group: 'Fill notch' },
  { key: 'hole_d', label: 'Hole diameter', unit: 'mm', min: 0, max: 10, step: 0.1, group: 'Bolt holes' },
  { key: 'inner_bolt_d', label: 'Inner bolt circle', unit: 'mm', min: 2, max: 200, step: 0.1, group: 'Bolt holes' },
  { key: 'inner_bolt_angle', label: 'Inner hole angle', unit: 'deg', min: 0, max: 90, step: 0.01, group: 'Bolt holes' },
  { key: 'outer_bolt_d', label: 'Outer bolt circle', unit: 'mm', min: 5, max: 250, step: 0.1, group: 'Bolt holes' },
  { key: 'outer_bolt_angle', label: 'Outer hole angle', unit: 'deg', min: 0, max: 90, step: 0.01, group: 'Bolt holes' },
]

// Holes per ring. Fixed for now, both tower rings use 4.
export const HOLE_COUNT = 4

// The notch floor goes this far past the groove flat so the ball clears the
// flat edge on its way in (same 0.10 as the CadQuery version).
export const NOTCH_OVERCUT = 0.1

export interface RaceGeometry {
  A: number // outer flank line: r + |y| = A
  B: number // inner flank line: r - |y| = B
  outerFlatR: number // radius of the outer race flat
  innerFlatR: number
  outerMouth: number // half height of the outer groove where it meets the lands
  innerMouth: number
  contactY: number // height of the ball/flank contact point above mid plane
  maxBalls: number
}

// Gap left between neighbouring balls when working out how many fit, so a
// near-full ring doesn't jam on print tolerance.
export const BALL_GAP = 0.1

export function maxBalls(ball_d: number, pitch_d: number): number {
  const ratio = (ball_d + BALL_GAP) / pitch_d
  if (ratio >= 1) return 0
  // neighbouring centres are a chord of the pitch circle
  return Math.floor(Math.PI / Math.asin(ratio))
}

export function raceGeometry(p: BearingParams): RaceGeometry {
  const r = p.ball_d / 2
  // A ball touching both 45 deg flanks of a V sits sqrt(2)*r from its apex,
  // so with both races the flank lines are 2*sqrt(2)*r apart, plus the play.
  const span = 2 * Math.SQRT2 * r + p.play
  const pitchR = p.pitch_d / 2
  const A = pitchR + span / 2
  const B = pitchR - span / 2
  const f = p.flat / 2
  return {
    A,
    B,
    outerFlatR: A - f,
    innerFlatR: B + f,
    outerMouth: A - p.outer_id / 2,
    innerMouth: p.inner_od / 2 - B,
    contactY: r / Math.SQRT2,
    maxBalls: maxBalls(p.ball_d, p.pitch_d),
  }
}

// [x, y] points of a closed ring cross-section in the XY plane, revolved about Y.
export type Profile = [number, number][]

export function outerProfile(p: BearingParams, g = raceGeometry(p)): Profile {
  const h = p.width / 2
  const f = p.flat / 2
  const R = p.od / 2
  const land = p.outer_id / 2
  return [
    [R, -h],
    [R, h],
    [land, h],
    [land, g.outerMouth],
    [g.outerFlatR, f],
    [g.outerFlatR, -f],
    [land, -g.outerMouth],
    [land, -h],
  ]
}

export function innerProfile(p: BearingParams, g = raceGeometry(p)): Profile {
  const h = p.width / 2
  const f = p.flat / 2
  const land = p.inner_od / 2
  return [
    [p.bore / 2, -h],
    [p.bore / 2, h],
    [land, h],
    [land, g.innerMouth],
    [g.innerFlatR, f],
    [g.innerFlatR, -f],
    [land, -g.innerMouth],
    [land, -h],
  ]
}

// Bolt hole centres as [x, z]; the ring axis is Y.
export function boltCircle(diameter: number, startDeg: number, n = HOLE_COUNT): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180
    out.push([(diameter / 2) * Math.cos(a), (diameter / 2) * Math.sin(a)])
  }
  return out
}
