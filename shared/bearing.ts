// Bearing parameters and the race math. No CAD library in here on purpose:
// the backend imports this too, and it can't load a 10 MB OpenCascade wasm.
//
// Two layers:
//   BearingInputs - what the user sets: ball size, bore, OD, play, a few
//                   switches, plus any values they chose to override.
//   BearingParams - every dimension the geometry needs. resolveBearing()
//                   fills in whatever wasn't overridden using rules taken
//                   from the tower bearing that's running on the arm.

import type { FieldDef, ParamDef } from './params'

export const SCHEMA_VER = 1

// Values the user always sets.
export interface BaseInputs {
  ball_d: number // steel ball diameter
  bore: number // inner ring bore
  od: number // outer ring outside diameter
  play: number // total play, axial = radial because the flanks are 45 deg
  hole_d: number // bolt hole diameter, 0 = no holes
  hole_n: number // holes per ring
  fill_notch: number // 1 = cut the ball fill notch
  negative_play: number // 1 = allow play below zero (for printers that print small)
}

// Values worked out automatically unless overridden.
export interface DerivedParams {
  width: number // ring thickness
  ball_n: number // balls loaded (preview + validation only, they aren't modelled)
  pitch_d: number // ball circle diameter
  flat: number // flat at the bottom of each V-groove
  inner_od: number // inner ring outside diameter (its lands)
  outer_id: number // outer ring inside diameter (its lands)
  notch_w: number
  notch_h: number // fill notch depth from the bottom face
  inner_bolt_d: number
  inner_bolt_angle: number // deg, angle of the first hole from +X (the notch)
  outer_bolt_d: number
  outer_bolt_angle: number
}

export type DerivedKey = keyof DerivedParams
export type BearingParams = BaseInputs & DerivedParams
export type ParamKey = keyof BearingParams

export interface BearingInputs extends BaseInputs {
  overrides: Partial<DerivedParams>
}

export const DERIVED_KEYS: DerivedKey[] = [
  'width',
  'ball_n',
  'pitch_d',
  'flat',
  'inner_od',
  'outer_id',
  'notch_w',
  'notch_h',
  'inner_bolt_d',
  'inner_bolt_angle',
  'outer_bolt_d',
  'outer_bolt_angle',
]

// Absolute limits. The UI narrows these further to what actually works with
// the other values (see shared/bounds.ts).
export const PARAMS: ParamDef<ParamKey>[] = [
  { key: 'ball_d', label: 'Ball diameter', unit: 'mm', min: 1.5, max: 12.7, step: 0.01 },
  { key: 'bore', label: 'Bore', unit: 'mm', min: 1, max: 190, step: 0.1 },
  { key: 'od', label: 'Outer diameter', unit: 'mm', min: 10, max: 250, step: 0.1 },
  { key: 'play', label: 'Play', unit: 'mm', min: -0.15, max: 0.3, step: 0.005 },
  { key: 'hole_d', label: 'Bolt holes', unit: 'mm', min: 0, max: 10, step: 0.1 },
  { key: 'hole_n', label: 'Holes per ring', unit: '', min: 2, max: 12, step: 1, integer: true },
  { key: 'fill_notch', label: 'Fill notch', unit: '', min: 0, max: 1, step: 1, integer: true },
  { key: 'negative_play', label: 'Allow negative play', unit: '', min: 0, max: 1, step: 1, integer: true },
  { key: 'width', label: 'Thickness', unit: 'mm', min: 2, max: 30, step: 0.1 },
  { key: 'ball_n', label: 'Ball count', unit: '', min: 3, max: 150, step: 1, integer: true },
  { key: 'pitch_d', label: 'Ball circle', unit: 'mm', min: 5, max: 220, step: 0.01 },
  { key: 'flat', label: 'Groove flat', unit: 'mm', min: 0, max: 5, step: 0.05 },
  { key: 'inner_od', label: 'Inner ring OD', unit: 'mm', min: 3, max: 230, step: 0.05 },
  { key: 'outer_id', label: 'Outer ring ID', unit: 'mm', min: 5, max: 240, step: 0.05 },
  { key: 'notch_w', label: 'Notch width', unit: 'mm', min: 1, max: 20, step: 0.1 },
  { key: 'notch_h', label: 'Notch depth', unit: 'mm', min: 0.2, max: 15, step: 0.1 },
  { key: 'inner_bolt_d', label: 'Inner bolt circle', unit: 'mm', min: 2, max: 230, step: 0.1 },
  { key: 'inner_bolt_angle', label: 'Inner hole angle', unit: 'deg', min: 0, max: 90, step: 0.5 },
  { key: 'outer_bolt_d', label: 'Outer bolt circle', unit: 'mm', min: 5, max: 250, step: 0.1 },
  { key: 'outer_bolt_angle', label: 'Outer hole angle', unit: 'deg', min: 0, max: 90, step: 0.5 },
]

