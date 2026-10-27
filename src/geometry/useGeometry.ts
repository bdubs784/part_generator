// Talks to the geometry worker: sends parameters after they settle, keeps the
// newest result, and fetches STEP/STL files on demand.

import { useCallback, useEffect, useRef, useState } from 'react'
import { stableStringify } from '../../shared/hash'
import type { Engine, WorkerReply, WorkerRequest } from '../worker/protocol'
import type { MeshData } from './mesh'
import type { ExportFormat } from './service'

export interface Model<P> {
  key: string
  engine: Engine
  params: P // what was actually built
  meshes: Record<string, MeshData>
  ms: number
  bodyMs: Record<string, number>
  cached: boolean
}

export type KernelState = 'idle' | 'loading' | 'ready' | 'failed'

// Short, because the worker coalesces anyway; this just skips the in-between
// values of a fast slider drag.
const DEBOUNCE_MS = 60

export function useGeometry<P>(params: P, enabled: boolean, engine: Engine) {
  const worker = useRef<Worker | null>(null)
  const nextId = useRef(0)
  const latestBuild = useRef(0)
  const shown = useRef(0)
  const sent = useRef(new Map<number, P>())
  const waiting = useRef(new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>())

  const [kernels, setKernels] = useState<Record<Engine, KernelState>>({ cpp: 'idle', occ: 'idle' })
  const [model, setModel] = useState<Model<P> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const w = new Worker(new URL('../worker/geometry.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const pendingFiles = waiting.current
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const msg = e.data
      if (msg.type === 'ready') setKernels((k) => ({ ...k, [msg.engine]: 'ready' }))
      else if (msg.type === 'failed') setKernels((k) => ({ ...k, [msg.engine]: 'failed' }))
      else if (msg.type === 'built') {
        const builtParams = sent.current.get(msg.id)
        // drop this request and any older ones the worker skipped
        for (const id of sent.current.keys()) if (id <= msg.id) sent.current.delete(id)
        if (msg.id < shown.current || builtParams === undefined) return
        shown.current = msg.id
        setModel({
          key: msg.key,
          engine: msg.engine,
          params: builtParams,
          meshes: msg.meshes,
          ms: msg.ms,
          bodyMs: msg.bodyMs,
          cached: msg.cached,
        })
        setError(null)
      } else if (msg.type === 'file') {
        pendingFiles.get(msg.id)?.resolve(msg.blob)
        pendingFiles.delete(msg.id)
      } else if (msg.type === 'error') {
        const file = pendingFiles.get(msg.id)
        if (file) {
          file.reject(new Error(msg.message))
          pendingFiles.delete(msg.id)
        } else if (msg.id === latestBuild.current) {
          setError(msg.message)
        }
      }
    }
    return () => {
      w.terminate()
      for (const file of pendingFiles.values()) file.reject(new Error('Geometry worker stopped'))
      pendingFiles.clear()
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const timer = setTimeout(() => {
      const id = ++nextId.current
      latestBuild.current = id
      sent.current.set(id, params)
      setKernels((k) => (k[engine] === 'idle' ? { ...k, [engine]: 'loading' } : k))
      worker.current?.postMessage({ type: 'build', id, params, engine } satisfies WorkerRequest)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [params, enabled, engine])

  const exportFile = useCallback(
    (forParams: P, body: string, format: ExportFormat) =>
      new Promise<Blob>((resolve, reject) => {
        const id = ++nextId.current
        waiting.current.set(id, { resolve, reject })
        setKernels((k) => (k.occ === 'idle' ? { ...k, occ: 'loading' } : k))
        worker.current?.postMessage({ type: 'export', id, params: forParams, body, format } satisfies WorkerRequest)
      }),
    [],
  )

  // Is the model on screen the one for these params, from this engine?
  const current = model !== null && model.engine === engine && model.key === stableStringify(params)

  return { kernel: kernels[engine], kernels, model, current, error, exportFile }
}
