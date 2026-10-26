import { describe, expect, it } from 'vitest'
import { DEFAULTS, maxBalls, type BearingParams } from '../shared/bearing'
import { parseBearingParams, validateBearing } from '../shared/validate'

const check = (over: Partial<BearingParams>) => validateBearing({ ...DEFAULTS, ...over })
const messages = (over: Partial<BearingParams>) => check(over).issues.map((i) => i.message).join(' | ')

describe('validateBearing', () => {
  it('passes the tower bearing defaults with no warnings', () => {
    expect(check({}).issues).toEqual([])
  })

  it('passes the zero-play v7 setup', () => {
    expect(check({ pitch_d: 73.84, play: 0 }).issues).toEqual([])
  })

  it('rejects out of range and non-numbers', () => {
    expect(check({ ball_d: 50 }).ok).toBe(false)
    expect(check({ width: Number.NaN }).ok).toBe(false)
    expect(check({ ball_n: 30.5 }).ok).toBe(false)
  })

  it('rejects diameters out of order', () => {
    const r = check({ inner_od: 80 })
    expect(r.ok).toBe(false)
    expect(r.issues[0].params).toContain('inner_od')
  })

  it('rejects balls wider than the ring', () => {
    expect(check({ ball_d: 6.5, width: 6.4 }).ok).toBe(false)
  })

  it('limits the ball count to what fits', () => {
    expect(maxBalls(4.7625, 73.89)).toBe(47)
    expect(check({ ball_n: 47 }).ok).toBe(true)
    expect(check({ ball_n: 48 }).ok).toBe(false)
  })

  it('catches a groove that cuts through the faces', () => {
    // dropping the inner lands this far puts the groove mouth past the face
    expect(check({ inner_od: 75, width: 4.8 }).ok).toBe(false)
  })

  it('warns on thin lips without failing', () => {
    const r = check({ width: 5.9 })
    expect(r.ok).toBe(true)
    expect(messages({ width: 5.9 })).toMatch(/Inner groove lip/)
  })

  it('catches bolt holes running into the bore', () => {
    expect(check({ inner_bolt_d: 54 }).ok).toBe(false)
  })

  it('warns when the notch is narrower than a ball', () => {
    expect(messages({ notch_w: 4 })).toMatch(/narrower than a ball/)
  })

  it('warns on negative play', () => {
    expect(messages({ play: -0.025 })).toMatch(/preloads/)
  })

  it('skips notch and hole checks when they are turned off', () => {
    expect(check({ notch_w: 0, hole_d: 0 }).issues).toEqual([])
  })
})

describe('parseBearingParams', () => {
  it('accepts a full param object', () => {
    expect(parseBearingParams({ ...DEFAULTS })).toEqual(DEFAULTS)
  })

  it('rejects missing or wrong-typed fields', () => {
    expect(parseBearingParams(null)).toBeNull()
    expect(parseBearingParams({ ...DEFAULTS, bore: '52' })).toBeNull()
    const missing: Partial<BearingParams> = { ...DEFAULTS }
    delete missing.od
    expect(parseBearingParams(missing)).toBeNull()
  })
})
