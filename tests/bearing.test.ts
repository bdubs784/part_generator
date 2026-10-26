import { beforeAll, describe, expect, it } from 'vitest'
import { measureVolume } from 'replicad'
import { initOCNode } from './setupOC'
import { buildInnerRing, buildOuterRing } from '../src/geometry/bearing'
import { DEFAULTS, raceGeometry, type BearingParams } from '../shared/bearing'

// v5 inner + v7_zero outer is the same as the v5 numbers with the ball circle
// moved in by the 0.025 half-play and zero play.
const V7: BearingParams = { ...DEFAULTS, pitch_d: 73.84, play: 0 }

// Volumes measured from the STEP files the CadQuery script writes (mm^3).
const REF = {
  inner_v5: 10994.5143,
  outer_v5: 11593.172,
  outer_v7_zero: 11641.984,
}

beforeAll(async () => {
  await initOCNode()
}, 60_000)

describe('race math', () => {
  it('matches the numbers the CadQuery script prints', () => {
    const g = raceGeometry(DEFAULTS)
    expect(g.A).toBeCloseTo(40.3376, 4)
    expect(g.B).toBeCloseTo(33.5524, 4)
    expect(g.outerFlatR).toBeCloseTo(39.8376, 4)
    expect(g.innerFlatR).toBeCloseTo(34.0524, 4)
    const z = raceGeometry(V7)
    expect(z.A).toBeCloseTo(40.2876, 4)
    expect(z.outerFlatR).toBeCloseTo(39.7876, 4)
  })
})

describe('bearing solids', () => {
  it('inner ring matches v5', () => {
    const ring = buildInnerRing(DEFAULTS)
    expect(measureVolume(ring)).toBeCloseTo(REF.inner_v5, 2)
    const bb = ring.boundingBox.bounds
    expect(bb[0][1]).toBeCloseTo(-3.2, 3)
    expect(bb[1][1]).toBeCloseTo(3.2, 3)
    expect(bb[1][0]).toBeCloseTo(36, 3)
  })

  it('outer ring matches v5', () => {
    expect(measureVolume(buildOuterRing(DEFAULTS))).toBeCloseTo(REF.outer_v5, 2)
  })

  it('zero-play preset reproduces v7_zero outer and leaves the inner ring alone', () => {
    expect(measureVolume(buildOuterRing(V7))).toBeCloseTo(REF.outer_v7_zero, 2)
    expect(measureVolume(buildInnerRing(V7))).toBeCloseTo(REF.inner_v5, 2)
  })

  it('outer ring is one closed solid', () => {
    const ring = buildOuterRing(DEFAULTS)
    expect(ring.solids?.length ?? 1).toBe(1)
    expect(ring.boundingBox.bounds[1][0]).toBeCloseTo(45.85, 3)
  })
})
