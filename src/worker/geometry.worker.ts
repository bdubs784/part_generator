// Geometry runs here so the page never freezes while OpenCascade works.
//
// Builds are coalesced: if new parameters arrive while a build is running,
// only the newest one is built next. The main thread ignores any result that
// isn't for its latest request anyway.

import { initOC } from '../geometry/oc'
import { bearingBuilder } from '../geometry/builders'
import { createGeometryService, type ExportFormat } from '../geometry/service'
import type { WorkerReply, WorkerRequest } from './protocol'
import type { BearingParams } from '../../shared/bearing'

const service = createGeometryService(bearingBuilder)
const ready = initOC()
let pending: Extract<WorkerRequest, { type: 'build' }> | null = null
let busy = false

const post = (msg: WorkerReply) => self.postMessage(msg)

ready.then(
  () => post({ type: 'ready' }),
  (e) => post({ type: 'failed', message: String(e) }),
)

async function drain() {
  busy = true
  await ready
  while (pending) {
    const req = pending
    pending = null
    try {
      post({ type: 'built', id: req.id, ...service.build(req.params as BearingParams) })
    } catch (e) {
      console.error(e)
      post({ type: 'error', id: req.id, message: 'OpenCascade failed to build this shape. Try nudging a value.' })
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
    await ready
    try {
      const blob = service.exportFile(msg.key, msg.body, msg.format as ExportFormat)
      post({ type: 'file', id: msg.id, blob })
    } catch (err) {
      post({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
    }
  }
}
