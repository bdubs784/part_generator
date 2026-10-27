# Part Generator

Parametric 3D-printable parts in the browser. Change a few dimensions, watch
the model update, download STEP or STL.

**Live:** https://bdubs784.github.io/part_generator/

![From the website to a slicer to a printed, assembled bearing spinning by hand](docs/print-demo.gif)

From the browser to a working part: design it on the site, slice the STL
(Bambu Studio, PLA on a Bambu Lab A1), drop in the steel balls through the
fill notch, and it spins. [Full video (20 s)](docs/print-demo.mp4)

The first part is a printable ball bearing: two rings with 45° V-groove races
for steel balls, a fill notch to snap the balls in, and bolt holes. The tool
started as a port of a CadQuery script I wrote for a bearing I designed and
printed, and with the reference preset it still produces those exact rings
(volumes match the CadQuery STEP files to 0.005 mm³).

<img src="docs/printed-bearing.jpg" alt="A printed bearing from the generator: two white PLA rings with steel balls between them" width="320">

## What it does

![The app: dragging the OD, section view, picking a 608, hex bore, share link, gallery](docs/demo.gif)

- **Few inputs, the rest worked out.** Set the OD, bore, ball size and play;
  thickness, ball circle, groove, notch, bolt circles and ball count follow.
  Any of those can be overridden.
- **Can't make an unprintable part by dragging.** Every slider only covers
  values that pass validation with everything else held, and the limits are
  shown under it.
- **Make it fit.** Type a value the current design can't do (say a 45 mm OD)
  and the tool adjusts the values you haven't touched, then tells you what it
  changed.
- **Shafts:** round, D-flat or hex bores, with a fit allowance for the printer.
- **Standard sizes:** pick a 608, 6205, etc. and it fills in the real bore,
  OD and width, then fits the balls and holes to them.
- **Share links and a gallery** of designs other people saved, with download
  counts.
