import { describe, expect, it } from 'vitest'
import {
  BORE,
  DEFAULT_INPUTS,
  FIELDS,
  maxBalls,
  maxFlat,
  migrateInputs,
  PARAMS,
  PRESETS,
  resolveBearing,
  type BearingInputs,
  type BearingParams,
} from '../shared/bearing'
import { parseBearingInputs, validateBearing } from '../shared/validate'
import { fieldRange } from '../shared/form'

const REF_INPUTS = PRESETS[0].inputs
const ref = (over: Partial<BearingParams>) => validateBearing({ ...resolveBearing(REF_INPUTS), ...over })
const auto = (over: Partial<BearingInputs>) => validateBearing(resolveBearing({ ...DEFAULT_INPUTS, ...over }))
const messages = (r: ReturnType<typeof validateBearing>) => r.issues.map((i) => i.message).join(' | ')

describe('resolveBearing', () => {
  it('reproduces the reference design from its preset', () => {
    const p = resolveBearing(REF_INPUTS)
    expect(p).toMatchObject({ pitch_d: 73.89, inner_od: 72, outer_id: 76.7, width: 6.4, flat: 1, notch_h: 1.8 })
  })

  it('auto values for the reference envelope come out close to the hand-made design', () => {
    const p = resolveBearing(DEFAULT_INPUTS)
    expect(p.width).toBe(6.4)
    expect(p.flat).toBe(1)
    expect(p.notch_w).toBe(6.3)
    expect(p.notch_h).toBe(1.8)
    expect(p.pitch_d).toBeCloseTo(71.85, 6)
    expect(p.ball_n).toBe(32)
    expect(p.inner_bolt_angle).toBe(45)
  })

  it('overrides win over auto values', () => {
    expect(resolveBearing({ ...DEFAULT_INPUTS, overrides: { width: 8 } }).width).toBe(8)
  })

  it('spaces the holes around the notch for any count', () => {
    expect(resolveBearing({ ...DEFAULT_INPUTS, hole_n: 6 }).outer_bolt_angle).toBe(30)
  })

  it('auto designs are clean across ball sizes and envelopes', () => {
    const cases: Partial<BearingInputs>[] = [
      {},
      { ball_d: 3, bore: 8, od: 30, hole_d: 0 },
      { ball_d: 6.35, bore: 20, od: 70 },
      { ball_d: 4, bore: 12, od: 45, hole_d: 2.4 },
      { ball_d: 8, bore: 60, od: 120 },
    ]
    for (const c of cases) expect(auto(c).issues, JSON.stringify(c)).toEqual([])
  })
})

