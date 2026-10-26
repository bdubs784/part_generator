import { useState } from 'react'
import type { ParamDef, Severity } from '../../shared/params'

interface Props {
  def: ParamDef
  value: number
  flag?: Severity
  onChange: (v: number) => void
}

// Slider + number box for one parameter. The number box keeps its own text so
// typing "4." or "-" doesn't get overwritten mid-edit.
export function ParamField({ def, value, flag, onChange }: Props) {
  const [text, setText] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    // value changed from outside (slider, preset, share link)
    setSeen(value)
    if (Number(text) !== value) setText(String(value))
  }

  const id = `param-${def.key}`
  return (
    <div className={`field ${flag ?? ''}`}>
      <label htmlFor={id}>{def.label}</label>
      <input
        type="range"
        aria-label={`${def.label} slider`}
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
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
          onBlur={() => setText(String(value))}
        />
        <span className="unit">{def.unit === 'deg' ? '°' : def.unit}</span>
      </div>
    </div>
  )
}
