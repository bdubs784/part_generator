// Checks the C++/WebAssembly engine against OpenCascade. Skipped until
// engine/dist has been built (bash engine/build.sh).

import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { measureVolume } from 'replicad'
import { initOCNode } from './setupOC'
import { buildInnerRing, buildOuterRing } from '../src/geometry/bearing'
import { innerRecipe, outerRecipe, runRecipe, segmentsFor, type BearingEngine } from '../src/geometry/manifoldEngine'
import { BORE, DEFAULT_INPUTS, PRESETS, resolveBearing, type BearingInputs } from '../shared/bearing'

const distJs = fileURLToPath(new URL('../engine/dist/bearing_engine.mjs', import.meta.url))
const distWasm = fileURLToPath(new URL('../engine/dist/bearing_engine.wasm', import.meta.url))
const built = existsSync(distJs) && existsSync(distWasm)

describe('segmentsFor', () => {
  it('keeps facets within tolerance and clamps the count', () => {
    const n = segmentsFor(45.85)
    const sagitta = 45.85 * (1 - Math.cos(Math.PI / n))
    expect(sagitta).toBeLessThanOrEqual(0.02)
    expect(segmentsFor(1)).toBe(64)
    expect(segmentsFor(1000)).toBe(512)
  })
})

describe('recipes', () => {
  it('use the same cross-section and tools as the OpenCascade builder', () => {
    const p = resolveBearing({ ...DEFAULT_INPUTS, hole_d: 2.4, counterbore: 1 })
    const inner = innerRecipe(p)
    // 4 holes + 4 counterbores, 5 numbers each; one notch box
    expect(inner.cylinders.length).toBe(8 * 5)
    expect(inner.boxes.length).toBe(6)
    expect(inner.profile.length % 2).toBe(0)
    const hex = innerRecipe(resolveBearing({ ...DEFAULT_INPUTS, bore: 20, bore_shape: BORE.HEX }))
    expect(hex.hexAcrossFlats).toBeCloseTo(20.1)
  })
})

describe.runIf(built)('C++ engine vs OpenCascade', () => {
  let engine: BearingEngine

  beforeAll(async () => {
    await initOCNode()
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(distJs).href)
    engine = await create({ locateFile: () => distWasm })
  }, 60_000)

  const variants: [string, BearingInputs][] = [
    ['tower v5', PRESETS[0].inputs],
    ['auto default', DEFAULT_INPUTS],
    ['hex bore', { ...DEFAULT_INPUTS, bore: 20, bore_shape: BORE.HEX }],
    ['D-flat', { ...DEFAULT_INPUTS, bore: 20, bore_shape: BORE.DFLAT }],
    ['counterbores + flange', { ...DEFAULT_INPUTS, hole_d: 2.4, counterbore: 1, flange: 1 }],
  ]

  for (const [name, inputs] of variants) {
    it(`matches OpenCascade volumes: ${name}`, () => {
      const p = resolveBearing(inputs)
      for (const [recipe, exact] of [
        [innerRecipe(p), measureVolume(buildInnerRing(p))],
        [outerRecipe(p), measureVolume(buildOuterRing(p))],
      ] as const) {
        const r = runRecipe(engine, recipe)
        expect(r.ok).toBe(true)
        expect(r.indices.length).toBeGreaterThan(0)
        // facets cut slightly inside curved surfaces, so the mesh is a hair
        // smaller; well under 0.5% at this tolerance
        expect(Math.abs(r.volume - exact) / exact).toBeLessThan(0.005)
      }
    })
  }
})
