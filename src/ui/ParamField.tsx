import { useState } from 'react'
import type { FieldDef, ParamDef, Severity } from '../../shared/params'

export interface FieldState {
  value: number
  range: [number, number] // slider limits that keep the design valid
  auto: boolean // derived value the user hasn't touched
  overridden: boolean
  breaks: Set<number> // select options that would break a valid design
  fixes: Set<number> // select options that would fix a broken one
  flag?: Severity
}

interface Props {
  field: FieldDef
  def: ParamDef
  state: FieldState
  onChange: (v: number) => void
  onReset: () => void
}

const fmt = (v: number) => String(Number(v.toFixed(4)))

export function ParamField({ field, def, state, onChange, onReset }: Props) {
  const id = `param-${def.key}`
  const badge = state.auto ? (
    <span className="badge" title="Worked out from the other values">
      auto
    </span>
  ) : state.overridden ? (
    <button className="reset" title="Go back to the automatic value" onClick={onReset}>
      ↺ auto
    </button>
  ) : null

  if (field.kind === 'toggle') {
    return (
      <div className={`field toggle ${state.flag ?? ''}`}>
        <label htmlFor={id}>
          <input id={id} type="checkbox" checked={state.value === 1} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
          {def.label}
        </label>
      </div>
    )
  }

  if (field.kind === 'select') {
    return <SelectField field={field} def={def} state={state} onChange={onChange} badge={badge} id={id} />
  }

  return <NumberField def={def} state={state} onChange={onChange} badge={badge} id={id} />
}

interface InnerProps {
  def: ParamDef
  state: FieldState
  onChange: (v: number) => void
  badge: React.ReactNode
  id: string
}

// Typed numbers apply on Enter or when the box loses focus, clamped to the
// absolute limits. They may go past the slider's range on purpose: that's how
// you ask for something the current design can't do yet, then "Make it fit".
function NumberBox({ def, value, onChange, id, label }: { def: ParamDef; value: number; onChange: (v: number) => void; id?: string; label?: string }) {
  const [text, setText] = useState(fmt(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    // changed from outside (slider, preset, undo, auto rule)
    setSeen(value)
    setText(fmt(value))
  }

  const apply = () => {
    const v = Number(text)
    if (text.trim() === '' || !Number.isFinite(v)) return setText(fmt(value))
    let clamped = Math.min(def.max, Math.max(def.min, v))
    if (def.integer) clamped = Math.round(clamped)
    setText(fmt(clamped))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <input
      id={id}
      aria-label={label}
      type="number"
      step="any"
      min={def.min}
      max={def.max}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === 'Enter') apply()
        if (e.key === 'Escape') setText(fmt(value))
      }}
    />
  )
}

function NumberField({ def, state, onChange, badge, id }: InnerProps) {
  const [lo, hi] = state.range
  return (
    <div className={`field ${state.flag ?? ''}`}>
      <div className="label">
        <label htmlFor={id}>{def.label}</label>
        {badge}
      </div>
      <input
        type="range"
        aria-label={`${def.label} slider`}
        min={lo}
        max={hi}
        step={def.integer ? 1 : def.step}
        value={state.value}
        disabled={lo === hi}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="num">
        <NumberBox id={id} def={def} value={state.value} onChange={onChange} />
        <span className="unit">{def.unit === 'deg' ? '°' : def.unit}</span>
      </div>
      <div className="limits">
        {fmt(lo)} – {fmt(hi)}
      </div>
    </div>
  )
}

const CUSTOM = 'custom'

function SelectField({ field, def, state, onChange, badge, id }: InnerProps & { field: FieldDef }) {
  const options = field.options ?? []
  const listed = options.some((o) => o.value === state.value)
  const [customOpen, setCustomOpen] = useState(!listed)
  const [seen, setSeen] = useState(state.value)
  if (state.value !== seen) {
    // a preset or typed value landed on a listed size: show it in the list
    setSeen(state.value)
    if (listed) setCustomOpen(false)
  }
  const showCustom = field.custom && (customOpen || !listed)

  const note = (v: number) => {
    if (v === state.value) return ''
    if (state.breaks.has(v)) return ' (won’t fit)'
    if (state.fixes.has(v)) return ' (fits)'
    return ''
  }

  return (
    <div className={`field select ${state.flag ?? ''}`}>
      <div className="label">
        <label htmlFor={id}>{def.label}</label>
        {badge}
      </div>
      <select
        id={id}
        value={showCustom ? CUSTOM : String(state.value)}
        onChange={(e) => {
          if (e.target.value === CUSTOM) return setCustomOpen(true)
          setCustomOpen(false)
          onChange(Number(e.target.value))
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>
            {o.label}
            {note(o.value)}
          </option>
        ))}
        {field.custom && <option value={CUSTOM}>Custom…</option>}
      </select>
      {showCustom && (
        <div className="num custom">
          <NumberBox def={def} value={state.value} onChange={onChange} label={`${def.label} custom`} />
          <span className="unit">{def.unit}</span>
        </div>
      )}
    </div>
  )
}
