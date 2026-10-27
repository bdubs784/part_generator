// Preview meshes from the C++/Manifold engine, cached the same way as the
// OpenCascade service. It only makes meshes; files still come from
// OpenCascade, which keeps the exact surfaces.

import type { BearingParams } from '../../shared/bearing'
import { innerRecipe, outerRecipe, runRecipe, toMeshData, type BearingEngine } from './manifoldEngine'
import type { MeshData } from './mesh'
import { createLru, paramsKey, type BuildResult } from './service'

interface Entry {
  meshes: Record<string, MeshData>
  bodyMs: Record<string, number>
}

export function createCppService(engine: BearingEngine, cacheSize = 16) {
  const cache = createLru<Entry>(cacheSize)
  return {
    build(params: BearingParams): BuildResult {
      const t0 = performance.now()
      const key = paramsKey(params)
      const hit = cache.get(key)
      if (hit) return { key, ...hit, ms: performance.now() - t0, cached: true }

      const meshes: Record<string, MeshData> = {}
      const bodyMs: Record<string, number> = {}
      for (const [name, recipe] of [
        ['inner_ring', innerRecipe(params)],
        ['outer_ring', outerRecipe(params)],
      ] as const) {
        const tb = performance.now()
        const result = runRecipe(engine, recipe)
        if (!result.ok) throw new Error(`Manifold couldn't build the ${name.replace('_', ' ')}`)
        meshes[name] = toMeshData(result)
        bodyMs[name] = performance.now() - tb
      }
      cache.set(key, { meshes, bodyMs })
      return { key, meshes, bodyMs, ms: performance.now() - t0, cached: false }
    },
  }
}
