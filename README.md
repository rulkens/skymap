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

Go to the [DR18 SQL Search](https://skyserver.sdss.org/dr18/SearchTools/sql) and run:

```sql
SELECT
  s.specObjID AS objID,
  s.ra,
  s.dec,
  s.z,
  p.modelMag_u, p.modelMag_g, p.modelMag_r, p.modelMag_i, p.modelMag_z
FROM SpecObj AS s
JOIN PhotoObj AS p ON s.bestObjID = p.objID
WHERE s.class = 'GALAXY'
  AND s.zWarning = 0
  AND s.z BETWEEN 0.001 AND 0.8
```

Choose **CSV** as the output format. Without a `survey =` filter, this query returns the **Main, BOSS, and eBOSS** spectroscopic galaxy samples combined — roughly 2–3 M rows reaching out to z ≈ 0.7. The Main sample alone is ~930 k galaxies up to z ≈ 0.3; BOSS adds the deeper LRG sample.

> Need more than the web form's row limit? Use [CasJobs](https://skyserver.sdss.org/casjobs) instead — same query, no timeout.

### 2. Convert to the binary format

```bash
npm run csv-to-bin -- path/to/your-query.csv public/data/sdss.bin
```

The tool will report how many points it wrote and how many rows it skipped (rows with bad redshifts or missing photometry). Vite serves anything in `public/` at the URL root, so the browser can fetch `/data/sdss.bin` automatically.

### 3. Reload the page

The status bar will switch from `(synthetic)` to `(sdss.bin)` and you'll see the characteristic SDSS galaxy wedge — anisotropic and richly clustered.

## Loading multi-survey data

To render galaxies from all three surveys (SDSS Main+BOSS+eBOSS, 2MRS, GLADE) loaded in parallel:

### 1. Download the catalogues

| Survey | Source | File / Notes |
| ------ | ------ | -------------- |
| SDSS   | [SkyServer SQL](https://skyserver.sdss.org/dr18/SearchTools/sql) | Use the wider Main+BOSS+eBOSS query above. |
| 2MRS   | [VizieR J/ApJS/199/26](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/199/26) | `table3.dat`, 233-byte fixed-width, 44,599 rows, ~10 MB. Drop into `data/raw/2mrs_table3.dat`. |
| GLADE  | [VizieR VII/281](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/281) | `glade2.3.dat`, 256-byte fixed-width, 3.26 M rows, ~838 MB. Drop into `data/raw/glade2.3.dat`. |

GLADE alone subsumes 2MPZ and 6dFGS — the GLADE team has already cross-matched and deduplicated 2MPZ + 2MASS XSC + HyperLEDA + GWGC + SDSS-DR12Q, so a single download replaces what would otherwise be three.

### 2. Build the per-source binary files

```bash
npm run build-all -- \
  --sdss    "data/Skyserver_SQL.csv" \
  --twomrs  data/raw/2mrs_table3.dat \
  --glade   data/raw/glade2.3.dat \
  --out-dir public/data
```

The tool parses each catalogue, runs cross-match dedup using priority **SDSS > 2MRS > GLADE**, then writes three v2 binary files: `public/data/sdss.bin`, `2mrs.bin`, `glade.bin`. Sample run on the full inputs: 500 k SDSS / 41 k 2MRS / 2.1 M GLADE galaxies after dedup, ≈ 23 + 1.9 + 96 MB on disk.

### 3. Reload

The browser fetches all three files in parallel at startup. Surveys arrive progressively. The settings panel bottom-left has per-survey checkboxes plus an **Auto LOD** toggle that picks visible surveys based on camera distance:

- `< 200 Mpc` → 2MRS + GLADE (local universe; SDSS too sparse for nearby zooms)
- `200 – 800 Mpc` → all sources
- `> 800 Mpc` → SDSS only (the only survey reaching that depth)

> Want only some surveys? Omit the corresponding `--xxx` flag — the merger treats missing inputs as empty arrays and skips writing the empty output file.

### Per-survey colour indices

Each survey is coloured by its own most-informative photometric pair, since the
five magnitude slots in the binary format carry different bands depending on
the source. The raw colour difference is normalised to the shader's
blue → white → red ramp at upload time, and a per-row K-correction coefficient
compensates for redshift band-shifting before the ramp is sampled. Rows whose
preferred bands aren't measured render with a fixed mid-ramp tint instead of
poisoning the ramp with NaN.

| Survey    | Colour | Natural range | K per unit z | Why this k                                                       |
| --------- | ------ | ------------- | ------------ | ---------------------------------------------------------------- |
| SDSS      | u−g    | 0.5 .. 2.0    | 3.0          | Calibrated against the SDSS spectroscopic sample.                |
| GLADE     | B−J    | 0.5 .. 3.5    | 1.0          | Optical–NIR pair; B redshifts out of band slowly.                |
| 2MRS      | J−K    | 0.7 .. 1.1    | 0.0          | NIR colours are nearly redshift-invariant in 2MRS's z ≲ 0.1 box. |

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

### Camera focus

- **Focus button** on a pinned galaxy's InfoCard pivots the camera onto that
  galaxy with a 600 ms ease-out tween.  Yaw and pitch are preserved so you
  don't lose your orientation.
- **Home button** (bottom-left, next to the Settings panel) returns the camera
  to its initial framing — origin target, default distance and pitch.
- **Keyboard shortcuts:**
  - `f` — focus on the currently-pinned galaxy (no-op if nothing is pinned).
  - `h` — return to the home / Earth view.
  - `Esc` — clear the pinned selection.

Tweens are interrupted by mouse drag or wheel — manual orbit controls always
take precedence over an in-progress focus.

### SpaceMouse 6DOF input (optional)

If you have a 3Dconnexion SpaceMouse (Compact, Wireless, Pro, Enterprise, or
the older Logitech-branded SpaceNavigator), Skymap can read its 6 axes directly
via [WebHID](https://wicg.github.io/webhid/) for a much smoother free-flight
feel than mouse drag.

- Open the **Settings panel** (bottom-left) and click **Connect SpaceMouse**.
  The browser prompts you to pick the device; pick yours and grant access.
- Once paired, the permission persists across reloads — Skymap will silently
  re-acquire the device on every subsequent visit (no second prompt).
- Adjust the **Sensitivity** slider to taste. The response curve is cubic, so
  small puck deflections give very fine motion and full deflections give
  fast camera moves regardless of slider position.

Axis mapping:

| Puck motion | Camera effect |
|---|---|
| Push left / right | Pan target sideways |
| Push forward / back | Pan target up / down |
| Pull up / push down | Zoom (exponential, scale-invariant) |
| Tilt forward / back | Pitch |
| Turn left / right | Yaw |
| Twist | Ignored (orbit camera has no roll) |

**Browser support:** Chromium-only (Chrome, Edge, Brave, Opera). Firefox and
Safari don't implement WebHID and the entire SpaceMouse section of the settings
panel is hidden on those browsers — the rest of the app works exactly as before.
