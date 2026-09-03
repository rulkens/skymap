# Cosmic Flow

A WebGPU dev tool that visualises the **CF4++ peculiar-velocity flow field** —
the large-scale streaming motions of galaxies toward attractors (Virgo, the
Great Attractor, Shapley, …) across a 1000 Mpc/h supergalactic box. It uploads
the CF4++ velocity grid as a 128³ 3D texture and advects particles through it
to reveal where the cosmic flow converges.

This is a sibling dev tool, like `tools/famous-curator/` — its own self-
contained Vite + React + TS app, not part of the skymap runtime bundle.

## Launch

```bash
npm run cosmic-flow
```

Then open <http://localhost:5300> (see `tools/utils/io/devPorts.ts` for the
full port registry).

## Field asset

The tool reads a single static field asset from `public/`:

- `cf4pp_vfield.bin` — RGBA16F C-order `[z][y][x]` blob: `rgb` = `v_mean_CF4pp`
  (velocity, km/s), `a` = `d_mean_CF4pp` (overdensity δ). Uploaded as a 128³
  `texture_3d`.
- `cf4pp_vfield.json` — sidecar metadata (`n`, `boxMpcPerH`, `format`,
  `layout`, `speedKmsMax`, `speedKmsP99`, `deltaMax`, `deltaP99`).

Both are **gitignored build artefacts** (same policy as `public/data/*.bin`):
they are deterministic outputs regenerated from the raw npz, never hand-edited.

### Regenerating the asset

```bash
python3 tools/cosmic-flow/data/convertCf4ppVfield.py
```

Requires Python 3 with **numpy**, and the CF4++ release npz at
`data/raw/cf4pp/CF4pp_mean_std_grids.npz`. The script writes both files into
`tools/cosmic-flow/public/`. Run it once per CF4++ npz release.

`data/findEdgeAttractors.py` is a separate **one-off analysis script** (not part
of the runtime tool) that ranks the velocity-convergence peaks near the box
edges and matches them against named superclusters.

## Structure labels

Structure-label positions (the supercluster names shown in the viz) are derived
**at runtime** from the field — there is no precomputed label asset to build or
ship.
