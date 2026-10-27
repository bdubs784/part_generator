// Loads the C++/WebAssembly engine (engine/dist, built by engine/build.sh).
import type { BearingEngine } from './manifoldEngine'

let engine: Promise<BearingEngine> | null = null

export function loadCppEngine(): Promise<BearingEngine> {
  engine ??= (async () => {
    const [{ default: create }, { default: wasmUrl }] = await Promise.all([
      import('../../engine/dist/bearing_engine.mjs'),
      import('../../engine/dist/bearing_engine.wasm?url'),
    ])
    return create({ locateFile: () => wasmUrl })
  })()
  return engine
}
