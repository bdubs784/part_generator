import { useCallback, useRef, useState } from 'react'

interface History<T> {
  past: T[]
  present: T
  future: T[]
}

const LIMIT = 100
// Edits to the same field closer together than this are one undo step, so
// dragging a slider doesn't fill the history.
const MERGE_MS = 800

export function useHistory<T>(initial: T) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] })
  const last = useRef({ group: '', time: 0 })

  const set = useCallback((next: T, group = '') => {
    const now = Date.now()
    const merge = group !== '' && group === last.current.group && now - last.current.time < MERGE_MS
    last.current = { group, time: now }
    setH((prev) => ({
      past: merge ? prev.past : [...prev.past, prev.present].slice(-LIMIT),
      present: next,
      future: [],
    }))
  }, [])

  const undo = useCallback(() => {
    last.current = { group: '', time: 0 }
    setH((prev) =>
      prev.past.length === 0
        ? prev
        : { past: prev.past.slice(0, -1), present: prev.past[prev.past.length - 1], future: [prev.present, ...prev.future] },
    )
  }, [])

  const redo = useCallback(() => {
    last.current = { group: '', time: 0 }
    setH((prev) =>
      prev.future.length === 0
        ? prev
        : { past: [...prev.past, prev.present], present: prev.future[0], future: prev.future.slice(1) },
    )
  }, [])

  return { present: h.present, set, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}
