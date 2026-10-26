import { useEffect, useMemo, useState } from 'react'
import type { Shape3D } from 'replicad'
import { initOC } from './geometry/oc'
import { meshShape, type MeshData } from './geometry/mesh'
import { bearing } from './geometry/registry'
import { raceGeometry, type BearingParams } from '../shared/bearing'
import { ParamPanel } from './ui/ParamPanel'
import { Viewer, type Ball, type Body } from './ui/Viewer'
import { Downloads } from './ui/Downloads'

const COLORS: Record<string, string> = { inner_ring: '#c7ccd4', outer_ring: '#7f97b2' }

interface Model {
  params: BearingParams // what was actually built
  shapes: Record<string, Shape3D>
  meshes: Record<string, MeshData>
  ms: number
}

const part = bearing

export default function App() {
  const [params, setParams] = useState<BearingParams>(part.defaults)
  const [model, setModel] = useState<Model | null>(null)
  const [ocState, setOcState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [buildError, setBuildError] = useState<string | null>(null)
  const [section, setSection] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)

  const validation = useMemo(() => part.validate(params), [params])
  const race = useMemo(() => raceGeometry(params), [params])

  useEffect(() => {
    initOC().then(
      () => setOcState('ready'),
      (e) => {
        console.error(e)
        setOcState('failed')
      },
    )
  }, [])

  // Rebuild after the sliders settle. OpenCascade runs on the main thread
  // for now, so don't fire a build on every input event.
  useEffect(() => {
    if (ocState !== 'ready' || !validation.ok) return
    const timer = setTimeout(() => {
      const t0 = performance.now()
      try {
        const shapes = part.build(params)
        const meshes = Object.fromEntries(Object.entries(shapes).map(([k, s]) => [k, meshShape(s)]))
        setModel({ params, shapes, meshes, ms: performance.now() - t0 })
        setBuildError(null)
      } catch (e) {
        console.error(e)
        setBuildError('OpenCascade failed to build this shape. Try nudging a value.')
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [params, ocState, validation.ok])

  const bodies: Body[] = model
    ? Object.entries(model.meshes).map(([name, mesh]) => ({ name, mesh, color: COLORS[name] ?? '#aaa' }))
    : []

  const balls: Ball[] = useMemo(() => {
    if (!model) return []
    const p = model.params
    const r = p.pitch_d / 2
    return Array.from({ length: p.ball_n }, (_, i) => {
      const a = (2 * Math.PI * i) / p.ball_n
      return { position: [r * Math.cos(a), 0, r * Math.sin(a)] as [number, number, number], radius: p.ball_d / 2 }
    })
  }, [model])

  const stale = model !== null && model.params !== params
  const errors = validation.issues.filter((i) => i.severity === 'error')
  const warnings = validation.issues.filter((i) => i.severity === 'warning')

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Part Generator</h1>
          <p className="sub">{part.name}</p>
        </header>

        <label className="preset">
          Start from
          <select
            defaultValue=""
            onChange={(e) => {
              const preset = part.presets.find((pr) => pr.name === e.target.value)
              if (preset) setParams(preset.params)
            }}
          >
            <option value="" disabled>
              preset…
            </option>
            {part.presets.map((pr) => (
              <option key={pr.name}>{pr.name}</option>
            ))}
          </select>
        </label>

        <ParamPanel
          defs={part.params}
          values={params}
          issues={validation.issues}
          onChange={(key, v) => setParams((prev) => ({ ...prev, [key]: v }))}
        />

        <p className="info">
          Up to {race.maxBalls} balls fit. Groove contact at 45°, flats at R{race.innerFlatR.toFixed(3)} / R
          {race.outerFlatR.toFixed(3)}.
        </p>
      </aside>

      <main className="stage">
        <Viewer bodies={bodies} balls={balls} size={params.od} section={section} resetSignal={resetSignal} />

        <div className="toolbar">
          <button onClick={() => setResetSignal((n) => n + 1)}>Reset view</button>
          <label>
            <input type="checkbox" checked={section} onChange={(e) => setSection(e.target.checked)} /> Section
          </label>
          <span className="status" data-testid="status">
            {ocState === 'loading' && 'Loading CAD kernel…'}
            {ocState === 'failed' && 'CAD kernel failed to load'}
            {ocState === 'ready' && model && !stale && `Built in ${Math.round(model.ms)} ms`}
            {ocState === 'ready' && stale && validation.ok && 'Updating…'}
          </span>
        </div>

        {(errors.length > 0 || warnings.length > 0 || buildError) && (
          <ul className="issues" aria-live="polite">
            {buildError && <li className="error">{buildError}</li>}
            {errors.map((i) => (
              <li key={i.message} className="error">
                {i.message}
              </li>
            ))}
            {warnings.map((i) => (
              <li key={i.message} className="warning">
                {i.message}
              </li>
            ))}
            {errors.length > 0 && <li className="hint">Preview and downloads are paused until the errors are fixed.</li>}
          </ul>
        )}

        <Downloads shapes={model?.shapes ?? null} disabled={stale || !validation.ok} />
      </main>
    </div>
  )
}
