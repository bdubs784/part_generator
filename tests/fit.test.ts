import { describe, expect, it } from 'vitest'
import { BORE, DEFAULT_INPUTS, FIELDS, PARAMS, PRESETS, resolveBearing, type BearingInputs } from '../shared/bearing'
import { validateBearing } from '../shared/validate'
import { fitAround } from '../shared/fit'

const defs = new Map(PARAMS.map((d) => [d.key as string, d]))
const ORDER = ['hole_d', 'hole_n', 'bore', 'ball_d', 'od']
const fit = (inputs: BearingInputs, pinned: string[]) =>
  fitAround(inputs, { fields: FIELDS, defs, pinned, order: ORDER, resolve: resolveBearing, validate: validateBearing })

describe('fitAround', () => {
  it('leaves a valid design alone', () => {
    const r = fit(DEFAULT_INPUTS, [])
    expect(r.ok).toBe(true)
    expect(r.changes).toEqual([])
  })

  it('keeps an edited OD and shrinks the bore to suit', () => {
    const r = fit({ ...DEFAULT_INPUTS, od: 45 }, ['od'])
    expect(r.ok).toBe(true)
    expect(r.inputs.od).toBe(45)
    expect(r.inputs.bore).toBeLessThan(52)
    expect(validateBearing(resolveBearing(r.inputs)).ok).toBe(true)
  })

  it('keeps a hex shaft and OD, gives up the bolt holes first', () => {
    const start = { ...DEFAULT_INPUTS, od: 45, bore: 12.7, bore_shape: BORE.HEX }
    const r = fit(start, ['od', 'bore', 'bore_shape'])
    expect(r.ok).toBe(true)
    expect(r.inputs).toMatchObject({ od: 45, bore: 12.7, bore_shape: BORE.HEX })
    expect(r.changes.map((c) => c.key)).toContain('hole_d')
  })

  it('drops preset overrides the user did not make', () => {
    const r = fit({ ...PRESETS[0].inputs, od: 70 }, ['od'])
    expect(r.ok).toBe(true)
    expect(r.inputs.od).toBe(70)
    expect(Object.keys(r.inputs.overrides)).toEqual([])
  })

  it('fits a 608 by picking smaller balls, without touching its size', () => {
    const r = fit({ ...DEFAULT_INPUTS, bore: 8, bore_fit: 0, od: 22, overrides: { width: 7 } }, ['bore', 'od', 'width'])
    expect(r.ok).toBe(true)
    expect(r.inputs).toMatchObject({ bore: 8, od: 22, overrides: { width: 7 } })
    expect(r.inputs.ball_d).toBeLessThan(4)
  })

  it('hands back the original design when nothing fits', () => {
    const start = { ...DEFAULT_INPUTS, bore: 3, bore_fit: 0, od: 10, overrides: { width: 4 } }
    const r = fit(start, ['bore', 'od', 'width'])
    expect(r.ok).toBe(false)
    expect(r.inputs).toBe(start)
    expect(r.changes).toEqual([])
  })

  it('gives up an older edit before a newer one when it has to', () => {
    // bore and OD both edited into an impossible pair; the bore (older) moves
    const r = fit({ ...DEFAULT_INPUTS, bore: 80, od: 85 }, ['bore', 'od'])
    expect(r.ok).toBe(true)
    expect(r.inputs.od).toBe(85)
    expect(r.inputs.bore).toBeLessThan(80)
  })
})
