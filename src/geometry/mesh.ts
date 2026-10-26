// Turns a replicad shape into plain typed arrays for three.js. Plain arrays
// (not three objects) so this can move into a web worker later and be posted
// back without copying.

import type { Shape3D } from 'replicad'

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  edges: Float32Array // line segment pairs
}

// Preview only. Downloads mesh separately at a finer tolerance.
const PREVIEW = { tolerance: 0.05, angularTolerance: 0.2 }

export function meshShape(shape: Shape3D): MeshData {
  const m = shape.mesh(PREVIEW)
  const e = shape.meshEdges(PREVIEW)
  return {
    positions: new Float32Array(m.vertices),
    normals: new Float32Array(m.normals),
    indices: new Uint32Array(m.triangles),
    edges: new Float32Array(e.lines),
  }
}
