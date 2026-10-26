// Top-view sketch of a bearing, drawn from its parameters. Used for gallery
// thumbnails: nothing to store or upload, always consistent with the current
// geometry rules, and a few hundred bytes of SVG instead of an image.

import { BORE, boltCircle, boreDiameter, type BearingParams } from '../../shared/bearing'

interface Props {
  p: BearingParams
  size?: number
}

function borePath(p: BearingParams): string | null {
  const d = boreDiameter(p)
  if (p.bore_shape === BORE.HEX) {
    const r = d / Math.sqrt(3)
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i
      return `${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`
    })
    return `M${pts.join('L')}Z`
  }
  if (p.bore_shape === BORE.DFLAT) {
    // circle with the +X side cut off at the flat
    const r = d / 2
    const x = r - p.dflat
    const y = Math.sqrt(Math.max(0, r * r - x * x))
    return `M${x},${-y} A${r},${r} 0 1 0 ${x},${y} Z`
  }
  return null
}

export function BearingThumb({ p, size = 120 }: Props) {
  const R = (p.flange ? p.flange_od : p.od) / 2
  const bore = borePath(p)
  const holes = p.hole_d > 0
  return (
    <svg viewBox={`${-R * 1.05} ${-R * 1.05} ${R * 2.1} ${R * 2.1}`} width={size} height={size} aria-hidden="true">
      {p.flange ? <circle r={R} className="thumb-flange" /> : null}
      {/* outer ring, drawn as a thick annulus via evenodd */}
      <path
        fillRule="evenodd"
        className="thumb-outer"
        d={`M${p.od / 2},0 A${p.od / 2},${p.od / 2} 0 1 0 ${-p.od / 2},0 A${p.od / 2},${p.od / 2} 0 1 0 ${p.od / 2},0 Z
            M${p.outer_id / 2},0 A${p.outer_id / 2},${p.outer_id / 2} 0 1 1 ${-p.outer_id / 2},0 A${p.outer_id / 2},${p.outer_id / 2} 0 1 1 ${p.outer_id / 2},0 Z`}
      />
      <circle r={p.inner_od / 2} className="thumb-inner" />
      {Array.from({ length: p.ball_n }, (_, i) => {
        const a = (2 * Math.PI * i) / p.ball_n
        return (
          <circle
            key={i}
            cx={(p.pitch_d / 2) * Math.cos(a)}
            cy={(p.pitch_d / 2) * Math.sin(a)}
            r={p.ball_d / 2}
            className="thumb-ball"
          />
        )
      })}
      {bore ? <path d={bore} className="thumb-bore" /> : <circle r={boreDiameter(p) / 2} className="thumb-bore" />}
      {holes &&
        [...boltCircle(p.inner_bolt_d, p.inner_bolt_angle, p.hole_n), ...boltCircle(p.outer_bolt_d, p.outer_bolt_angle, p.hole_n)].map(
          ([x, z], i) => (
            <g key={i}>
              {p.counterbore ? <circle cx={x} cy={z} r={p.cb_d / 2} className="thumb-cb" /> : null}
              <circle cx={x} cy={z} r={p.hole_d / 2} className="thumb-bore" />
            </g>
          ),
        )}
    </svg>
  )
}
