import type { FieldDef, ParamDef } from '../../shared/params'
import { ParamField, type FieldState } from './ParamField'

interface Props {
  fields: FieldDef[]
  defs: Map<string, ParamDef>
  states: Map<string, FieldState>
  onChange: (field: FieldDef, v: number) => void
  onReset: (field: FieldDef) => void
  onResetAll: () => void
  anyOverrides: boolean
}

export function ParamPanel({ fields, defs, states, onChange, onReset, onResetAll, anyOverrides }: Props) {
  const visible = fields.filter((f) => {
    if (!f.dependsOn) return true
    const v = states.get(f.dependsOn)?.value
    return f.dependsOnValue === undefined ? v !== 0 : v === f.dependsOnValue
  })

  const renderSection = (section: FieldDef['section']) => {
    const inSection = visible.filter((f) => f.section === section)
    const groups = [...new Set(inSection.map((f) => f.group))]
    return groups.map((group) => (
      <fieldset key={group}>
        <legend>{group}</legend>
        {inSection
          .filter((f) => f.group === group)
          .map((f) => (
            <ParamField
              key={f.key}
              field={f}
              def={defs.get(f.key)!}
              state={states.get(f.key)!}
              onChange={(v) => onChange(f, v)}
              onReset={() => onReset(f)}
            />
          ))}
      </fieldset>
    ))
  }

  return (
    <>
      {renderSection('basic')}
      <details className="advanced">
        <summary>Advanced</summary>
        <p className="hint">These follow the values above automatically. Changing one pins it.</p>
        {renderSection('advanced')}
        <button className="reset-all" disabled={!anyOverrides} onClick={onResetAll}>
          Set everything back to auto
        </button>
      </details>
    </>
  )
}
