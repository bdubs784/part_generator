// Parameter rules shared by the UI and the API.
//
// "error"   = the geometry can't be built or the bearing can't work. The UI
//             won't regenerate and the API refuses to save it.
// "warning" = it builds, but expect trouble printing or assembling it.

import { NOTCH_OVERCUT, PARAMS, raceGeometry, type BearingParams, type ParamKey } from './bearing'
import { checkRanges, pickParams, type Issue, type ValidationResult } from './params'

// FDM limits, assuming a 0.4 mm nozzle.
export const MIN_WALL = 1.2 // three perimeters
// Groove lips are shorter features than walls. The v5 inner ring has 0.75 mm
// lips and they hold up, so 0.6 is the floor (1.5 line widths).
export const MIN_LIP = 0.6

const fmt = (n: number) => n.toFixed(2)

export function validateBearing(p: BearingParams): ValidationResult<ParamKey> {
  // Ranges first. Anything past here assumes finite numbers.
  const issues: Issue<ParamKey>[] = checkRanges(PARAMS, p)
  if (issues.length) return { ok: false, issues }

  const err = (message: string, ...params: ParamKey[]) => issues.push({ severity: 'error', message, params })
  const warn = (message: string, ...params: ParamKey[]) => issues.push({ severity: 'warning', message, params })

  // Wall check: below zero the feature breaks through, below the minimum it's thin.
  const wall = (margin: number, what: string, min: number, ...params: ParamKey[]) => {
    if (margin <= 0) err(`${what} breaks through`, ...params)
    else if (margin < min) warn(`${what} is ${fmt(margin)} mm, under the ${min} mm minimum`, ...params)
  }

  const g = raceGeometry(p)
  const h = p.width / 2

  // Diameters have to step outwards: bore < inner OD < outer ID < OD.
  if (p.bore >= p.inner_od) err('Bore must be smaller than the inner ring OD', 'bore', 'inner_od')
  if (p.inner_od >= p.outer_id) err('Inner ring OD must be smaller than the outer ring ID', 'inner_od', 'outer_id')
  if (p.outer_id >= p.od) err('Outer ring ID must be smaller than the outer diameter', 'outer_id', 'od')
  if (issues.length) return { ok: false, issues }

  if (p.ball_d >= p.width) err('Ball diameter must be less than the thickness', 'ball_d', 'width')

  // Each groove needs a sloped flank between the flat and the land.
  if (g.innerMouth <= p.flat / 2) err('Inner ring OD is inside its own groove, raise it or move the ball circle out', 'inner_od', 'pitch_d')
  if (g.outerMouth <= p.flat / 2) err('Outer ring ID is inside its own groove, lower it or move the ball circle in', 'outer_id', 'pitch_d')

  // The ball should touch the 45 deg flanks, not ride on the flat or a lip edge.
  if (p.flat / 2 >= g.contactY) err('Groove flat is wider than the ball contact points', 'flat', 'ball_d')
  if (g.innerMouth <= g.contactY) err('Inner lands are too low, the ball would sit on the lip edge', 'inner_od', 'ball_d')
  if (g.outerMouth <= g.contactY) err('Outer lands are too high, the ball would sit on the lip edge', 'outer_id', 'ball_d')

  // Lip = ring material above/below the groove mouth.
  wall(h - g.innerMouth, 'Inner groove lip', MIN_LIP, 'inner_od', 'width')
  wall(h - g.outerMouth, 'Outer groove lip', MIN_LIP, 'outer_id', 'width')

  // Radial wall behind each race.
  wall(g.innerFlatR - p.bore / 2, 'Inner ring wall under the groove', MIN_WALL, 'bore', 'pitch_d')
  wall(p.od / 2 - g.outerFlatR, 'Outer ring wall behind the groove', MIN_WALL, 'od', 'pitch_d')

  // If the gap between the rings is as big as a ball, nothing holds the balls in.
  const gap = (p.outer_id - p.inner_od) / 2
  if (gap >= p.ball_d) warn(`Ring gap (${fmt(gap)} mm) is wider than a ball, balls won't stay in`, 'inner_od', 'outer_id')

  if (p.play < 0) warn('Negative play preloads the balls, printed races may bind', 'play')

  if (p.ball_n > g.maxBalls) err(`Only ${g.maxBalls} balls fit on this ball circle`, 'ball_n', 'ball_d', 'pitch_d')

  // Fill notch: with the two notches lined up the ball has to fit through.
  if (p.notch_w > 0 && p.notch_h > 0) {
    if (p.notch_w < p.ball_d) warn('Notch is narrower than a ball', 'notch_w')
    const channel = g.outerFlatR - g.innerFlatR + 2 * NOTCH_OVERCUT
    if (channel < p.ball_d) warn(`Lined-up notches leave ${fmt(channel)} mm, less than a ball`, 'pitch_d', 'flat')
    if (p.notch_h >= h) warn('Notch reaches the ball centre plane, balls will fall back out', 'notch_h')
  }

  // Bolt holes have to stay between the bore/OD and the groove.
  if (p.hole_d > 0) {
    const hr = p.hole_d / 2
    const ir = p.inner_bolt_d / 2
    const or = p.outer_bolt_d / 2
    wall(ir - hr - p.bore / 2, 'Wall between inner holes and bore', MIN_WALL, 'inner_bolt_d', 'hole_d')
    wall(g.innerFlatR - NOTCH_OVERCUT - (ir + hr), 'Wall between inner holes and groove', MIN_WALL, 'inner_bolt_d', 'hole_d')
    wall(or - hr - (g.outerFlatR + NOTCH_OVERCUT), 'Wall between outer holes and groove', MIN_WALL, 'outer_bolt_d', 'hole_d')
    wall(p.od / 2 - (or + hr), 'Wall between outer holes and OD', MIN_WALL, 'outer_bolt_d', 'hole_d')
  }

  return { ok: !issues.some((i) => i.severity === 'error'), issues }
}

// For the API: check the shape of an untrusted body before validating values.
export function parseBearingParams(input: unknown): BearingParams | null {
  return pickParams(PARAMS, input)
}