- **Finishing:** edge chamfers (for elephant's foot and a lead-in), counterbored
  bolt holes sized for socket head screws, and an optional outer flange.
- **Two geometry engines:** a C++ engine I wrote on Manifold, compiled to
  WebAssembly, for the live preview (10–23× faster, 305 KB), and OpenCascade
  for the exact STEP/STL files. You can switch the preview between them.
- Undo/redo, section view, STEP and STL per ring.

## How the bearing is built

Each ring is a 2D cross-section revolved around the axis.

```
        outer ring                 r + |y| = A   (outer race flank)
    ┌───────────────┐
    │      ___      │
    │     /   \     │  45° V-groove, flat at the bottom
    │    |  ●  |    │  ● ball, touching both flanks
    │     \___/     │
    └───────────────┘
        inner ring                 r − |y| = B   (inner race flank)
```

A ball touching both 45° flanks of a V sits √2·r from the V's apex, so with
two races the flank lines are `A − B = 2√2·r + play` apart, centred on the
ball circle. Because the flanks are at 45°, axial play equals radial play.
Each groove is truncated with a small flat, which has to stay clear of the
ball: along the groove's centre line the ball stops `(√2 − 1)·r` short of the
apex, so `flat < 2·((√2 − 1)·r + play/2)`.

The rings' lands sit halfway between the ball's contact point and the face, so
the ball rolls on the flank and the lips stay printable. Balls go in through a
notch in the bottom face of both rings; lined up, the two notches leave a
channel just wider than a ball.

## Validation rules

All in `shared/validate.ts`, shared by the UI and the API. Errors block the
preview, the downloads and saving:

- diameters step outward: bore < inner ring OD < outer ring ID < OD
- walls ≥ 1.2 mm (three 0.4 mm perimeters), groove lips ≥ 0.6 mm
- a centred ball can't overlap either ring anywhere (flat, flanks, lips)
- the ball touches the flanks, not a lip edge
- bolt holes stay a wall away from the bore, the OD, the groove and each other
- ball count ≤ what fits on the ball circle (with 0.1 mm between balls)
- play ≥ 0 unless "Allow negative play" is on; with it, the ball may sink into
  each flank by exactly its share of the play

Warnings (it still builds): narrow fill notch, negative play.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["React UI<br/>sliders, validation, make it fit"]
    W["Web Worker<br/>C++/Manifold wasm: preview<br/>OpenCascade wasm: STEP/STL<br/>LRU cache by param hash"]
    V["three.js preview"]
    UI -- params --> W
    W -- meshes, STEP/STL --> UI
    UI --> V
  end
  S["shared/<br/>params, auto rules, validate.ts"]
  UI -. imports .- S
  API["Cloudflare Worker API"]
  API -. imports .- S
  DB[("D1 (SQLite)<br/>designs, catalog, rate limits")]
  UI -- "catalog, save, gallery" --> API
  API --> DB
```

- Geometry stays in the browser, in a Web Worker so the page never freezes.
  The preview comes from the C++ engine; OpenCascade (23 MB) only loads when
  you download a file or ask for the exact preview. Repeat builds come out of
  a cache keyed by the parameters.
- `shared/` has no CAD imports, so the same validation runs in the UI and the
  Worker. The server never trusts the client.
- The site is static on GitHub Pages; the API is a Cloudflare Worker with D1.

Design notes and trade-offs: [docs/DECISIONS.md](docs/DECISIONS.md).

## API

Base URL: `https://part-generator-api.blainewatkins784.workers.dev`. Browser
requests are only accepted from this site and localhost.

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | `{ ok, catalog }` |
| `GET` | `/api/catalog/bearings` | standard sizes: `{ bearings: [{ designation, bore_mm, od_mm, width_mm, notes }] }` |
| `POST` | `/api/designs` | body `{ part_type: "bearing", params }`, validated with the same rules as the UI. Returns `{ id, url }`: 201 if new, 200 if that exact design was already saved |
| `GET` | `/api/designs/:id` | `{ id, part_type, schema_ver, params, created_at, downloads }` |
| `GET` | `/api/designs?sort=recent&limit=20&before=…` | newest first, `{ designs, next }`; pass `next` as `before` for the next page |
| `POST` | `/api/designs/:id/download` | counts a download, 204 |

Errors are JSON `{ error, issues? }`: 400 invalid params, 404 not found,
413 body too large, 429 rate limited (20 saves per 10 minutes per IP).

```sh
curl https://part-generator-api.blainewatkins784.workers.dev/api/designs?limit=1
```

## Performance

Measured on my laptop, October 2026. Headless Chromium for the browser numbers,
`curl` for the API, Node for `npm run bench`.

**C++/Manifold vs OpenCascade** (both rings, build + mesh, median of 7, Node 24):

| Design | OpenCascade | C++ / Manifold | Speedup | Volume difference |
|---|---|---|---|---|
| Reference design (4 holes, notch) | 343 ms | 28.8 ms | 12× | −0.006% |
| Auto default (chamfers) | 539 ms | 34.5 ms | 16× | −0.006% |
| Hex bore | 408 ms | 40.1 ms | 10× | −0.013% |
| Counterbores + flange | 764 ms | 55.9 ms | 14× | −0.005% |
| 8 holes | 1003 ms | 44.0 ms | 23× | −0.004% |

In the browser (same session, default design, n=10): C++ median **64 ms** per
rebuild, OpenCascade 1100 ms. The C++ wasm is 105 KB gzipped against 7.3 MB.

| What | Result |
|---|---|
| Same build from the cache | **< 1 ms** in the worker (n=10) |
| Batching all hole/notch cuts into one boolean (OpenCascade, Node) | 925 → 786 ms default, 1681 → 1205 ms with counterbores + flange |
| Live site before the C++ engine: page drawn / first model (cold cache) | 3.3 s / 6.6 s, mostly the OpenCascade download |
| API, `GET` endpoints (new TLS connection each time) | median 155–165 ms, p95 under 205 ms (n=25 each) |
| API, `POST /api/designs` | median 240 ms (n=10) |

The TLS handshake is ~90 ms of each API request from here, so the Worker plus
D1 part is roughly 70 ms.

## Tests

- **Unit (Vitest):** validation rules, auto values, slider limits, make it fit,
  geometry (volumes match the CadQuery rings, OpenCascade validity check on
  every variant, hex and D-flat volumes against hand calculations), the
  geometry cache, and the API handlers against real SQL (`node:sqlite` running
  the D1 migrations).
- **End to end (Playwright):** loads the site and a local Worker + D1, then
  drives the real UI: sliders, make it fit, undo, standard sizes, share link
  round trip, gallery, download counting, STEP/STL downloads.
- CI runs lint, typecheck and both suites on every push; `main` deploys the
  site to Pages and the API to Cloudflare only if they pass.

## Development

```sh
npm install
npm run dev                 # http://localhost:5173/part_generator/
npm test                    # unit tests
npm run test:e2e            # Playwright (starts the site and a local API)
npm run lint

npm run api:migrate:local   # once: create the local D1 tables
npm run api:dev             # Worker on http://127.0.0.1:8787

npm run engine:build        # rebuild the C++ engine (needs emsdk, CMake, Ninja)
npm run bench               # C++ vs OpenCascade timings and volume differences
```

## Roadmap

- [x] Bearing with live preview, validation, STEP/STL download
- [x] Auto-derived dimensions, slider limits, make it fit
- [x] Standard sizes and share links (Cloudflare Worker + D1)
- [x] Geometry in a Web Worker with a parameter cache
- [x] Gallery of shared designs with download counts
- [x] Edge chamfers, counterbored bolt holes, outer flange
- [ ] Spur gear, MG996R servo mount
- [x] Geometry engine in C++/WebAssembly (Manifold), benchmarked against OpenCascade