// Common steel ball sizes.
export const BALL_SIZES = [
  { label: '2 mm', value: 2 },
  { label: '3 mm', value: 3 },
  { label: '4 mm', value: 4 },
  { label: '4.5 mm (BB)', value: 4.5 },
  { label: '3/16" (4.76 mm)', value: 4.7625 },
  { label: '5 mm', value: 5 },
  { label: '6 mm', value: 6 },
  { label: '1/4" (6.35 mm)', value: 6.35 },
  { label: '8 mm', value: 8 },
]

// Printed holes come out undersized, so these run a bit big except "M3 tight",
// which is what the tower bearing uses.
export const HOLE_SIZES = [
  { label: 'None', value: 0 },
  { label: 'M2 (2.4)', value: 2.4 },
  { label: 'M2.5 (2.9)', value: 2.9 },
  { label: 'M3 tight (3.0)', value: 3.0 },
  { label: 'M3 (3.4)', value: 3.4 },
  { label: 'M4 (4.5)', value: 4.5 },
]

export const FIELDS: FieldDef<ParamKey>[] = [
  { key: 'od', section: 'basic', group: 'Size', kind: 'number' },
  { key: 'bore', section: 'basic', group: 'Size', kind: 'number' },
  { key: 'width', section: 'basic', group: 'Size', kind: 'number', derived: true },
  { key: 'ball_d', section: 'basic', group: 'Balls', kind: 'select', options: BALL_SIZES, custom: true },
  { key: 'ball_n', section: 'basic', group: 'Balls', kind: 'number', derived: true },
  { key: 'play', section: 'basic', group: 'Balls', kind: 'number' },
  { key: 'negative_play', section: 'basic', group: 'Balls', kind: 'toggle' },
  { key: 'hole_d', section: 'basic', group: 'Mounting', kind: 'select', options: HOLE_SIZES },
  { key: 'hole_n', section: 'basic', group: 'Mounting', kind: 'number', dependsOn: 'hole_d' },
  { key: 'inner_bolt_d', section: 'basic', group: 'Mounting', kind: 'number', derived: true, dependsOn: 'hole_d' },
  { key: 'outer_bolt_d', section: 'basic', group: 'Mounting', kind: 'number', derived: true, dependsOn: 'hole_d' },
  { key: 'fill_notch', section: 'basic', group: 'Mounting', kind: 'toggle' },
  { key: 'pitch_d', section: 'advanced', group: 'Races', kind: 'number', derived: true },
  { key: 'inner_od', section: 'advanced', group: 'Races', kind: 'number', derived: true },
  { key: 'outer_id', section: 'advanced', group: 'Races', kind: 'number', derived: true },
  { key: 'flat', section: 'advanced', group: 'Races', kind: 'number', derived: true },
  { key: 'notch_w', section: 'advanced', group: 'Fill notch', kind: 'number', derived: true, dependsOn: 'fill_notch' },
  { key: 'notch_h', section: 'advanced', group: 'Fill notch', kind: 'number', derived: true, dependsOn: 'fill_notch' },
  { key: 'inner_bolt_angle', section: 'advanced', group: 'Hole angles', kind: 'number', derived: true, dependsOn: 'hole_d' },
  { key: 'outer_bolt_angle', section: 'advanced', group: 'Hole angles', kind: 'number', derived: true, dependsOn: 'hole_d' },
]

