// OpenCascade (replicad) vs the C++/Manifold engine on the same bearings.
// Only runs with `npm run bench` (vitest --mode bench), since it takes a while.
// Prints a markdown table; numbers go in the README by hand.

import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { measureVolume } from 'replicad'
import { initOCNode } from './setupOC'
import { buildInnerRing, buildOuterRing } from '../src/geometry/bearing'
import { meshShape } from '../src/geometry/mesh'
import { innerRecipe, outerRecipe, runRecipe, type BearingEngine } from '../src/geometry/manifoldEngine'
import { BORE, DEFAULT_INPUTS, PRESETS, resolveBearing, type BearingInputs } from '../shared/bearing'

const distJs = fileURLToPath(new URL('../engine/dist/bearing_engine.mjs', import.meta.url))
const distWasm = fileURLToPath(new URL('../engine/dist/bearing_engine.wasm', import.meta.url))
const RUNS = 7

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

function time(fn: () => void): number {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

describe.runIf(import.meta.env.MODE === 'bench' && existsSync(distWasm))('engine benchmark', () => {
  let engine: BearingEngine

  beforeAll(async () => {
    await initOCNode()
    const { default: create } = await import(/* @vite-ignore */ pathToFileURL(distJs).href)
    engine = await create({ locateFile: () => distWasm })
  }, 60_000)

  it('builds both rings with each engine', { timeout: 600_000 }, () => {
    const cases: [string, BearingInputs][] = [
      ['Tower v5 (4 holes, notch)', PRESETS[0].inputs],
      ['Auto default (chamfers)', DEFAULT_INPUTS],
      ['Hex bore', { ...DEFAULT_INPUTS, bore: 20, bore_shape: BORE.HEX }],
      ['Counterbores + flange', { ...DEFAULT_INPUTS, hole_d: 2.4, counterbore: 1, flange: 1 }],
      ['8 holes', { ...DEFAULT_INPUTS, hole_d: 2.4, hole_n: 8 }],
    ]
    const rows = ['| Design | OpenCascade build + mesh | C++/Manifold | Speedup | Volume difference |', '|---|---|---|---|---|']
    for (const [name, inputs] of cases) {
      const p = resolveBearing(inputs)
      const occ = () => {
        meshShape(buildInnerRing(p))
        meshShape(buildOuterRing(p))
      }
      const cpp = () => {
        runRecipe(engine, innerRecipe(p))
        runRecipe(engine, outerRecipe(p))
      }
      occ() // warm up both
      cpp()
      const occMs = median(Array.from({ length: RUNS }, () => time(occ)))
      const cppMs = median(Array.from({ length: RUNS }, () => time(cpp)))

      const exact = measureVolume(buildInnerRing(p)) + measureVolume(buildOuterRing(p))
      const mesh = runRecipe(engine, innerRecipe(p)).volume + runRecipe(engine, outerRecipe(p)).volume
      const diff = ((mesh - exact) / exact) * 100
      expect(Math.abs(diff)).toBeLessThan(0.5)

      rows.push(
        `| ${name} | ${occMs.toFixed(0)} ms | ${cppMs.toFixed(1)} ms | ${(occMs / cppMs).toFixed(0)}× | ${diff.toFixed(3)}% |`,
      )
    }
    console.log('\n' + rows.join('\n') + `\n\nmedian of ${RUNS}, Node ${process.version}`)
  })
})
