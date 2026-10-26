import { beforeAll, describe, expect, it } from 'vitest'
import { initOCNode } from './setupOC'
import { bearingBuilder } from '../src/geometry/builders'
import { createGeometryService } from '../src/geometry/service'
import { DEFAULT_INPUTS, resolveBearing } from '../shared/bearing'

const params = resolveBearing(DEFAULT_INPUTS)

beforeAll(async () => {
  await initOCNode()
}, 60_000)

describe('geometry service', () => {
  it('builds every body and times each one', () => {
    const service = createGeometryService(bearingBuilder)
    const r = service.build(params)
    expect(r.cached).toBe(false)
    expect(Object.keys(r.meshes)).toEqual(['inner_ring', 'outer_ring'])
    expect(r.meshes.inner_ring.indices.length).toBeGreaterThan(0)
    expect(r.bodyMs.inner_ring).toBeGreaterThan(0)
    expect(r.bodyMs.outer_ring).toBeGreaterThan(0)
  })

  it('serves repeat requests from the cache, whatever the key order', () => {
    const service = createGeometryService(bearingBuilder)
    const first = service.build(params)
    const reordered = Object.fromEntries(Object.entries(params).reverse()) as typeof params
    const again = service.build(reordered)
    expect(again.cached).toBe(true)
    expect(again.meshes).toBe(first.meshes)
    expect(again.ms).toBeLessThan(first.ms / 10)
  })

  it('evicts the least recently used entry', () => {
    const service = createGeometryService(bearingBuilder, 2)
    const a = service.build(params)
    service.build({ ...params, ball_n: 20 })
    service.build(params) // touch a, so the ball_n: 20 entry is now oldest
    service.build({ ...params, ball_n: 21 })
    expect(service.size).toBe(2)
    expect(service.build(params).cached).toBe(true)
    expect(service.build({ ...params, ball_n: 20 }).cached).toBe(false)
    expect(a.key).toBeTruthy()
  })

  it('exports STEP and STL from a cached build', async () => {
    const service = createGeometryService(bearingBuilder)
    const { key } = service.build(params)
    const step = await service.exportFile(key, 'outer_ring', 'step').text()
    expect(step.startsWith('ISO-10303-21')).toBe(true)
    const stl = service.exportFile(key, 'outer_ring', 'stl')
    expect(stl.size).toBeGreaterThan(84) // binary STL header + count
    expect(() => service.exportFile('nope', 'outer_ring', 'step')).toThrow()
  })
})