// FDM limits, assuming a 0.4 mm nozzle.
export const MIN_WALL = 1.2 // three perimeters
// Groove lips are shorter features than walls. The v5 inner ring has 0.75 mm
// lips and they hold up, so 0.6 is the floor (1.5 line widths).
export const MIN_LIP = 0.6
// How far the lands sit past the ball contact point at minimum, so the ball
// rolls on the flank and not near the lip edge.
export const FLANK_MARGIN = 0.3

// The notch floor goes this far past the groove flat so the ball clears the
// flat edge on its way in (same 0.10 as the CadQuery version).
export const NOTCH_OVERCUT = 0.1

// Gap left between neighbouring balls when working out how many fit, so a
// near-full ring doesn't jam on print tolerance.
export const BALL_GAP = 0.1

// Ratios from the tower bearing (3/16" balls), used for the auto values.
export const TOWER = {
  width: 6.4 / 4.7625, // thickness per ball diameter
  flat: 1.0 / 4.7625,
  notchClearance: 1.5, // notch width over the ball diameter, mm
  notchFloor: 1.4 / 4.7625, // notch floor below the mid plane, per ball diameter
  fill: 0.7, // load ~70% of the max balls (33 of 47 on the tower)
}

export const DEFAULT_INPUTS: BearingInputs = {
  ball_d: 4.7625,
  bore: 52,
  od: 91.7,
  play: 0.05,
  hole_d: 3.0,
  hole_n: 4,
  fill_notch: 1,
  negative_play: 0,
  overrides: {},
}

// The rings that are actually on the arm. They predate the auto rules, so
// they pin every derived value.
const TOWER_V5: BearingInputs = {
  ...DEFAULT_INPUTS,
  overrides: {
    width: 6.4,
    ball_n: 33,
    pitch_d: 73.89,
    flat: 1.0,
    inner_od: 72,
    outer_id: 76.7,
    notch_w: 6.3,
    notch_h: 1.8,
    inner_bolt_d: 58,
    inner_bolt_angle: 47.43,
    outer_bolt_d: 85.7,
    outer_bolt_angle: 45,
  },
}

export const PRESETS: { name: string; inputs: BearingInputs }[] = [
  { name: 'Tower 3/16" v5 (0.05 play)', inputs: TOWER_V5 },
  // v5 inner + v7_zero outer. Same inner ring; the ball circle moves in by
  // half the old play so only the outer race changes.
  {
    name: 'Tower 3/16" v7 (zero play)',
    inputs: { ...TOWER_V5, play: 0, overrides: { ...TOWER_V5.overrides, pitch_d: 73.84 } },
  },
]

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

type RaceInputs = Pick<BearingParams, 'ball_d' | 'pitch_d' | 'play' | 'flat' | 'inner_od' | 'outer_id'>

export function maxBalls(ball_d: number, pitch_d: number): number {
  const ratio = (ball_d + BALL_GAP) / pitch_d
  if (ratio >= 1) return 0
  // neighbouring centres are a chord of the pitch circle
  return Math.floor(Math.PI / Math.asin(ratio))
}

