import { useState } from 'react'
import type { FieldDef, ParamDef, Severity } from '../../shared/params'

export interface FieldState {
  value: number
  range: [number, number] // slider limits that keep the design valid
  auto: boolean // derived value the user hasn't touched
  overridden: boolean
  invalidOptions: Set<number> // select options that wouldn't fit
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

function NumberField({
  def,
  state,
  onChange,
  badge,
  id,
}: {
  def: ParamDef
  state: FieldState
  onChange: (v: number) => void
  badge: React.ReactNode
  id: string
}) {
  // The number box keeps its own text so typing "4." or "-" isn't overwritten.
  const [text, setText] = useState(fmt(state.value))
  const [seen, setSeen] = useState(state.value)
  if (state.value !== seen) {
    // value changed from outside (slider, preset, auto rule)
    setSeen(state.value)
    if (Number(text) !== state.value) setText(fmt(state.value))
  }
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
        <input
          id={id}
          type="number"
          step="any"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v)
          }}
          onBlur={() => setText(fmt(state.value))}
        />
        <span className="unit">{def.unit === 'deg' ? '°' : def.unit}</span>
      </div>
      <div className="limits">
        {fmt(lo)} – {fmt(hi)}
      </div>
    </div>
  )
}

const CUSTOM = 'custom'

function SelectField({
  field,
  def,
  state,
  onChange,
  badge,
  id,
}: {
  field: FieldDef
  def: ParamDef
  state: FieldState
  onChange: (v: number) => void
  badge: React.ReactNode
  id: string
}) {
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
          <option key={o.value} value={String(o.value)} disabled={state.invalidOptions.has(o.value)}>
            {o.label}
            {state.invalidOptions.has(o.value) ? ' (doesn’t fit)' : ''}
          </option>
        ))}
        {field.custom && <option value={CUSTOM}>Custom…</option>}
      </select>
      {showCustom && (
        <div className="num custom">
          <input
            type="number"
            step="any"
            aria-label={`${def.label} custom`}
            defaultValue={fmt(state.value)}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v)
            }}
          />
          <span className="unit">{def.unit}</span>
        </div>
      )}
    </div>
  )
}
