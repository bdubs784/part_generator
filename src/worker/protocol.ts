// Messages between the page and the geometry worker.

import type { BuildResult, ExportFormat } from '../geometry/service'

export type WorkerRequest =
  | { type: 'build'; id: number; params: unknown }
  | { type: 'export'; id: number; key: string; body: string; format: ExportFormat }

export type WorkerReply =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | ({ type: 'built'; id: number } & BuildResult)
  | { type: 'file'; id: number; blob: Blob }
  | { type: 'error'; id: number; message: string }
