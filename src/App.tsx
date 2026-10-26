import { useEffect, useMemo, useState } from 'react'
import { bearing } from './geometry/registry'
import { useGeometry } from './geometry/useGeometry'
import { migrateInputs, raceGeometry, type BearingInputs } from '../shared/bearing'
import { parseBearingInputs } from '../shared/validate'
import { clearOverride, fieldRange, isOverridden, optionValid, setField } from '../shared/form'
import { fitAround, type FitChange } from '../shared/fit'
import type { FieldDef, Severity } from '../shared/params'
import { ParamPanel } from './ui/ParamPanel'
import type { FieldState } from './ui/ParamField'
import { Viewer, type Ball, type Body } from './ui/Viewer'
import { Downloads } from './ui/Downloads'
import { useHistory } from './ui/useHistory'
import { Share, type ShareState } from './ui/Share'
import { Gallery } from './ui/Gallery'
import {
  apiConfigured,
  fetchCatalog,
  loadDesign,
  recordDownload,
  saveDesign,
  shareUrl,
  type CatalogBearing,
} from './api/client'

const COLORS: Record<string, string> = { inner_ring: '#c7ccd4', outer_ring: '#7f97b2' }

interface Design {
  inputs: BearingInputs
  touched: string[] // fields the user edited, oldest first
}

const part = bearing
const defs = new Map(part.params.map((d) => [d.key as string, d]))
const fieldsByKey = new Map(part.fields.map((f) => [f.key as string, f]))

// "Bolt holes 3 → 2.4", using option labels where there are some
function describeChange(c: FitChange): string {
  const def = defs.get(c.key)
  const field = fieldsByKey.get(c.key)
  const show = (v: number) => field?.options?.find((o) => o.value === v)?.label ?? `${Number(v.toFixed(3))}`
  return `${def?.label ?? c.key} ${show(c.from)} → ${show(c.to)}`
}