describe('validateBearing', () => {
  it('passes both reference presets with no warnings', () => {
    for (const preset of PRESETS) expect(validateBearing(resolveBearing(preset.inputs)).issues).toEqual([])
  })

  it('rejects out of range and non-numbers', () => {
    expect(ref({ ball_d: 50 }).ok).toBe(false)
    expect(ref({ width: Number.NaN }).ok).toBe(false)
    expect(ref({ ball_n: 30.5 }).ok).toBe(false)
  })

  it('rejects diameters out of order', () => {
    const r = ref({ inner_od: 80 })
    expect(r.ok).toBe(false)
    expect(r.issues[0].params).toContain('inner_od')
  })

  it('rejects balls wider than the ring', () => {
    expect(ref({ ball_d: 6.5, width: 6.4 }).ok).toBe(false)
  })

  it('limits the ball count to what fits', () => {
    expect(maxBalls(4.7625, 73.89)).toBe(47)
    expect(ref({ ball_n: 47 }).ok).toBe(true)
    expect(ref({ ball_n: 48 }).ok).toBe(false)
  })

  it('catches a groove flat that runs into the ball', () => {
    // max flat for 3/16" balls with 0.05 play is about 2.02 mm
    expect(maxFlat(4.7625, 0.05)).toBeCloseTo(2.0227, 3)
    expect(ref({ flat: 1.95 }).ok).toBe(true)
    const r = ref({ flat: 2.2 })
    expect(r.ok).toBe(false)
    expect(messages(r)).toMatch(/Balls overlap the inner ring/)
  })

  it('needs the opt-in for negative play', () => {
    expect(ref({ play: -0.025 }).ok).toBe(false)
    const r = ref({ play: -0.025, negative_play: 1 })
    expect(r.ok).toBe(true)
    expect(messages(r)).toMatch(/Negative play/)
  })

  it('catches a groove that cuts through the faces', () => {
    expect(ref({ inner_od: 75, width: 4.8 }).ok).toBe(false)
  })

  it('treats a lip under the minimum as an error', () => {
    const r = ref({ width: 5.9 })
    expect(r.ok).toBe(false)
    expect(messages(r)).toMatch(/Inner groove lip is 0.50 mm/)
  })

  it('keeps the bore a wall away from the groove', () => {
    expect(ref({ hole_d: 0, bore: 65 }).ok).toBe(true)
    expect(ref({ hole_d: 0, bore: 66 }).ok).toBe(false)
  })

  it('checks hex bore walls at the corners, not the flats', () => {
    // 50 across flats reaches 28.9 at the corners, too close to the holes on Ø58
    expect(ref({ bore: 50, bore_shape: BORE.HEX }).ok).toBe(false)
    expect(ref({ bore: 50, bore_shape: BORE.ROUND }).ok).toBe(true)
  })

  it('counts the shaft fit in the bore walls', () => {
    // wall under the groove: 34.05 - 65.5 / 2 = 1.30 ok, with +0.3 it's 1.15
    expect(ref({ hole_d: 0, bore: 65.5 }).ok).toBe(true)
    expect(ref({ hole_d: 0, bore: 65.5, bore_fit: 0.3 }).ok).toBe(false)
  })

  it('rejects a D-flat deeper than the bore radius', () => {
    expect(ref({ bore: 10, bore_shape: BORE.DFLAT, dflat: 1 }).ok).toBe(true)
    expect(ref({ bore: 10, bore_shape: BORE.DFLAT, dflat: 5 }).ok).toBe(false)
  })

  it('catches bolt holes running into the bore', () => {
    expect(ref({ inner_bolt_d: 54 }).ok).toBe(false)
  })

  it('catches holes too close to each other', () => {
    expect(ref({ hole_n: 12, hole_d: 4.5 }).ok).toBe(false)
  })

  it('warns when the notch is narrower than a ball', () => {
    expect(messages(ref({ notch_w: 4 }))).toMatch(/narrower than a ball/)
  })

  it('skips notch and hole checks when they are turned off', () => {
    expect(ref({ fill_notch: 0, notch_w: 1, hole_d: 0, inner_bolt_d: 2 }).issues).toEqual([])
  })
})

describe('slider ranges', () => {
  const range = (inputs: BearingInputs, key: string) => {
    const field = FIELDS.find((f) => f.key === key)!
    const def = PARAMS.find((d) => d.key === key)!
    const p = resolveBearing(inputs)
    return fieldRange(inputs, field, def, p[def.key], resolveBearing, validateBearing)
  }

  it('stops play at 0 unless negative play is allowed', () => {
    expect(range(REF_INPUTS, 'play')[0]).toBe(0)
    expect(range({ ...REF_INPUTS, negative_play: 1 }, 'play')[0]).toBeLessThan(0)
  })

  it('stops the groove flat before it hits the ball', () => {
    const [, hi] = range(REF_INPUTS, 'flat')
    expect(hi).toBeGreaterThan(1.9)
    expect(hi).toBeLessThan(2.05)
  })

  it('limits the ball count to the max', () => {
    expect(range(REF_INPUTS, 'ball_n')).toEqual([3, 47])
  })

  it('every number slider ends on a valid design', () => {
    for (const field of FIELDS.filter((f) => f.kind === 'number')) {
      const [lo, hi] = range(DEFAULT_INPUTS, field.key)
      for (const v of [lo, hi]) {
        const set = field.derived
          ? { ...DEFAULT_INPUTS, overrides: { [field.key]: v } }
          : { ...DEFAULT_INPUTS, [field.key]: v }
        expect(validateBearing(resolveBearing(set)).ok, `${field.key}=${v}`).toBe(true)
      }
    }
  })
})

