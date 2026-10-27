// Types for the Emscripten module built from engine/src/bearing.cpp.
declare module '*/bearing_engine.mjs' {
  import type { BearingEngine } from './geometry/manifoldEngine'
  const createBearingEngine: (options?: { locateFile?: (file: string) => string }) => Promise<BearingEngine>
  export default createBearingEngine
}
