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

You set the envelope and the balls; everything else is worked out and can be
overridden.

| Input | Default | Notes |
|---|---|---|
| Outer diameter / bore | 91.7 / 52 mm | |
| Ball size | 3/16" (4.7625 mm) | standard steel ball sizes, or custom |
| Play | 0.05 mm | total; axial = radial since the flanks are 45°. Below 0 only with "Allow negative play" |
| Bolt holes | M3 tight (Ø3.0), 4 per ring | or none |
| Fill notch | on | lets the balls snap in from the bottom face |

| Auto value | Rule |
|---|---|
| Thickness | 1.34 × ball (tower ratio), at least enough for printable lips |
| Ball circle | middle of the space between bore and OD |
| Ring lands | halfway between the ball contact point and the face |
| Groove flat | 0.21 × ball, always clear of the ball |
| Bolt circles | centred in each ring's wall |
| Ball count | 70% of the max that fits |

Sliders only cover values that keep the design valid, so dragging can't make
a wall too thin or a ball overlap a ring.

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
