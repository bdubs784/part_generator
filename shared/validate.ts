// Parameter rules shared by the UI and the API.
//
// "error"   = the geometry can't be built, the bearing can't work, or a wall
//             is under the printable minimum. The UI won't regenerate, the
//             sliders stop short of it, and the API refuses to save it.
// "warning" = it builds, but expect trouble assembling it.

import {
  ballClearance,
  BORE,
  boreDiameter,
  boreReach,
  DERIVED_KEYS,
  innerProfile,
  NOTCH_OVERCUT,
  outerProfile,
  PARAMS,
  raceGeometry,
  type BearingInputs,
  type BearingParams,
  type DerivedParams,
  type ParamKey,
  MIN_LIP,
  MIN_WALL,
} from './bearing'
import { checkRanges, type Issue, type ValidationResult } from './params'

const fmt = (n: number) => n.toFixed(2)

export function validateBearing(p: BearingParams): ValidationResult<ParamKey> {
  // Ranges first. Anything past here assumes finite numbers.
  const issues: Issue<ParamKey>[] = checkRanges(PARAMS, p)
  if (issues.length) return { ok: false, issues }

  const err = (message: string, ...params: ParamKey[]) => issues.push({ severity: 'error', message, params })
  const warn = (message: string, ...params: ParamKey[]) => issues.push({ severity: 'warning', message, params })

  // Hard minimum on every wall and lip, so the sliders can't make one unprintable.
  const wall = (margin: number, what: string, min: number, ...params: ParamKey[]) => {
    if (margin <= 0) err(`${what} breaks through`, ...params)
    else if (margin < min - 1e-9) err(`${what} is ${fmt(margin)} mm, under the ${min} mm minimum`, ...params)
  }

  const g = raceGeometry(p)
  const h = p.width / 2

  // Negative play is opt-in: it's for printers that print grooves small.
  if (p.play < 0 && !p.negative_play) err('Play below 0 needs "Allow negative play" turned on', 'play', 'negative_play')
  else if (p.play < 0) warn('Negative play: the balls are tight until the races wear in, or bind if the print comes out true', 'play')

  // Diameters have to step outwards: bore < inner OD < outer ID < OD.
  const boreR = boreReach(p)
  if (2 * boreR >= p.inner_od) err('Bore must be smaller than the inner ring OD', 'bore', 'inner_od')
  if (p.inner_od >= p.outer_id) err('Inner ring OD must be smaller than the outer ring ID', 'inner_od', 'outer_id')
  if (p.outer_id >= p.od) err('Outer ring ID must be smaller than the outer diameter', 'outer_id', 'od')
  if (issues.some((i) => i.severity === 'error')) return { ok: false, issues }

  if (p.ball_d >= p.width) err('Ball diameter must be less than the thickness', 'ball_d', 'width')

  // Each groove needs a sloped flank between the flat and the land.
  if (g.innerMouth <= p.flat / 2) err('Inner ring OD is inside its own groove, raise it or move the ball circle out', 'inner_od', 'pitch_d')
  if (g.outerMouth <= p.flat / 2) err('Outer ring ID is inside its own groove, lower it or move the ball circle in', 'outer_id', 'pitch_d')

  // The ball should touch the 45 deg flanks, not a lip edge.
  if (g.innerMouth <= g.contactY) err('Inner lands are too low, the ball would sit on the lip edge', 'inner_od', 'ball_d')
  if (g.outerMouth <= g.contactY) err('Outer lands are too high, the ball would sit on the lip edge', 'outer_id', 'ball_d')

  // A centred ball must not overlap either ring anywhere (flat, flanks, lips).
  // With negative play it may sink into each flank by its share of the play,
  // and no further.
  const allowed = Math.max(0, -p.play) / (2 * Math.SQRT2) + 1e-6
  const innerFit = ballClearance(innerProfile(p, g), p.pitch_d, p.ball_d)
  const outerFit = ballClearance(outerProfile(p, g), p.pitch_d, p.ball_d)
  if (innerFit < -allowed) err(`Balls overlap the inner ring by ${fmt(-innerFit)} mm`, 'flat', 'play', 'inner_od', 'pitch_d')
  if (outerFit < -allowed) err(`Balls overlap the outer ring by ${fmt(-outerFit)} mm`, 'flat', 'play', 'outer_id', 'pitch_d')

  // Lip = ring material above/below the groove mouth.
  wall(h - g.innerMouth, 'Inner groove lip', MIN_LIP, 'inner_od', 'width')
  wall(h - g.outerMouth, 'Outer groove lip', MIN_LIP, 'outer_id', 'width')

  // Radial wall behind each race.
  wall(g.innerFlatR - boreR, 'Inner ring wall under the groove', MIN_WALL, 'bore', 'pitch_d')

  if (p.bore_shape === BORE.DFLAT && p.dflat >= boreDiameter(p) / 2) {
    err('D-flat is deeper than the bore radius', 'dflat', 'bore')
  }
  wall(p.od / 2 - g.outerFlatR, 'Outer ring wall behind the groove', MIN_WALL, 'od', 'pitch_d')

  // If the gap between the rings is as big as a ball, nothing holds the balls in.
  const gap = (p.outer_id - p.inner_od) / 2
  if (gap >= p.ball_d) warn(`Ring gap (${fmt(gap)} mm) is wider than a ball, balls won't stay in`, 'inner_od', 'outer_id')

  if (p.ball_n > g.maxBalls) err(`Only ${g.maxBalls} balls fit on this ball circle`, 'ball_n', 'ball_d', 'pitch_d')

  // Fill notch: with the two notches lined up the ball has to fit through.
  if (p.fill_notch) {
    if (p.notch_w < p.ball_d) warn('Notch is narrower than a ball', 'notch_w')
    const channel = g.outerFlatR - g.innerFlatR + 2 * NOTCH_OVERCUT
    if (channel < p.ball_d) warn(`Lined-up notches leave ${fmt(channel)} mm, less than a ball`, 'pitch_d', 'flat')
    if (p.notch_h >= h) warn('Notch reaches the ball centre plane, balls will fall back out', 'notch_h')
  }

  // Bolt holes have to stay between the bore/OD and the groove.
  if (p.hole_d > 0) {
    const before = issues.length
    const hr = p.hole_d / 2
    const ir = p.inner_bolt_d / 2
    const or = p.outer_bolt_d / 2
    wall(ir - hr - boreR, 'Wall between inner holes and bore', MIN_WALL, 'inner_bolt_d', 'hole_d', 'bore')
    wall(g.innerFlatR - NOTCH_OVERCUT - (ir + hr), 'Wall between inner holes and groove', MIN_WALL, 'inner_bolt_d', 'hole_d')
    wall(or - hr - (g.outerFlatR + NOTCH_OVERCUT), 'Wall between outer holes and groove', MIN_WALL, 'outer_bolt_d', 'hole_d')
    wall(p.od / 2 - (or + hr), 'Wall between outer holes and OD', MIN_WALL, 'outer_bolt_d', 'hole_d', 'od')
    // neighbouring holes on a circle can't run together
    const holeGap = (d: number) => d * Math.sin(Math.PI / p.hole_n) - p.hole_d
    wall(holeGap(p.inner_bolt_d), 'Gap between inner holes', MIN_WALL, 'hole_n', 'inner_bolt_d')
    wall(holeGap(p.outer_bolt_d), 'Gap between outer holes', MIN_WALL, 'hole_n', 'outer_bolt_d')

    // say what to do about it once, instead of leaving four wall errors
    const ringRoom = (outer: number, inner: number) => outer - inner - 2 * MIN_WALL
    const innerRoom = ringRoom(g.innerFlatR - NOTCH_OVERCUT, boreR)
    const outerRoom = ringRoom(p.od / 2, g.outerFlatR + NOTCH_OVERCUT)
    const fits = Math.min(innerRoom, outerRoom)
    if (issues.length > before) {
      err(
        fits > 0
          ? `Holes up to ${fmt(fits)} mm fit in these rings. Pick a smaller size or move the bolt circles.`
          : 'No bolt holes fit in these rings. Turn them off or make the rings wider (bigger OD or smaller bore).',
        'hole_d',
      )
    }
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues }
}

const BASE_KEYS = ['ball_d', 'bore', 'bore_shape', 'bore_fit', 'od', 'play', 'hole_d', 'hole_n', 'fill_notch', 'negative_play'] as const

// For the API: check the shape of an untrusted body before validating values.
// Unknown keys are dropped; anything missing or non-numeric fails.
export function parseBearingInputs(input: unknown): BearingInputs | null {
  if (typeof input !== 'object' || input === null) return null
  const obj = input as Record<string, unknown>
  const out = { overrides: {} } as BearingInputs
  for (const key of BASE_KEYS) {
    const v = obj[key]
    if (typeof v !== 'number') return null
    out[key] = v
  }
  const raw = obj.overrides ?? {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const overrides: Partial<DerivedParams> = {}
  for (const key of DERIVED_KEYS) {
    const v = (raw as Record<string, unknown>)[key]
    if (v === undefined) continue
    if (typeof v !== 'number') return null
    overrides[key] = v
  }
  out.overrides = overrides
  return out
}
