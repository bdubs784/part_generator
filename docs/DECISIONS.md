# Decisions

Notes on why things are the way they are.

## Geometry kernel: replicad

replicad wraps OpenCascade compiled to wasm, which is the same kernel CadQuery
uses. The bearing was designed in CadQuery, so the port is close to line for
line and the output can be checked against the old STEP files by volume. It
also writes real STEP, which a mesh library like manifold can't.

Cost: the wasm file is about 23 MB (7.3 MB gzipped). It's loaded with a
dynamic import so the page draws first and shows "Loading CAD kernel…".

## Same frame as the CadQuery script

Ring axis is Y, the profile is revolved in the XY plane, and the fill notch is
on the -Y (bottom) face pointing at +X. New STEP files drop into the arm
assembly in the same place as the old ones. three.js is Y-up too, so the
preview needs no rotation.

## Math in `shared/`, solids in `src/geometry/`

`shared/bearing.ts` has the params and race math (flank lines A and B, flats,
lips, max ball count) with no CAD imports. Validation and the backend need
those numbers but can't load the wasm kernel. `src/geometry/bearing.ts` only
turns profiles into solids.

## Params are flat objects of numbers

That keeps the slider panel, share links, the API body and the DB column all
generic. New part types (gear, servo mount) plug into `src/geometry/registry.ts`
with their own param table.

## Play instead of separate inner/outer offsets

The CadQuery script splits play evenly around the ball circle. The v7_zero
outer ring (zero play against the v5 inner) looked like a special case, but
it's the same as moving the ball circle in by half the old play (73.89 →
73.84) with play = 0. The inner ring comes out identical, so one param set
covers both. That's the "Tower v7" preset.

## Inner bolt holes are a polar pattern

The original inner hole centres were typed in by hand and don't lie exactly
on a circle. Here they're 4 holes on a Ø58 circle starting at 47.43°, which
moves each centre by up to ~0.02 mm. Far below print tolerance, and it means
the pattern scales with the ring.

## Validation thresholds

- `MIN_WALL = 1.2 mm`: three perimeters with a 0.4 mm nozzle.
- `MIN_LIP = 0.6 mm`: groove lips are short features. The v5 inner ring has
  0.75 mm lips and they work, so 0.6 is the floor.
- `BALL_GAP = 0.1 mm` between neighbouring balls when counting how many fit,
  so a full ring doesn't jam. Gives 47 for the tower bearing.
- Errors block the preview and downloads. Warnings only flag the inputs.

## Geometry on the main thread (for now)

Building both rings takes roughly 650 ms in headless Chromium on my laptop,
measured from the status line. Rebuilds are debounced 150 ms so dragging a
slider doesn't queue builds. Moving this into a Web Worker is the first v1
item; `meshShape` already returns plain typed arrays so they can be posted
across.

## OrbitControls without drei

drei would be one more dependency for one component. three ships
OrbitControls, and wiring it up with `useThree` is about 20 lines.

## Section view

Uses a three.js clipping plane, so the cut faces aren't capped (you see the
inside of the rings). Good enough to check the groove profile.
