// Geometry runs here so the page never freezes while a kernel works.
//
// Two engines, each loaded the first time it's needed:
//   cpp - our C++/Manifold engine (305 KB wasm), for the live preview
//   occ - OpenCascade via replicad (23 MB wasm), for STEP/STL files and the
//         exact preview
// So a first visit only downloads the small one.
//
// Builds are coalesced: if new parameters arrive while a build is running,
// only the newest one is built next. The page ignores any result that isn't
// for its latest request anyway.

import { initOC } from '../geometry/oc'
import { bearingBuilder } from '../geometry/builders'
import { createGeometryService } from '../geometry/service'
import { createCppService } from '../geometry/cppService'
import { loadCppEngine } from '../geometry/cppEngine'
import type { Engine, WorkerReply, WorkerRequest } from './protocol'
import type { BearingParams } from '../../shared/bearing'

const post = (msg: WorkerReply) => self.postMessage(msg)

const occService = createGeometryService(bearingBuilder)
let occReady: Promise<void> | null = null
let cppService: Promise<ReturnType<typeof createCppService>> | null = null

// Load on first use and report the outcome once.
function occ(): Promise<typeof occService> {
  occReady ??= initOC().then(
    () => post({ type: 'ready', engine: 'occ' }),
    (e) => {
      post({ type: 'failed', engine: 'occ', message: String(e) })
      throw e
    },
  )
  return occReady.then(() => occService)
}

function cpp(): Promise<ReturnType<typeof createCppService>> {
  cppService ??= loadCppEngine().then(
    (engine) => {
      post({ type: 'ready', engine: 'cpp' })
      return createCppService(engine)
    },
    (e) => {
      post({ type: 'failed', engine: 'cpp', message: String(e) })
      throw e
    },
  )
  return cppService
}

let pending: Extract<WorkerRequest, { type: 'build' }> | null = null
let busy = false

async function build(params: BearingParams, engine: Engine) {
  return engine === 'cpp' ? (await cpp()).build(params) : (await occ()).build(params)
}

async function drain() {
  busy = true
  while (pending) {
    const req = pending
    pending = null
    try {
      const result = await build(req.params as BearingParams, req.engine)
      post({ type: 'built', id: req.id, engine: req.engine, ...result })
    } catch (e) {
      console.error(e)
      post({ type: 'error', id: req.id, message: 'The geometry engine failed on this shape. Try nudging a value.' })
    }
    // yield so queued messages (newer params, exports) get handled
    await new Promise((r) => setTimeout(r, 0))
  }
  busy = false
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'build') {
    pending = msg
    if (!busy) void drain()
  } else if (msg.type === 'export') {
    try {
      const service = await occ()
      const { key } = service.build(msg.params as BearingParams) // cached if it was previewed with occ
      post({ type: 'file', id: msg.id, blob: service.exportFile(key, msg.body, msg.format) })
    } catch (err) {
      post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
    }
  }
}
