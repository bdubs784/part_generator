// Loads the OpenCascade wasm build once and hands it to replicad.
// Dynamic imports keep the emscripten glue out of the main bundle, so the
// page draws while the kernel downloads.
import { setOC } from 'replicad'

let ready: Promise<void> | null = null

export function initOC(): Promise<void> {
  ready ??= (async () => {
    const [{ default: opencascade }, { default: wasmUrl }] = await Promise.all([
      import('replicad-opencascadejs'),
      import('replicad-opencascadejs/wasm?url'),
    ])
    setOC(await opencascade({ locateFile: () => wasmUrl }))
  })()
  return ready
}
