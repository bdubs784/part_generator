import { beforeAll, describe, expect, it } from 'vitest'
import { measureVolume } from 'replicad'
import { initOCNode } from './setupOC'
import { buildInnerRing, buildOuterRing } from '../src/geometry/bearing'
import { BORE, PRESETS, raceGeometry, resolveBearing } from '../shared/bearing'

const V5 = resolveBearing(PRESETS[0].inputs)
// v5 inner + v7_zero outer
const V7 = resolveBearing(PRESETS[1].inputs)

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
    const g = raceGeometry(V5)
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
    const ring = buildInnerRing(V5)
    expect(measureVolume(ring)).toBeCloseTo(REF.inner_v5, 2)
    const bb = ring.boundingBox.bounds
    expect(bb[0][1]).toBeCloseTo(-3.2, 3)
    expect(bb[1][1]).toBeCloseTo(3.2, 3)
    expect(bb[1][0]).toBeCloseTo(36, 3)
  })

  it('outer ring matches v5', () => {
    expect(measureVolume(buildOuterRing(V5))).toBeCloseTo(REF.outer_v5, 2)
  })

  it('zero-play preset reproduces v7_zero outer and leaves the inner ring alone', () => {
    expect(measureVolume(buildOuterRing(V7))).toBeCloseTo(REF.outer_v7_zero, 2)
    expect(measureVolume(buildInnerRing(V7))).toBeCloseTo(REF.inner_v5, 2)
  })

  it('outer ring is one closed solid', () => {
    const ring = buildOuterRing(V5)
    expect(ring.solids?.length ?? 1).toBe(1)
    expect(ring.boundingBox.bounds[1][0]).toBeCloseTo(45.85, 3)
  })

  it('skips the notch and holes when they are off', () => {
    const plain = resolveBearing({ ...PRESETS[0].inputs, fill_notch: 0, hole_d: 0 })
    expect(measureVolume(buildInnerRing(plain))).toBeGreaterThan(REF.inner_v5)
  })

  describe('bore shapes', () => {
    // no notch or holes, so the bore is the only thing that changes
    const plain = { ...PRESETS[0].inputs, fill_notch: 0, hole_d: 0, bore: 20, bore_fit: 0 }
    const w = 6.4
    let round = 0
    beforeAll(() => {
      round = measureVolume(buildInnerRing(resolveBearing(plain)))
    })

    it('hex bore removes the corners outside the inscribed circle', () => {
      const hex = measureVolume(buildInnerRing(resolveBearing({ ...plain, bore_shape: BORE.HEX })))
      const extra = ((Math.sqrt(3) / 2) * 20 ** 2 - Math.PI * 10 ** 2) * w
      expect(round - hex).toBeCloseTo(extra, 1)
    })

    it('D-flat adds back the segment past the flat', () => {
      const inputs = { ...plain, bore_shape: BORE.DFLAT, overrides: { ...plain.overrides, dflat: 2 } }
      const dflat = measureVolume(buildInnerRing(resolveBearing(inputs)))
      const r = 10
      const h = 2
      const segment = r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(2 * r * h - h * h)
      expect(dflat - round).toBeCloseTo(segment * w, 1)
    })

    it('shaft fit opens the bore up', () => {
      const loose = measureVolume(buildInnerRing(resolveBearing({ ...plain, bore_fit: 0.2 })))
      const ring = (d: number) => (Math.PI / 4) * d * d * w
      expect(round - loose).toBeCloseTo(ring(20.2) - ring(20), 1)
    })
  })

  it('cuts one hole per hole_n', () => {
    const six = resolveBearing({ ...PRESETS[0].inputs, fill_notch: 0, hole_n: 6 })
    const four = resolveBearing({ ...PRESETS[0].inputs, fill_notch: 0, hole_n: 4 })
    const holeVol = Math.PI * 1.5 ** 2 * 6.4
    const diff = measureVolume(buildOuterRing(four)) - measureVolume(buildOuterRing(six))
    expect(diff).toBeCloseTo(2 * holeVol, 1)
  })
})