export default function App() {
  const history = useHistory<Design>({ inputs: part.defaults, touched: [] })
  const { inputs, touched } = history.present
  const [fitNote, setFitNote] = useState<string | null>(null)
  const [section, setSection] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const [catalog, setCatalog] = useState<CatalogBearing[]>([])
  const [share, setShare] = useState<ShareState & { inputs?: BearingInputs }>({ status: 'idle' })
  // the saved design on screen, if any: downloads of it count toward its total
  const [saved, setSaved] = useState<{ id: string; inputs: BearingInputs } | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)

  const params = useMemo(() => part.resolve(inputs), [inputs])
  const validation = useMemo(() => part.validate(params), [params])
  const race = useMemo(() => raceGeometry(params), [params])
  const geometry = useGeometry(params, validation.ok)
  const { model } = geometry

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
      // Valid design: mark options that would break it.
      // Broken design: mark the options that would fix it.
      const breaks = new Set<number>()
      const fixes = new Set<number>()
      if (field.kind === 'select') {
        for (const o of field.options ?? []) {
          const ok = optionValid(inputs, field, o.value, part.resolve, part.validate)
          if (validation.ok && !ok) breaks.add(o.value)
          if (!validation.ok && ok) fixes.add(o.value)
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
        breaks,
        fixes,
        flag: flags.get(field.key),
      })
    }
    return out
  }, [inputs, params, validation])

  // Standard sizes come from the API. Without it the list just isn't there.
  useEffect(() => {
    fetchCatalog().then(setCatalog, () => setCatalog([]))
  }, [])

  // ?d=<id> opens a saved design
  const { set: setHistory } = history
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('d')
    if (!id) return
    loadDesign(id).then(
      (design) => {
        const loaded = parseBearingInputs(migrateInputs(design.schema_ver, design.params))
        if (!loaded) return setFitNote(`Design ${id} was saved by a version this page can't read.`)
        setHistory({ inputs: loaded, touched: [] })
        setSaved({ id, inputs: loaded })
        setFitNote(`Opened shared design ${id}.`)
      },
      () => setFitNote(`Couldn't open design ${id}. The link may be wrong, or the server is down.`),
    )
  }, [setHistory])

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, except while typing in a box
  const { undo, redo } = history
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).tagName === 'INPUT') return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) undo()
      else if ((key === 'z' && e.shiftKey) || key === 'y') redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const commit = (next: Design, group = '') => {
    setFitNote(null)
    // the ?d= link describes the saved design, not this edited one
    if (location.search) window.history.replaceState(null, '', location.pathname)
    history.set({ ...next, inputs: part.normalize(next.inputs) }, group)
  }
  const touch = (key: string) => [...touched.filter((k) => k !== key), key]

  const onChange = (field: FieldDef, v: number) =>
    commit({ inputs: setField(inputs, field, v), touched: touch(field.key) }, field.key)
  const onReset = (field: FieldDef) =>
    commit({ inputs: clearOverride(inputs, field), touched: touched.filter((k) => k !== field.key) })

  const fit = (design: Design) =>
    fitAround(design.inputs, {
      fields: part.fields,
      defs,
      pinned: design.touched,
      order: part.fitOrder,
      resolve: part.resolve,
      validate: part.validate,
    })

  const makeItFit = () => {
    const result = fit({ inputs, touched })
    commit({ inputs: result.inputs, touched })
    setFitNote(
      result.ok
        ? `Changed ${result.changes.map(describeChange).join(', ')}. Undo puts it back.`
        : "Couldn't find a fit that keeps your edits. Try undoing the last one.",
    )
  }

  // A standard size pins bore, OD and thickness; everything else is fitted to it.
  const catalogDesign = (b: CatalogBearing): Design => ({
    inputs: { ...part.defaults, bore: b.bore_mm, bore_fit: 0, od: b.od_mm, overrides: { width: b.width_mm } },
    touched: ['bore', 'od', 'width'],
  })
  const applyCatalog = (b: CatalogBearing) => {
    const design = catalogDesign(b)
    const result = fit(design)
    commit({ ...design, inputs: result.inputs })
    const size = `${b.designation}: ${b.bore_mm} × ${b.od_mm} × ${b.width_mm} mm`
    setFitNote(
      !result.ok
        ? `${size} is too small for a printed bearing: the walls can't reach the 1.2 mm minimum.`
        : result.changes.length
          ? `${size}. To fit it: ${result.changes.map(describeChange).join(', ')}.`
          : `${size}.`,
    )
  }

  // which standard sizes can be printed at all, worked out once per catalog load
  const printable = useMemo(() => new Set(catalog.filter((b) => fit(catalogDesign(b)).ok).map((b) => b.designation)), [catalog])

  const onShare = () => {
    setShare({ status: 'saving' })
    saveDesign(inputs).then(
      ({ id }) => {
        window.history.replaceState(null, '', `?d=${id}`)
        setShare({ status: 'done', link: shareUrl(id), inputs })
        setSaved({ id, inputs })
      },
      (e) => setShare({ status: 'error', message: e instanceof Error ? e.message : 'Save failed' }),
    )
  }
  // a link only shows while it still matches what's on screen
  const shareState: ShareState = share.status === 'done' && share.inputs !== inputs ? { status: 'idle' } : share

  const openFromGallery = (id: string, opened: BearingInputs) => {
    commit({ inputs: opened, touched: [] })
    window.history.replaceState(null, '', `?d=${id}`)
    setSaved({ id, inputs: opened })
    setGalleryOpen(false)
    setFitNote(`Opened design ${id} from the gallery.`)
  }

  const onDownload = (body: string, format: 'step' | 'stl') => {
    if (!model) return Promise.reject(new Error('Nothing built yet'))
    if (saved && saved.inputs === inputs) recordDownload(saved.id)
    return geometry.exportFile(model.key, body, format)
  }

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

  const errors = validation.issues.filter((i) => i.severity === 'error')
  const warnings = validation.issues.filter((i) => i.severity === 'warning')
  const timings = model
    ? Object.entries(model.bodyMs)
        .map(([name, ms]) => `${name.replace('_', ' ')}: ${Math.round(ms)} ms`)
        .join(', ')
    : ''

  return (
    <div className="app">
      <aside className="panel">
        <header className="panel-head">
          <div>
            <h1>Part Generator</h1>
            <p className="sub">{part.name}</p>
          </div>
          {apiConfigured && <button onClick={() => setGalleryOpen(true)}>Gallery</button>}
        </header>

        <div className="history">
          <button onClick={history.undo} disabled={!history.canUndo} title="Ctrl+Z">
            Undo
          </button>
          <button onClick={history.redo} disabled={!history.canRedo} title="Ctrl+Shift+Z">
            Redo
          </button>
          <button onClick={() => commit({ inputs: part.defaults, touched: [] })} title="Back to the default bearing">
            Start over
          </button>
        </div>

        <div className="preset">
          <label htmlFor="start-from">Start from</label>
          <select
            id="start-from"
            value=""
            onChange={(e) => {
              const [kind, name] = e.target.value.split(':')
              const preset = part.presets.find((pr) => pr.name === name)
              const standard = catalog.find((b) => b.designation === name)
              if (kind === 'preset' && preset) commit({ inputs: preset.inputs, touched: [] })
              if (kind === 'catalog' && standard) applyCatalog(standard)
            }}
          >
            <option value="" disabled>
              preset or standard size…
            </option>
            <optgroup label="From my arm">
              {part.presets.map((pr) => (
                <option key={pr.name} value={`preset:${pr.name}`}>
                  {pr.name}
                </option>
              ))}
            </optgroup>
            {catalog.length > 0 && (
              <optgroup label="Standard sizes (bore × OD × width)">
                {catalog.map((b) => (
                  <option key={b.designation} value={`catalog:${b.designation}`}>
                    {b.designation}: {b.bore_mm} × {b.od_mm} × {b.width_mm}
                    {printable.has(b.designation) ? (b.notes ? ` (${b.notes})` : '') : ' (too small to print)'}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <ParamPanel
          fields={part.fields}
          defs={defs}
          states={states}
          onChange={onChange}
          onReset={onReset}
          onResetAll={() => commit({ inputs: { ...inputs, overrides: {} }, touched })}
          anyOverrides={Object.keys(inputs.overrides).length > 0}
        />

        <p className="info">
          Up to {race.maxBalls} balls fit. Ring gap {((params.outer_id - params.inner_od) / 2).toFixed(2)} mm, lips{' '}
          {(params.width / 2 - race.innerMouth).toFixed(2)} / {(params.width / 2 - race.outerMouth).toFixed(2)} mm.
        </p>
      </aside>

      <main className="stage">
        <Viewer bodies={bodies} balls={balls} size={params.od} section={section} resetSignal={resetSignal} ghost={!validation.ok} />

        <div className="toolbar">
          <button onClick={() => setResetSignal((n) => n + 1)}>Reset view</button>
          <label>
            <input type="checkbox" checked={section} onChange={(e) => setSection(e.target.checked)} /> Section
          </label>
          <span className="status" data-testid="status" title={timings}>
            {geometry.kernel === 'loading' && 'Loading CAD kernel…'}
            {geometry.kernel === 'failed' && 'CAD kernel failed to load'}
            {geometry.kernel === 'ready' && validation.ok && !geometry.current && (
              <>
                <span className="spinner" aria-hidden="true" /> Building…
              </>
            )}
            {geometry.kernel === 'ready' &&
              geometry.current &&
              model &&
              `Built in ${Math.round(model.ms)} ms${model.cached ? ' (cached)' : ''}`}
          </span>
        </div>

        {(errors.length > 0 || warnings.length > 0 || geometry.error || fitNote) && (
          <ul className="issues" aria-live="polite">
            {fitNote && <li className="note">{fitNote}</li>}
            {geometry.error && <li className="error">{geometry.error}</li>}
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
            {errors.length > 0 && (
              <li className="fix">
                <button onClick={makeItFit}>Make it fit</button>
                <span>keeps what you changed, adjusts the rest</span>
              </li>
            )}
          </ul>
        )}

        <Downloads bodies={model ? part.bodies : []} disabled={!geometry.current || !validation.ok} onDownload={onDownload}>
          {apiConfigured && <Share state={shareState} disabled={!validation.ok} onShare={onShare} />}
        </Downloads>
      </main>

      {galleryOpen && <Gallery onOpen={openFromGallery} onClose={() => setGalleryOpen(false)} />}
    </div>
  )
}
