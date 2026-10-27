// Builds parts, meshes them for the preview, and caches the result by a hash
// of the parameters. Runs inside the geometry web worker; kept free of any
// worker plumbing so it can be unit tested in Node.

import type { Shape3D } from 'replicad'
import { stableStringify } from '../../shared/hash'
import { meshShape, type MeshData } from './mesh'

// One function per body, so each can be timed on its own.
export type Builder<P> = (params: P) => Record<string, () => Shape3D>

export interface BuildResult {
  key: string
  meshes: Record<string, MeshData>
  ms: number // this request (near zero on a cache hit)
  bodyMs: Record<string, number> // build + mesh per body, from the first build
  cached: boolean
}

export type ExportFormat = 'step' | 'stl'

// Same tolerance the CadQuery script exported STLs with.
const STL_OPTS = { tolerance: 0.01, angularTolerance: 0.1, binary: true }

interface Entry {
  shapes: Record<string, Shape3D>
  meshes: Record<string, MeshData>
  bodyMs: Record<string, number>
}

// Parameters hash to the same key whatever order the fields are in.
export const paramsKey = (params: unknown) => stableStringify(params)

// Least-recently-used cache. Map keeps insertion order, so delete + set moves
// an entry to the end and the first key is always the oldest.
export function createLru<V>(size: number) {
  const map = new Map<string, V>()
  return {
    get(key: string): V | undefined {
      const v = map.get(key)
      if (v !== undefined) {
        map.delete(key)
        map.set(key, v)
      }
      return v
    },
    set(key: string, v: V) {
      map.delete(key)
      map.set(key, v)
      while (map.size > size) map.delete(map.keys().next().value!)
    },
    get size() {
      return map.size
    },
  }
}

export function createGeometryService<P>(build: Builder<P>, cacheSize = 16) {
  const cache = createLru<Entry>(cacheSize)
  const remember = (key: string, entry: Entry) => cache.set(key, entry)

  return {
    build(params: P): BuildResult {
      const t0 = performance.now()
      const key = paramsKey(params)
      const hit = cache.get(key)
      if (hit) {
        remember(key, hit)
        return { key, meshes: hit.meshes, bodyMs: hit.bodyMs, ms: performance.now() - t0, cached: true }
      }

      const shapes: Record<string, Shape3D> = {}
      const meshes: Record<string, MeshData> = {}
      const bodyMs: Record<string, number> = {}
      for (const [name, make] of Object.entries(build(params))) {
        const tb = performance.now()
        shapes[name] = make()
        meshes[name] = meshShape(shapes[name])
        bodyMs[name] = performance.now() - tb
      }
      remember(key, { shapes, meshes, bodyMs })
      return { key, meshes, bodyMs, ms: performance.now() - t0, cached: false }
    },

    // STEP/STL for a body of something built earlier (still in the cache).
    exportFile(key: string, body: string, format: ExportFormat): Blob {
      const shape = cache.get(key)?.shapes[body]
      if (!shape) throw new Error('That model is no longer cached, rebuild it first')
      return format === 'step' ? shape.blobSTEP() : shape.blobSTL(STL_OPTS)
    },

    get size() {
      return cache.size
    },
  }
}
