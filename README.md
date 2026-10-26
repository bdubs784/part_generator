# Part Generator

Parametric 3D-printable parts in the browser. Change dimensions, see the model
update, download STEP or STL.

**Live:** https://bdubs784.github.io/part_generator/

The first part is the printed ball bearing from the base (tower) joint of my
5-DOF arm: two rings with 45° V-groove races for 3/16" steel balls, a fill
notch to push the balls in, and M3 bolt holes.

## How it works

- **Geometry:** [replicad](https://replicad.xyz) (OpenCascade compiled to
  WebAssembly) builds real B-rep solids in the browser, so STEP export is
  exact, not a mesh.
- **Validation:** `shared/validate.ts` checks each design against printing
  limits (wall thickness, groove lips, ball count, bolt hole clearance). It has
  no CAD dependency, so the API will use the same file.
- **Preview:** React + three.js (react-three-fiber).

The geometry is a port of my original CadQuery script. With the default
parameters, the ring volumes match the CadQuery STEP files to 0.005 mm³
(`tests/bearing.test.ts`).

## Bearing parameters

| Parameter | Default | Notes |
|---|---|---|
| Ball diameter | 4.7625 mm | 3/16" |
| Ball count | 33 | preview only, max that fits is shown |
| Ball circle | 73.89 mm | |
| Play | 0.05 mm | total; axial = radial since the flanks are 45° |
| Groove flat | 1.0 mm | flat at the bottom of each V |
| Thickness | 6.4 mm | |
| Bore / inner ring OD | 52 / 72 mm | |
| Outer ring ID / OD | 76.7 / 91.7 mm | |
| Fill notch | 6.3 × 1.8 mm | bottom face, both rings |
| Bolt holes | 4 × Ø3 on Ø58 and Ø85.7 | |

## Development

```sh
npm install
npm run dev        # http://localhost:5173/part_generator/
npm test           # unit tests (validation + geometry)
npm run test:e2e   # Playwright, builds and serves the site first
npm run lint
```

Design notes are in [docs/DECISIONS.md](docs/DECISIONS.md).

## Roadmap

- [x] Bearing with live preview, validation, STEP/STL download
- [ ] Bearing size catalog and share links (Cloudflare Worker + D1)
- [ ] Geometry in a Web Worker, cache by parameter hash
- [ ] Gallery of saved designs
- [ ] Spur gear, MG996R servo mount
