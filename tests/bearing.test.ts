import { beforeAll, describe, expect, it } from 'vitest'
import { getOC, measureVolume } from 'replicad'
import { initOCNode } from './setupOC'
import { buildInnerRing, buildOuterRing } from '../src/geometry/bearing'
import { BORE, PRESETS, raceGeometry, resolveBearing } from '../shared/bearing'

// the reference design with 0.05 play, and its zero-play outer ring
const REF_PLAY = resolveBearing(PRESETS[0].inputs)
const REF_ZERO = resolveBearing(PRESETS[1].inputs)

// Volumes measured from the STEP files the CadQuery script writes (mm^3).
const REF = {
  inner: 10994.5143,
  outer: 11593.172,
  outer_zero_play: 11641.984,
}

beforeAll(async () => {
  await initOCNode()
}, 60_000)

describe('race math', () => {
  it('matches the numbers the CadQuery script prints', () => {
    const g = raceGeometry(REF_PLAY)
    expect(g.A).toBeCloseTo(40.3376, 4)
    expect(g.B).toBeCloseTo(33.5524, 4)
    expect(g.outerFlatR).toBeCloseTo(39.8376, 4)
    expect(g.innerFlatR).toBeCloseTo(34.0524, 4)
    const z = raceGeometry(REF_ZERO)
    expect(z.A).toBeCloseTo(40.2876, 4)
    expect(z.outerFlatR).toBeCloseTo(39.7876, 4)
  })
})

describe('bearing solids', () => {
  it('inner ring matches the CadQuery one', () => {
    const ring = buildInnerRing(REF_PLAY)
    expect(measureVolume(ring)).toBeCloseTo(REF.inner, 2)
    const bb = ring.boundingBox.bounds
    expect(bb[0][1]).toBeCloseTo(-3.2, 3)
    expect(bb[1][1]).toBeCloseTo(3.2, 3)
    expect(bb[1][0]).toBeCloseTo(36, 3)
  })

  it('outer ring matches the CadQuery one', () => {
    expect(measureVolume(buildOuterRing(REF_PLAY))).toBeCloseTo(REF.outer, 2)
  })

  it('zero-play preset reproduces the zero-play outer ring and leaves the inner ring alone', () => {
    expect(measureVolume(buildOuterRing(REF_ZERO))).toBeCloseTo(REF.outer_zero_play, 2)
    expect(measureVolume(buildInnerRing(REF_ZERO))).toBeCloseTo(REF.inner, 2)
  })

  it('both rings are single valid solids', () => {
    const oc = getOC()
    for (const ring of [buildInnerRing(REF_PLAY), buildOuterRing(REF_PLAY)]) {
      expect(ring.solids.length).toBe(1)
      // OpenCascade's own topology/geometry check: closed shells, no bad faces
      expect(new oc.BRepCheck_Analyzer(ring.wrapped, true, false, false).IsValid()).toBe(true)
    }
    expect(buildOuterRing(REF_PLAY).boundingBox.bounds[1][0]).toBeCloseTo(45.85, 3)
  })

  it('stays valid across bore shapes, hole counts and ball sizes', () => {
    const oc = getOC()
    const variants = [
      { ...PRESETS[0].inputs, bore: 20, bore_shape: BORE.HEX },
      { ...PRESETS[0].inputs, bore: 20, bore_shape: BORE.DFLAT },
      { ...PRESETS[0].inputs, hole_n: 6 },
      { ...PRESETS[0].inputs, ball_d: 3, bore: 8, od: 30, hole_d: 0, overrides: {} },
    ]
    for (const inputs of variants) {
      const p = resolveBearing(inputs)
      for (const ring of [buildInnerRing(p), buildOuterRing(p)]) {
        expect(ring.solids.length).toBe(1)
        expect(new oc.BRepCheck_Analyzer(ring.wrapped, true, false, false).IsValid()).toBe(true)
      }
    }
  })

  it('skips the notch and holes when they are off', () => {
    const plain = resolveBearing({ ...PRESETS[0].inputs, fill_notch: 0, hole_d: 0 })
    expect(measureVolume(buildInnerRing(plain))).toBeGreaterThan(REF.inner)
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

describe('finishing options', () => {
  const base = { ...PRESETS[0].inputs, fill_notch: 0, hole_d: 0 }
  const vol = (over: object) => measureVolume(buildOuterRing(resolveBearing({ ...base, ...over })))
  const volIn = (over: object) => measureVolume(buildInnerRing(resolveBearing({ ...base, ...over })))

  it('a chamfer takes a 45 deg triangle off each edge it touches', () => {
    // outer ring: two OD edges at R = 45.85, triangle area c^2/2 swept around
    const c = 0.5
    const R = 91.7 / 2
    const ring = (r: number) => 2 * Math.PI * r * (c * c) / 2
    // the triangle's centroid sits c/3 in from the OD
    expect(vol({}) - vol({ chamfer: c })).toBeCloseTo(2 * ring(R - c / 3), 1)
    expect(volIn({}) - volIn({ chamfer: c })).toBeGreaterThan(0)
  })

  it('a flange adds its annulus', () => {
    const v = vol({ flange: 1, overrides: { ...base.overrides, flange_od: 100, flange_t: 2 } }) - vol({})
    expect(v).toBeCloseTo((Math.PI / 4) * (100 ** 2 - 91.7 ** 2) * 2, 0)
  })

  it('counterbores remove the head pockets', () => {
    const holes = { hole_d: 2.4, hole_n: 4 }
    const p = resolveBearing({ ...base, ...holes, counterbore: 1 })
    const diff = vol(holes) - vol({ ...holes, counterbore: 1 })
    const pocket = (Math.PI / 4) * (p.cb_d ** 2 - 2.4 ** 2) * p.cb_depth
    expect(diff).toBeCloseTo(4 * pocket, 0)
  })

  it('all options together still make valid solids', () => {
    const oc = getOC()
    const p = resolveBearing({ ...PRESETS[0].inputs, chamfer: 0.5, flange: 1, hole_d: 2.4, counterbore: 1, overrides: {} })
    for (const ring of [buildInnerRing(p), buildOuterRing(p)]) {
      expect(ring.solids.length).toBe(1)
      expect(new oc.BRepCheck_Analyzer(ring.wrapped, true, false, false).IsValid()).toBe(true)
    }
  })
})
