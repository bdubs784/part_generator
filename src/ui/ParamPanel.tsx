import type { Issue, ParamDef, Severity } from '../../shared/params'
import { ParamField } from './ParamField'

interface Props<P extends object> {
  defs: ParamDef<keyof P & string>[]
  values: P
  issues: Issue<keyof P & string>[]
  onChange: (key: keyof P & string, v: number) => void
}

export function ParamPanel<P extends object>({ defs, values, issues, onChange }: Props<P>) {
  // worst issue per param, so the input can be outlined
  const flags = new Map<string, Severity>()
  for (const issue of issues) {
    for (const key of issue.params) {
      if (flags.get(key) !== 'error') flags.set(key, issue.severity)
    }
  }

  const groups = [...new Set(defs.map((d) => d.group))]
  return (
    <>
      {groups.map((group) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          {defs
            .filter((d) => d.group === group)
            .map((def) => (
              <ParamField
                key={def.key}
                def={def}
                value={values[def.key] as number}
                flag={flags.get(def.key)}
                onChange={(v) => onChange(def.key, v)}
              />
            ))}
        </fieldset>
      ))}
    </>
  )
}
