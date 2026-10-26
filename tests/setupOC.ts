// Same as src/geometry/oc.ts but for Node: point emscripten at the wasm on disk.
import { createRequire } from 'node:module'
import opencascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'

const require = createRequire(import.meta.url)

export async function initOCNode() {
  const wasmPath = require.resolve('replicad-opencascadejs/wasm')
  setOC(await opencascade({ locateFile: () => wasmPath }))
}
