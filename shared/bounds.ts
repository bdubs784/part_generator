// Works out how far one value can move before the design stops validating,
// holding everything else the user set. Used to limit the sliders.
//
// Validation is plain arithmetic (microseconds), so a scan plus bisection per
// field on every change is cheap, and it works for any part type without
// hand-deriving each constraint.

const SCAN_STEPS = 24
const BISECT_STEPS = 16

export function validRange(
  current: number,
  min: number,
  max: number,
  isValid: (v: number) => boolean,
): [number, number] {
  if (!isValid(current)) return [min, max]

  const edge = (target: number): number => {
    let good = current
    for (let i = 1; i <= SCAN_STEPS; i++) {
      const v = current + ((target - current) * i) / SCAN_STEPS
      if (isValid(v)) {
        good = v
        continue
      }
      // valid at `good`, invalid at `v`: narrow down the boundary
      let bad = v
      for (let k = 0; k < BISECT_STEPS; k++) {
        const mid = (good + bad) / 2
        if (isValid(mid)) good = mid
        else bad = mid
      }
      return good
    }
    return target
  }

  return [edge(min), edge(max)]
}

// Move the ends onto whole steps so the slider lands on clean numbers. Takes
// the nearest step if it's still valid (bisection stops a hair short of an
// exact limit like play = 0), otherwise the next step inwards. Never excludes
// the current value.
export function snapRange(
  [lo, hi]: [number, number],
  step: number,
  current: number,
  isValid: (v: number) => boolean,
): [number, number] {
  const tidy = (v: number) => Number(v.toFixed(6))
  const near = (v: number) => tidy(Math.round(v / step) * step)
  let snappedLo = near(lo)
  if (snappedLo < lo && !isValid(snappedLo)) snappedLo = tidy(snappedLo + step)
  let snappedHi = near(hi)
  if (snappedHi > hi && !isValid(snappedHi)) snappedHi = tidy(snappedHi - step)
  return [Math.min(snappedLo, current), Math.max(snappedHi, current)]
}
