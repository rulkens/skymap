# skymap

A WebGPU 3D renderer for **Sloan Digital Sky Survey (SDSS)** point-cloud data, built in TypeScript with React for the UI. Hover or click any galaxy to see its sky coordinates, redshift, lookback time, and SDSS metadata; pin one to compare against another; explore the cosmic-web wedge in 3D with mouse-driven orbit controls.

This is a personal learning project — the code is documented didactically throughout. If you're looking to learn WebGPU, GPU picking, or the basics of cosmological coordinate math, the source is meant to be read.

## Requirements

- **Node 20+**
- A **WebGPU-capable browser**: Chrome 113+ or Edge 113+ on desktop. Safari and Firefox have partial WebGPU support and are out of scope.

## Quickstart (synthetic data)

```bash
npm install
npm run dev
```

Open http://localhost:5173 — drag to orbit, scroll to zoom. Without a real SDSS data file present you'll see 100,000 synthetic galaxies distributed in a sphere. Enough to verify the renderer works end-to-end and to play with hover/select before you commit to a multi-megabyte download.

## Loading real SDSS data

The renderer fetches `/data/sdss.bin` at startup if present, otherwise it falls back to synthetic. To produce that file:

### 1. Get a CSV from SDSS SkyServer

Go to the [DR18 SQL Search](http://skyserver.sdss.org/dr18/SearchTools/sql) and run:

```sql
SELECT TOP 500000 objID, ra, dec, z,
       modelMag_u, modelMag_g, modelMag_r, modelMag_i, modelMag_z
FROM SpecPhoto
WHERE z > 0 AND zWarning = 0 AND class = 'GALAXY'
```

Choose **CSV** as the output format. You'll get a ~30 MB file with ~500k rows of spectroscopically confirmed, redshift-validated galaxies.

> Need more than the web form's row limit? Use [CasJobs](http://skyserver.sdss.org/casjobs) instead — same query, no timeout.

### 2. Convert to the binary format

```bash
npm run csv-to-bin -- path/to/your-query.csv public/data/sdss.bin
```

The tool will report how many points it wrote and how many rows it skipped (rows with bad redshifts or missing photometry). Vite serves anything in `public/` at the URL root, so the browser can fetch `/data/sdss.bin` automatically.

### 3. Reload the page

The status bar will switch from `(synthetic)` to `(sdss.bin)` and you'll see the characteristic SDSS galaxy wedge — anisotropic and richly clustered.

## Coordinate system

We use a right-handed equatorial Cartesian frame with distances in megaparsecs (Mpc):

- `+x` → (RA = 0°, Dec = 0°) — vernal equinox direction
- `+y` → (RA = 90°, Dec = 0°)
- `+z` → Dec = +90° — celestial north pole

Distance from redshift uses Hubble's law: `d = cz/H₀` with `H₀ = 70 km/s/Mpc`. This is the linear approximation — only accurate for `z ≪ 1` but fine to a few percent for the SDSS spectroscopic galaxy sample (most `z < 0.3`). A proper comoving-distance integration is on the roadmap, deferred.

## Tests

```bash
npm test
```

Unit tests cover the pure modules: coordinate conversion (forward and inverse), the binary point-cloud format, the orbit camera, and the derived-physics helpers. The rendering pipeline and React UI are not unit-tested — they're verified visually in the browser.

## Architecture

```
src/
  main.tsx                   React entry; mounts <App />
  App.tsx                    Top-level component; owns canvas ref + UI state
  engine.ts                  Imperative WebGPU/camera/picking core; emits
                             callbacks to the React layer
  components/
    StatusBar.tsx            Top-left load/ready indicator
    InfoCard.tsx             Top-right hover/select details panel
    ScaleBar.tsx             Bottom-right distance legend
  gpu/
    device.ts                WebGPU adapter/device/context init
    pointRenderer.ts         Visual instanced billboard pipeline
    pickRenderer.ts          GPU pick pipeline (r32uint texture + readback)
    shaders/points.wgsl      Shared vertex stage; two fragment entries
                             (visual + pick)
  camera/
    orbitCamera.ts           Pure state → view/projection matrices
    orbitControls.ts         DOM events → camera mutations + click detection
  data/
    coords.ts                RA/Dec/redshift ↔ Cartesian Mpc
    physics.ts               Lookback time, abs magnitude, sexagesimal,
                             SDSS naming, external URLs
    pointCloudFormat.ts      Binary `.bin` codec (SKMP v2)
    synthetic.ts             Deterministic synthetic galaxy cloud
  types.ts                   Shared `PointCloud` shape

tools/
  csvToBin.ts                SDSS CSV → binary converter (Node CLI)

docs/superpowers/plans/
  2026-05-03-sdss-webgpu-renderer.md   Original implementation plan
```

The split between `engine.ts` and the React tree is the core architectural choice: WebGPU and the per-frame loop are inherently imperative, so they live in a long-running engine that the React UI subscribes to via callbacks. React owns the DOM and the UI-relevant state slices (status, hovered, selected, scale); the engine owns everything that updates 60× per second.

## Browser binary format (SKMP v2)

Little-endian, 16-byte header (`magic = "SKMP"`, `version = 2`, `count`, `reserved`) followed by `count × 48` bytes:

```
offset  size  field
──────  ────  ─────
0       8     objID (uint64)
8       12    xyz   (3 × float32, Mpc)
20      20    magU/G/R/I/Z (5 × float32)
40      8     padding (for 16-byte alignment)
```

Old v1 files are no longer accepted — re-run `npm run csv-to-bin` to upgrade.

## Out of scope (roadmap)

These are deliberately not in this version:

- **Comoving distance via ΛCDM integration** — currently linear Hubble's law.
- **Spatial chunking + LOD** for ≥10M points. The current architecture maxes out around 1–5M points before frame rate degrades. SDSS's full photometric catalog (~1B objects) needs an octree-based renderer.
- **Galactic-coordinate orientation** (currently equatorial-aligned).
- **Picking on the photometric scale** — same blocker as above.
- **Mobile / Safari / Firefox support** — limited by partial WebGPU implementations.

## License

Personal project; no license declared. Ask before reuse.