export function raceGeometry(p: RaceInputs): RaceGeometry {
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

// Widest flat that stays clear of the ball. Along the groove's centre line the
// ball surface is (sqrt(2) - 1) * r short of the V apex, plus each race's half
// of the play.
export function maxFlat(ball_d: number, play: number): number {
  return 2 * ((Math.SQRT2 - 1) * (ball_d / 2) + play / 2)
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step
const floorTo = (v: number, step: number) => Math.floor(v / step + 1e-9) * step
const clean = (v: number) => Number(v.toFixed(4))

// Fill in every value that wasn't overridden. Order matters: later rules use
// earlier results (overridden or not).
export function resolveBearing(inputs: BearingInputs): BearingParams {
  const o = inputs.overrides
  const d = inputs.ball_d
  const pick = <K extends DerivedKey>(key: K, auto: () => number): number => o[key] ?? clean(auto())

  // Tower proportion, but thick enough for the minimum lip plus flank margin
  // above the contact point (matters for small balls).
  const contactY = d / 2 / Math.SQRT2
  const width = pick('width', () =>
    Math.max(roundTo(d * TOWER.width, 0.1), Math.ceil(20 * (contactY + FLANK_MARGIN + MIN_LIP)) / 10),
  )
  // ball circle in the middle of the radial space, so both ring walls match
  const pitch_d = pick('pitch_d', () => (inputs.bore + inputs.od) / 2)
  // tower proportion, but never more than 80% of what the ball allows
  const flat = pick('flat', () => Math.max(0, floorTo(Math.min(d * TOWER.flat, 0.8 * maxFlat(d, inputs.play)), 0.05)))

  // Lands halfway between the ball contact point and the face, but never so
  // close to the face that the lip drops under the minimum. The 0.01 covers
  // rounding the diameters below.
  const g0 = raceGeometry({ ball_d: d, pitch_d, play: inputs.play, flat, inner_od: 0, outer_id: 0 })
  const mouth = Math.min((contactY + width / 2) / 2, width / 2 - MIN_LIP - 0.01)
  const inner_od = pick('inner_od', () => roundTo(2 * (g0.B + mouth), 0.01))
  const outer_id = pick('outer_id', () => roundTo(2 * (g0.A - mouth), 0.01))

  const ball_n = pick('ball_n', () => Math.max(3, Math.round(TOWER.fill * maxBalls(d, pitch_d))))
  const notch_w = pick('notch_w', () => roundTo(d + TOWER.notchClearance, 0.1))
  const notch_h = pick('notch_h', () => roundTo(width / 2 - d * TOWER.notchFloor, 0.1))

  // bolt circles centred in the wall between the bore/OD and the groove
  const innerGrooveR = g0.innerFlatR - NOTCH_OVERCUT
  const outerGrooveR = g0.outerFlatR + NOTCH_OVERCUT
  const inner_bolt_d = pick('inner_bolt_d', () => roundTo(inputs.bore / 2 + innerGrooveR, 0.1))
  const outer_bolt_d = pick('outer_bolt_d', () => roundTo(outerGrooveR + inputs.od / 2, 0.1))
  // half a hole spacing puts the notch (at 0 deg) midway between two holes
  const inner_bolt_angle = pick('inner_bolt_angle', () => 180 / inputs.hole_n)
  const outer_bolt_angle = pick('outer_bolt_angle', () => 180 / inputs.hole_n)

  return {
    ball_d: d,
    bore: inputs.bore,
    od: inputs.od,
    play: inputs.play,
    hole_d: inputs.hole_d,
    hole_n: inputs.hole_n,
    fill_notch: inputs.fill_notch,
    negative_play: inputs.negative_play,
    width,
    ball_n,
    pitch_d,
    flat,
    inner_od,
    outer_id,
    notch_w,
    notch_h,
    inner_bolt_d,
    inner_bolt_angle,
    outer_bolt_d,
    outer_bolt_angle,
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

function distToSegment(px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function insidePolygon(px: number, py: number, poly: Profile): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// How far a centred ball's surface is from the nearest point of a ring
// cross-section. Negative = the ball overlaps the ring.
export function ballClearance(profile: Profile, pitch_d: number, ball_d: number): number {
  const cx = pitch_d / 2
  const r = ball_d / 2
  if (insidePolygon(cx, 0, profile)) return -r
  let min = Infinity
  for (let i = 0; i < profile.length; i++) {
    min = Math.min(min, distToSegment(cx, 0, profile[i], profile[(i + 1) % profile.length]))
  }
  return min - r
}

// Bolt hole centres as [x, z]; the ring axis is Y.
export function boltCircle(diameter: number, startDeg: number, n: number): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180
    out.push([(diameter / 2) * Math.cos(a), (diameter / 2) * Math.sin(a)])
  }
  return out
}
