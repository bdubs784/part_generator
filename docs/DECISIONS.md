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

## Inputs vs. derived values

The first version exposed all 17 dimensions as sliders, which meant guessing
numbers that depend on each other. Now the user sets what they actually know
(OD, bore, ball size, play, holes) and `resolveBearing()` works out the rest:

- ball circle in the middle of the radial space, so both ring walls match
- thickness from the tower bearing's thickness/ball ratio, but never thinner
  than the minimum lip plus a margin above the ball contact point
- lands halfway between the contact point and the face, capped so the lip
  stays at least `MIN_LIP`
- groove flat, notch size from the tower bearing's proportions
- bolt circles centred in each ring's wall, holes offset half a spacing from
  the notch
- ball count 70% of the max (the tower runs 33 of 47)

Any derived value can be overridden in the form; it shows "auto" until then
and has a reset button after. The tower presets override everything, so they
still reproduce the CadQuery rings exactly. Saved designs will store the
inputs plus overrides, not the resolved numbers, so an improved auto rule
updates old designs that didn't pin that value.

This mirrors driving vs. driven dimensions in CAD. Values the user typed never
change behind their back; only auto values move.

## Slider limits come from the validator

Each slider's range is the span of values that still validates with
everything else held (`shared/bounds.ts`): scan out from the current value,
then bisect the edge. Validation is plain arithmetic, so ~1000 checks per edit
is a few ms. Hand-deriving every limit (bore vs. hole circle vs. groove...)
would duplicate the rules and drift from them; this way the rules are the
single source. Select options that wouldn't validate are disabled the same
way.

It assumes each value's valid range is one interval around the current value,
which holds for every rule here.

## Typed values vs. sliders, and "Make it fit"

Sliders only move through valid designs. Typed numbers apply on Enter/blur,
clamped to the absolute limits, but they're allowed past the slider range:
that's how you ask for something the current design can't do yet ("this has
to be 45 mm OD").

When the design is broken, "Make it fit" (`shared/fit.ts`) repairs it while
keeping what the user edited. The app tracks edited fields in order. The fit
first drops overrides the user didn't make (e.g. from a preset), then changes
one field at a time to the nearest value that fixes everything, or failing
that leaves the fewest errors. Untouched fields go first, in the part's
`fitOrder` (holes, then bore, ball size, OD), then the user's own edits,
oldest first. It reports every change, and undo reverts it.

It's greedy, not an optimiser: a single visible change per step is easier to
trust and to explain than a solver moving five values at once.

Undo/redo keeps up to 100 steps; slider drags on one field within 800 ms
merge into one step.

Select options aren't disabled. On a valid design they're marked "(won't
fit)"; on a broken one, the ones that would fix it are marked "(fits)".
Disabling them locked the dropdowns as soon as the design was broken.

## Bore shape and shaft fit

Round, D-flat and hex. D-flats are on most small motor shafts; hex shafts
are everywhere in hobby robotics. The hex is cut into a smaller round hole,
and the D-flat adds the segment back into the round bore. Wall checks use the
hex corners, not the flats.

"Shaft fit" is a separate allowance added to the bore (press / snug / slip /
loose, or custom), so the bore field stays the shaft size the user knows.

A set-screw option was left out on purpose: the screw would go radially
through the inner ring, straight through the race, and the outer ring covers
it so a tool can't reach it.

## Ball fit check

The first flat rule only compared the flat to the ball contact points, which
let a 2–3.4 mm flat through even though the ball hits anything over ~2.0 mm.
Now `ballClearance()` measures from the ball centre to every edge of each
ring's cross-section, which catches any overlap (flat, flanks, lips) no
matter which inputs caused it. The exact flat limit is
`2 * ((√2 − 1) * r + play / 2)`: along the groove's centre line the ball stops
`(√2 − 1) * r` short of the V's apex.

## Negative play is opt-in

Some printers print grooves undersized, and the old v6 ring used −0.025 mm.
Play below 0 is an error unless "Allow negative play" is on; with it on, the
ball may sink into each flank by exactly its share of the play
(`−play / (2√2)`) and no further, and a warning stays up.

## Validation thresholds

- `MIN_WALL = 1.2 mm`: three perimeters with a 0.4 mm nozzle.
- `MIN_LIP = 0.6 mm`: groove lips are short features. The v5 inner ring has
  0.75 mm lips and they work, so 0.6 is the floor.
- Both are hard limits (errors), so the sliders can't produce a wall that
  won't print. That includes the bore: it stops a wall away from the groove
  and the bolt holes.
- `BALL_GAP = 0.1 mm` between neighbouring balls when counting how many fit,
  so a full ring doesn't jam. Gives 47 for the tower bearing.
- Warnings are for things that print fine but might not assemble well
  (narrow notch, negative play).

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

## Backend: Cloudflare Worker + D1

The API only stores designs and serves the catalog; geometry stays in the
browser. D1 (SQLite) over Postgres on Neon: same platform and deploy as the
Worker, no cold starts after idle, and the free tier is far more than this
needs. Migrations live in `backend/migrations` and run with
`wrangler d1 migrations apply` in CI before each deploy.

- **Validation:** `POST /api/designs` runs the same `parseBearingInputs` +
  `resolveBearing` + `validateBearing` as the UI. The shared code has no CAD
  imports, so the Worker bundle stays small.
- **What gets stored:** the inputs plus overrides, not the resolved numbers
  (see "Inputs vs. derived values"). `schema_ver` is saved with each design and
  `migrateInputs()` is where upgrades go when the inputs change shape.
- **Dedupe:** `params_hash` is SHA-256 of part type + schema version + the
  inputs as sorted-key JSON, with a unique index. Saving the same design twice
  returns the same link (200 instead of 201), whatever order the keys came in.
- **IDs:** 6 random characters from an alphabet without 0/1/i/l/o, so links
  survive being read out loud. ~890 million combinations; inserts retry on a
  clash.
- **Rate limiting:** fixed window, 20 saves per IP per 10 minutes, counted in a
  D1 table with one upsert per save. IPs are stored only as a salted hash.
  Durable Objects or Cloudflare's rate limit binding would be more exact, but
  this behaves the same in tests, local dev and production.
- **CORS:** only `https://bdubs784.github.io` and localhost get CORS headers.
  That stops other sites' pages from calling the API, not scripts; the rate
  limit and validation are what actually protect it.
- **Without the API:** the site still works. The catalog and Share button just
  don't appear, and a production build never falls back to localhost.

## Testing the API without Cloudflare

Handlers take a small `Db` interface (the slice of D1 they use). Tests back it
with Node's built-in `node:sqlite` and run the real migration files, so the
SQL is tested for real with no extra dependency. Playwright starts the actual
Worker with `wrangler dev` and a local D1 for the end-to-end share test.
