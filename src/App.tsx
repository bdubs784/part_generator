import { useEffect, useMemo, useState } from 'react'
import type { Shape3D } from 'replicad'
import { initOC } from './geometry/oc'
import { meshShape, type MeshData } from './geometry/mesh'
import { bearing } from './geometry/registry'
import { raceGeometry, type BearingInputs, type BearingParams } from '../shared/bearing'
import { clearOverride, fieldRange, isOverridden, optionValid, setField } from '../shared/form'
import type { FieldDef, Severity } from '../shared/params'
import { ParamPanel } from './ui/ParamPanel'
import type { FieldState } from './ui/ParamField'
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
const defs = new Map(part.params.map((d) => [d.key as string, d]))

export default function App() {
  const [inputs, setInputs] = useState<BearingInputs>(part.defaults)
  const [model, setModel] = useState<Model | null>(null)
  const [ocState, setOcState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [buildError, setBuildError] = useState<string | null>(null)
  const [section, setSection] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)

  const params = useMemo(() => part.resolve(inputs), [inputs])
  const validation = useMemo(() => part.validate(params), [params])
  const race = useMemo(() => raceGeometry(params), [params])

  // Per-field slider limits, auto/override state and issue highlighting.
  const states = useMemo(() => {
    const flags = new Map<string, Severity>()
    for (const issue of validation.issues) {
      for (const key of issue.params) if (flags.get(key) !== 'error') flags.set(key, issue.severity)
    }
    const out = new Map<string, FieldState>()
    for (const field of part.fields) {
      const def = defs.get(field.key)!
      const value = params[field.key]
      const invalidOptions = new Set<number>()
      if (field.kind === 'select' && validation.ok) {
        for (const o of field.options ?? []) {
          if (!optionValid(inputs, field, o.value, part.resolve, part.validate)) invalidOptions.add(o.value)
        }
      }
      out.set(field.key, {
        value,
        range:
          field.kind === 'number' && validation.ok
            ? fieldRange(inputs, field, def, value, part.resolve, part.validate)
            : [def.min, def.max],
        auto: field.derived === true && !isOverridden(inputs, field),
        overridden: isOverridden(inputs, field),
        invalidOptions,
        flag: flags.get(field.key),
      })
    }
    return out
  }, [inputs, params, validation])

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

  const update = (next: BearingInputs) => setInputs(part.normalize(next))
  const onChange = (field: FieldDef, v: number) => update(setField(inputs, field, v))
  const onReset = (field: FieldDef) => update(clearOverride(inputs, field))

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
            value=""
            onChange={(e) => {
              if (e.target.value === 'default') return update(part.defaults)
              const preset = part.presets.find((pr) => pr.name === e.target.value)
              if (preset) update(preset.inputs)
            }}
          >
            <option value="" disabled>
              preset…
            </option>
            <option value="default">Default (all auto)</option>
            {part.presets.map((pr) => (
              <option key={pr.name}>{pr.name}</option>
            ))}
          </select>
        </label>

        <ParamPanel
          fields={part.fields}
          defs={defs}
          states={states}
          onChange={onChange}
          onReset={onReset}
          onResetAll={() => update({ ...inputs, overrides: {} })}
          anyOverrides={Object.keys(inputs.overrides).length > 0}
        />

        <p className="info">
          Up to {race.maxBalls} balls fit. Ring gap {((params.outer_id - params.inner_od) / 2).toFixed(2)} mm, lips{' '}
          {(params.width / 2 - race.innerMouth).toFixed(2)} / {(params.width / 2 - race.outerMouth).toFixed(2)} mm.
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