describe('parseBearingInputs', () => {
  it('accepts a full input object', () => {
    expect(parseBearingInputs(REF_INPUTS)).toEqual(REF_INPUTS)
  })

  it('drops unknown keys', () => {
    const parsed = parseBearingInputs({ ...DEFAULT_INPUTS, evil: 1, overrides: { width: 7, nope: 2 } })
    expect(parsed).toEqual({ ...DEFAULT_INPUTS, overrides: { width: 7 } })
  })

  it('rejects missing or wrong-typed fields', () => {
    expect(parseBearingInputs(null)).toBeNull()
    expect(parseBearingInputs({ ...DEFAULT_INPUTS, bore: '52' })).toBeNull()
    expect(parseBearingInputs({ ...DEFAULT_INPUTS, overrides: { width: '7' } })).toBeNull()
    const missing: Partial<BearingInputs> = { ...DEFAULT_INPUTS }
    delete missing.od
    expect(parseBearingInputs(missing)).toBeNull()
  })
})

describe('finishing options', () => {
  it('auto designs with chamfer, counterbores and a flange are clean', () => {
    // the reference envelope has room for counterbored M2s, not M3s
    expect(auto({ counterbore: 1, hole_d: 2.4 }).issues).toEqual([])
    expect(auto({ flange: 1 }).issues).toEqual([])
    expect(auto({ chamfer: 0.8, flange: 1 }).issues).toEqual([])
  })

  it('says when counterbores for the screw size do not fit', () => {
    const r = auto({ counterbore: 1, hole_d: 3.4 })
    expect(r.ok).toBe(false)
    expect(messages(r)).toMatch(/Counterbores for this screw size don't fit/)
  })

  it('sizes counterbores from the ISO head table', () => {
    const p = resolveBearing({ ...DEFAULT_INPUTS, hole_d: 3.4, counterbore: 1 })
    expect(p.cb_d).toBe(6.1) // M3 head 5.5 + 0.6
    expect(p.cb_depth).toBe(3.2)
  })

  it('keeps chamfers to a corner', () => {
    expect(ref({ chamfer: 0.8 }).ok).toBe(true)
    expect(ref({ chamfer: 2, width: 3.6, ball_d: 3 }).ok).toBe(false)
  })

  it('needs a real flange lip and ring under it', () => {
    expect(ref({ flange: 1, flange_od: 92, flange_t: 2 }).ok).toBe(false)
    expect(ref({ flange: 1, flange_od: 100, flange_t: 6 }).ok).toBe(false)
    expect(ref({ flange: 1, flange_od: 100, flange_t: 2 }).ok).toBe(true)
  })
})

describe('migrateInputs', () => {
  it('upgrades v1 designs without changing their geometry', () => {
    const v1 = { ...PRESETS[0].inputs } as Record<string, unknown>
    delete v1.chamfer
    delete v1.counterbore
    delete v1.flange
    expect(parseBearingInputs(v1)).toBeNull() // old shape alone no longer parses
    const upgraded = parseBearingInputs(migrateInputs(1, v1))
    expect(upgraded).toMatchObject({ chamfer: 0, counterbore: 0, flange: 0 })
    expect(resolveBearing(upgraded!)).toEqual(resolveBearing(PRESETS[0].inputs))
  })

  it('refuses versions it does not know', () => {
    expect(migrateInputs(99, DEFAULT_INPUTS)).toBeNull()
    expect(migrateInputs(1, null)).toBeNull()
  })
})
