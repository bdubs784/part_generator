// Messages between the page and the geometry worker.

import type { BuildResult, ExportFormat } from '../geometry/service'

// 'cpp' = the C++/Manifold engine (fast meshes), 'occ' = OpenCascade (exact).
export type Engine = 'cpp' | 'occ'

export type WorkerRequest =
  | { type: 'build'; id: number; params: unknown; engine: Engine }
  // files always come from OpenCascade, built (or taken from its cache) on demand
  | { type: 'export'; id: number; params: unknown; body: string; format: ExportFormat }

export type WorkerReply =
  | { type: 'ready'; engine: Engine }
  | { type: 'failed'; engine: Engine; message: string }
  | ({ type: 'built'; id: number; engine: Engine } & BuildResult)
  | { type: 'file'; id: number; blob: Blob }
  | { type: 'error'; id: number; message: string }
