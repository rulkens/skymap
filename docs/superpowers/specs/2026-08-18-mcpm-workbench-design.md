# MCPM Workbench (Polyphorm → browser WebGPU) — design

**Status:** Draft (2026-08-18), awaiting plan

**Decisions:** every choice below is settled in
[`docs/grill-sessions/mcpm-workbench-2026-08-18.md`](../../grill-sessions/mcpm-workbench-2026-08-18.md)
(Q1–Q13). Q-numbers are cited where the reasoning matters. §15 lists the
decisions this spec had to make on its own.

**Companion:** the `rulkens/Polyphorm` fork at `~/Development/vendor/cpp/polyphorm`,
tag `v1.0-macos-port` — a Dawn + GLFW + ImGui host whose kernels already exist in
WGSL beside the original HLSL, with the HLSL→WGSL problems solved and written up in
that repo's `docs/superpowers/research/{m2,m3,m4,m5}/`. Porting "Polyphorm to
WebGPU" therefore means porting the **host** to the browser; the kernels come across
nearly verbatim.

## 1. Purpose

An interactive workbench for fitting **MCPM** (Monte Carlo Physarum Machine) — the
agent-based cosmic-web reconstruction behind the SDSS Cosmic Slime VAC — to
skymap's own galaxy catalogs, in a browser tab, with live parameter tuning and a
live view of the trace field.

Its "save" is a hard requirement, not a nicety (Q1): the workbench must emit
volumes the existing rhizome importer eats, so the tool has to reproduce real
results rather than plausible-looking ones. That constraint is what keeps it from
becoming a toy.

Skymap already *consumes* MCPM output (`tools/volumes/buildRhizomeVolume.ts`, PRs
#546/#550) and the fork already *produces* it natively. This tool replaces the
offline Python packer + native-app leg with one browser step: pick catalogs, tune,
export.

## 2. Scope

**In scope (v1):**

- MCPM simulation core: agent propagation, field decay/diffusion, data-point
  deposit, density histogram — ported from the fork's WGSL with its quirk flags
  intact (Q3).
- Storage-buffer grids as `array<f16>` behind the `shader-f16` feature, f32
  fallback, one code path (Q5). Target 1200-class grids.
- Input from skymap v9 catalogs over the runtime boot path (Q2); grid box
  auto-fitted from the catalog bbox with manual override (Q4/Q12).
- Weights from the v9 `log10StellarMass` column with the fork's transform, plus a
  uniform-weight toggle and a visible NaN-fill count (Q9).
- Views: raymarched trace (new, samples the sim buffer directly), agent splat,
  volumetric path tracer, and an on-demand preview of the packed export (Q6/Q12).
- Export: `.npy` (f16) + `polyphy-trace` v1 sidecar download **and** direct
  in-browser `.scfd` (Q7).
- Validation: dev-only drag-drop loader for the fork's packed catalogs, plus a Node
  comparator CLI against the VAC trace anchor (Q10).
- Run controls: agent count 1M–10M, pause/resume/reset, trace-only clear, both
  agent-init modes, parameter save/load JSON with the SDSS-VAC preset (Q12).

**Architected for (not built now):** a live MCPM layer inside the skymap engine.
That is why the kernels land in `src/services/gpu/shaders/mcpm/` on day one rather
than in the tool (Q8) — the runtime WESL glob carries them with zero consumers,
which costs nothing because `wesl-plugin` is import-driven.

**Non-goals:**

- Bit-parity with the fork. Unreachable (Dawn-native vs browser Tint, plus racy
  non-atomic float deposits that stay forever — see §5). Validation is statistical.
- Agent sort pass, center attraction, halocolor/velocity modes, named parameter
  regimes (FRB/TNG/Bolshoi…). Dropped at Q12: unused, default-off, or specific to
  datasets skymap does not fit.
- Any write to `public/data` or the data manifest from the browser. Exports are
  downloads; promoting one to a shipped asset stays a `tools/` job.
- Slice-stack rendering, overdensity/highlight view modes (Q6).
- Mobile, touch, or non-Chromium support. This is a maintainer instrument.

## 3. Ground preparation

Produced by `refactor-ground` after the grill session converged; signed off by the
user. Three prep refactors, each its own commit, sequenced **before** the feature
commits. **Packaging: the prep commits ride the tool's PR** as leading commits —
they are small, and P3 has no independent motivation.

### P1 — `initGpu` grows an options parameter

`initGpu(canvas)` (`src/services/gpu/device.ts:50`) hardcodes its device request:
it mirrors `timestamp-query` from the adapter (`device.ts:82-86`) and asks for no
limits at all. The workbench is the repo's first caller needing `shader-f16` and
raised buffer limits, so the request becomes a parameter.

```ts
export type InitGpuOptions = {
  /** Requested in addition to timestamp-query; silently dropped if the adapter lacks one. */
  readonly requiredFeatures?: readonly GPUFeatureName[];
  /** Clamped per-key to the adapter's advertised maximum. */
  readonly requiredLimits?: Readonly<Record<string, number>>;
};

export async function initGpu(
  canvas: HTMLCanvasElement,
  options?: InitGpuOptions,
): Promise<GpuContext>;
```

Drop-and-clamp rather than throw, extending the mirror pattern `device.ts:82-86`
already uses: `requestDevice` throws on an unsupported feature or an over-limit
request, and both are recoverable here — a missing `shader-f16` means the f32 grid
path, a clamped `maxBufferSize` means a smaller grid. Callers read
`device.features` / `device.limits` for truth, exactly as the existing
`gpuTimingService` comment prescribes — as the workbench's preflight does (§5).

Both existing call sites — `src/services/engine/phases/initGpu.ts:91`,
`tools/flow-workbench/src/createFlowHarness.ts:84` — pass no options and are
unaffected.

### P2 — `packLogTraceVoxels` moves into `src/`

The browser tool must call the *real* packing code for its in-browser SCFD export
and its preview view; `src/` never imports `tools/` (79 importers one way, zero the
other), and a browser bundle rooted in `tools/` may import either. So the shared
helper moves to the side both can reach:

```
npm run move-files -- tools/utils/volume/packLogTraceVoxels.ts src/utils/volume/packLogTraceVoxels.ts
npm run move-files -- tools/utils/math/f32ToF16Bits.ts src/utils/math/f32ToF16Bits.ts
```

`f32ToF16Bits` is the pack helper's only runtime dependency and follows it.
`src/utils/volume/` is a new folder; `src/utils/math/` already exists and this is
where the adjacent finding below comes from.

ts-morph rewrites the tools-side importers (`buildMcpmVolume.ts`,
`buildRhizomeVolume.ts`, the verifiers) and drags the `tests/` mirror along;
behaviour-preserving, no new tests. `encodeScalarField`
(`src/data/volume/scalarFieldFormat.ts:119`) is already in `src/` and already
browser-safe (typed arrays + `DataView` only), so it needs nothing.

### P3 — the rhizome importer accepts f16 `.npy`

`buildRhizomeVolume.ts:90-98` rejects `<f2` on the grounds that half precision
loses information *before* block-averaging and log-normalisation. That reasoning
holds for a Python producer whose native array is f32 and would be *narrowed* to
export. Ours is the opposite case: the trace grid **is** f16 in GPU memory, so an
f32 `.npy` would be a widened copy carrying no extra information at twice the file
size.

Relax the guard to accept `<f2` by widening with the existing
`tools/utils/math/f16BitsToFloat.ts` before the stats/normalise step; keep the
rejection for every other dtype, with the message reworded to name f16 as accepted.
One test: an f16 `.npy` fixture builds to the same `.scfd` values as its f32
equivalent, within f16 rounding.

### Adjacent finding — not prep, backlog

After P2, `src/utils/math/` hosts two intentionally different f32→f16 encoders:
`f32ToF16Bits` (round-to-nearest-even, full range) and `floatToF16` (rough,
documented as adequate for `[0,1]` cube voxels). Their inverses are a genuine
duplicate pair: `src/utils/math/f16ToFloat.ts` and `tools/utils/math/f16BitsToFloat.ts`
are the same full-range decoder written twice. Consolidating is a separate change
with its own blast radius (`floatToF16`'s callers ship binaries); it goes to
`docs/BACKLOG.md`, not into this PR.

## 4. Architecture

Three homes, split by who else could ever want the code.

```
src/services/gpu/shaders/mcpm/     # the kernels + view shaders — runtime family (Q8)
  constants.wesl        workgroup sizes, N_HISTOGRAM_BINS, quirk override decls
  io.wesl               McpmUniforms + agent/grid binding declarations
  grid.wesl             voxel↔index, bounds-guarded load/store, manual trilinear
  rng.wesl              two-word Marsaglia MWC + wang_hash seeding
  propagate.wesl        ← cs_agents_propagate.wgsl
  decay.wesl            ← cs_field_decay.wgsl
  histogram.wesl        ← cs_density_histo.wgsl
  splatTransform.wesl   ← cs_particles_transform.wgsl
  splatBlit.wesl        ← cs_particles_blit.wgsl
  volpath.wesl          ← cs_volpath.wgsl
  volpathBlit.wesl      ← cs_volpath_blit.wgsl
  vertex.wesl           fullscreen triangle for the raymarch + blit passes
  fragment.wesl         trace raymarch + Polyphorm transfer function

tools/mcpm-workbench/              # the host — a sibling Vite app (flow-workbench pattern)
  index.html  vite.config.ts  wesl.toml  tsconfig.json  README.md
  probeGpuErrors.ts                headless GPU gate (galaxy-renderer pattern)
  @types/                          one type per file
  src/
    main.tsx
    sim/       createMcpmHarness · createGridBuffers · seedAgents ·
               specializeGridElement · encodeStep · readbackTrace
    field/     loadCatalogPoints · catalogBounds · autoFitGridBox ·
               deriveAgentWeights · loadPackedCatalog (dev-only)
    export/    emitTraceSidecar · exportNpy · exportScfd · previewPackedTrace
    render/    RenderGraph · shaders/blit.wesl
    state/     createStore · useStore · slices/
    ui/        App · Viewport · ControlsPanel · Slider · Toggle ·
               HistogramPlot · Hud · GridBoxPanel
  validate/    compareTraceCubes.ts (CLI) · readTraceCube · traceHistogram ·
               dataPointHistogram · axisMarginals

tools/parsers/npyWriter.ts         # writeNpy — the repo's first .npy writer
```

The tool imports the canonical shader family through its own `wesl.toml` whose
`root` points at the runtime tree, so `package::mcpm::grid` resolves identically in
both apps — the arrangement `tools/flow-workbench/wesl.toml` documents at length.
The tool keeps exactly one local `.wesl`, an HDR→swapchain blit, as flow-workbench
does.

The React layer imports no GPU and the sim layer imports no React. They meet at the
store (§10) and at the harness handle.

## 5. Grids and kernels

### Storage: buffers, element type specialised at compile time

WebGPU `read_write` storage textures are r32float-only and there is no f16 storage
texture, so f32 textures cap the grid near a 900 long axis — 7.5 GB at 1200, dead
in a tab. Storage buffers as `array<f16>` are the only path to the Q4 target, and
f16 is what upstream D3D11 Polyphorm actually ran (`R16_FLOAT`), so the buffer port
is *closer* to upstream than the fork's own r32float port.

| buffer            | element                | at 712×1200×728  | why                                                                       |
| ----------------- | ---------------------- | ---------------- | ------------------------------------------------------------------------- |
| deposit A / B     | `GridElem`             | 1.24 GB each     | 27-tap diffusion reads neighbours — needs a separate read and write target |
| trace             | `GridElem`             | 1.24 GB          | decay is per-voxel in place (`×(0.985 + 0.01·rand)`), so no ping-pong      |
| agents            | 6 × `f32` SoA          | 240 MB at 10M    | x, y, z, phi, theta, weight; length `n_agents + n_data_points`             |
| histogram         | `atomic<u32>` × 18     | 72 B             | 17 bins + max                                                              |
| splat / volpath   | `atomic<u32>` / `vec4f`| screen-sized     | already buffers in the fork                                                |

WGSL has no type generics, so "one code path" is bought with a single-line textual
specialisation of the linked WGSL string, applied before `createShaderModule`:

```ts
export type GridElement = 'f16' | 'f32';

/** Rewrites `alias GridElem = f32;` and prepends `enable f16;` for the f16 build. */
export function specializeGridElement(wgsl: string, element: GridElement): string;
```

The `.wesl` sources are authored with `alias GridElem = f32;` so they stay valid
standalone WGSL (the probe and any editor tooling see real code). Rejected
alternative: `?link` runtime conditional compilation — it buys exactly this and
nothing else, at the cost of a runtime linker dependency the root `wesl.toml`
deliberately avoids.

### Device request and preflight

```ts
const gpu = await initGpu(canvas, {
  requiredFeatures: ['shader-f16'],
  requiredLimits: {
    maxComputeInvocationsPerWorkgroup: 1024,  // propagate's 10×10×10 = 1000
    maxBufferSize: Number.MAX_SAFE_INTEGER,   // clamped to the adapter's max by P1
    maxStorageBufferBindingSize: Number.MAX_SAFE_INTEGER,
  },
});
```

Asking for everything and taking what the adapter gives is only safe because P1
clamps rather than throws. The harness then
preflights the configured grid against `device.limits` and refuses to allocate,
naming the offending buffer and the largest long-axis resolution that would fit.
WebGPU exposes no total-memory limit, only per-buffer ones, so the HUD prints the
summed budget for the human to judge. `device.features.has('shader-f16')` alone
selects `GridElement` — no separate user toggle, and no way for the flag and the
device to disagree.

### Kernel fidelity

Verbatim algorithm, transformed addressing (Q3/Q5): every texture load/store
becomes a buffer index through `grid.wesl`, and nothing else changes. Specifically
preserved:

- **Racy non-atomic float deposits.** Neither D3D11 nor WebGPU has float atomics;
  the resulting write contention is load-bearing Monte Carlo noise, not a bug.
  These stay forever, including after the Phase 4 quirk strip.
- **Quirk overrides**, each an `override` constant defaulting to the fork's
  behaviour: `QUIRK_RNG_SEED_GUARD_TYPO` (upstream's seed guard), the propagate
  dispatch truncation, and the `%`-wrap asymmetry in the 27-tap diffusion.
- **Explicit OOB guards.** The fork wraps sensing loads in bounds-check-and-zero
  helpers because Dawn/Metal clamps where D3D11 returned 0. The buffer port keeps
  them; without a guard an out-of-range index is a silently wrong voxel, not a
  clamp.
- **Data points are agents.** Indices `[0, n_data_points)` carry the sentinel
  `theta = -5.0` and take the early-return deposit-only branch.

The propagate dispatch is `[10,10,10]` workgroups of `(10, 10, grid_z)` with
`grid_z = ((n_agents + n_data_points) / 100) / 1000` under integer truncation — so
any total that is not a multiple of 100,000 leaves a tail of agents unstepped. The
agent-count control therefore **steps in units of 100,000**, which makes the quirk
unobservable while the flag is on and removes a class of "why is 3% of my swarm
frozen" investigation.

Kernel ports read the fork's research diary for the file they are porting;
`docs/superpowers/research/m2…m5/` in that repo carries the HLSL→WGSL reasoning per
kernel, and the plan's tasks name the relevant file.

## 6. Input — catalogs to agents

### Load path

Pure and store-free, matching what flow-workbench already proves out:
`loadDataManifest()` (`src/services/loading/dataManifest.ts:20-38`, memoized, never
rejects) → `tierFilenameForSource(source, tier)` (`src/data/tierTargets.ts:90-101`)
→ `dataUrl()` + `fetchWithProgress()` → `decodeGalaxyCatalog(buf)`
(`src/data/galaxyCatalog/galaxyCatalogFormat.ts:235`). Sources with
`tierTarget(source, tier) === 0` are excluded and yield `emptyGalaxyCatalog()`.

```ts
export type CatalogPoints = {
  /** Interleaved xyz, Mpc, observer-centred equatorial-cartesian. */
  readonly positions: Float32Array;
  readonly log10StellarMass: Float32Array;  // NaN where absent
  readonly count: number;
  readonly sources: readonly SourceType[];
};

export function loadCatalogPoints(
  sources: readonly SourceType[],
  tier: Tier,
): Promise<CatalogPoints>;
```

The frame is observer-centred right-handed equatorial-cartesian
(`src/utils/math/raDecZToCartesian.ts:1-17`; +x → RA 0/Dec 0, +z → celestial
north), so the export sidecar declares `frame: 'equatorial-cartesian'` and the
observer sits at the origin. No bbox or multi-source merge helper exists in the
repo; the tool writes its own typed-array reductions in the style of
`src/utils/galaxy/galaxyMedianAbsMag.ts`.

### Grid box

```ts
export type GridBox = {
  readonly centerMpc: Vec3;
  readonly sizeMpc: Vec3;   // dims × voxelSizeMpc, exactly
  readonly dims: Vec3;      // each a multiple of 8
  readonly voxelSizeMpc: number;   // cubic, by construction
};

export function autoFitGridBox(
  bounds: { min: Vec3; max: Vec3 },
  longAxisTarget: number,
  paddingMpc: number,
): GridBox;
```

**Voxels are cubic and the box absorbs the rounding**, not the other way round.
`voxelSizeMpc = longestPaddedExtent / longAxisTarget`, then
`dims_i = ceil8(extent_i / voxelSizeMpc)` and `sizeMpc_i = dims_i · voxelSizeMpc`.
Rounding dims up while pinning the box would make per-axis voxel sizes differ by up
to 1.1% at a 728 axis, which **fails `buildRhizomeVolume`'s 0.5% spread assert** —
the export would reject at the last step of a multi-hour fit. Growing the box
instead keeps the spread at exactly zero and costs a shell of empty voxels.

Multiple-of-8 dims are required because `cs_field_decay` dispatches `dims/8` with no
bounds tail. The manual override (Q4) takes center + size + long-axis resolution —
never free dims — so the cubic invariant cannot be typed away.

`origin_mpc` for the sidecar is the lower corner of voxel (0,0,0):
`center − dims · voxelSize / 2`.

### Weights

```ts
export type AgentWeights = {
  readonly weights: Float32Array;     // per data point, post-transform
  readonly nanCount: number;
  readonly medianLog10Mass: number;
};

export function deriveAgentWeights(
  log10StellarMass: Float32Array,
  mode: 'stellarMass' | 'uniform',
): AgentWeights;
```

Order, verbatim from the fork after the median fill: NaN entries take the finite
median → `w = log10(1 + max(W, 0))` → divide by the mean of `w` → scale by
`1e6 / n_points`. The `max(W, 0)` clamp guards the domain (`log10StellarMass` runs
~8–12 in practice, so it never bites, but a sentinel leaking through would produce
NaN weights that poison every deposit).

Median fill rather than exclusion (Q9): geometry is most of what MCPM uses, and
silently dropping galaxies makes later catalog-to-catalog comparisons lie. Because
the fill is invisible in the output, **the HUD shows the NaN count and fraction at
all times** — it is the one number that says what the fit stands on. The
uniform-weight toggle is the sanity check: a fit that looks identical either way is
not using its weights.

## 7. Views

All four render into the tool's HDR target and blit through `render/RenderGraph.ts`.

- **Trace raymarch** (default) — new lean marcher sampling the sim buffer directly
  via `grid.wesl`'s manual trilinear (8 loads + lerp). No per-frame copy, no
  packing. The runtime `scalarVolume` renderer is *not* reusable: it is
  `texture_3d<f32>` + `textureSampleLevel` and eats packed SCFD, and no
  trilinear-from-storage-buffer precedent exists anywhere in the repo.
  Transfer function is Polyphorm's: remap `r = 1 - exp(-t)`, colour from the
  palette at `r`, alpha `= opticalThickness · r`.
- **Agent splat** — ported `splatTransform` + `splatBlit`: atomic u32 accumulation
  buffer, row-major, data points weighted 10000×, agents 10×, then a tonemapping
  blit. Watching the swarm is half the diagnostic value; a fit that has collapsed
  or stalled shows there first.
- **Volumetric path tracer** — ported `volpath` + `volpathBlit`: delta (Woodcock)
  tracking, Henyey-Greenstein phase, Russian roulette, `vec4<f32>` storage-buffer
  temporal accumulator. Parameters: sigma_t, albedo, sigma_e, anisotropy, ambient
  trace, bounces, trace_max, exposure, compressive toggle. Accumulation resets on
  any camera or parameter change.
- **Preview export** — on demand, not per frame: pack the current trace through the
  real `packLogTraceVoxels` and display the packed cube once. This is the only view
  that exercises pipeline code, which is the point — it catches a packing or
  transpose regression before the export leaves the tab.

**Palette.** The existing `buildPaletteLut(id)`
(`src/data/volume/scalarFieldPalettes.ts:63`) supplies a 256-entry RGBA8 LUT,
uploaded as a 256×1 `rgba8unorm` texture — no bundled `.tga`, and the workbench and
the runtime volume renderer offer the same named palettes, which makes a
preview-vs-app comparison meaningful. Only the LUT's **RGB** is used; alpha comes
from Polyphorm's `opticalThickness · r`, because the LUT's baked opacity ramp is
tuned for the runtime's presentation and would make the workbench's image
incomparable to fork screenshots.

## 8. Export

Both legs (Q7), from one readback.

```ts
export function readbackTrace(): Promise<{
  data: Uint16Array | Float32Array;   // f16 bits, or f32 when the grid is f32
  element: GridElement;
  dims: Vec3;
}>;
```

**Leg 1 — `.npy` + sidecar downloads.** Feeds `buildRhizomeVolume.ts` unchanged
apart from P3.

```ts
// tools/parsers/npyWriter.ts — mirrors readNpy (tools/parsers/npyReader.ts:34)
export function writeNpy(
  values: Uint16Array | Float32Array | Float64Array,
  shape: readonly number[],
  dtype: '<f2' | '<f4' | '<f8',
): ArrayBuffer;
```

NumPy format v1.0 header, C-order, little-endian — the exact subset `readNpy`
accepts. The sidecar is `polyphy-trace` v1 verbatim
(`tools/parsers/polyphyTraceSidecar.ts:52`), same basename, `.json`; keys stay
snake_case on the wire:

```json
{
  "format": "polyphy-trace",
  "version": 1,
  "dims": [712, 1200, 728],
  "origin_mpc": [-356.0, -600.0, -364.0],
  "voxel_size_mpc": [1.0, 1.0, 1.0],
  "frame": "equatorial-cartesian",
  "value_units": "mcpm-trace-density",
  "provenance": {
    "producer": "mcpm-workbench",
    "produced_at": "2026-08-18T14:02:11+0200",
    "catalog": { "sources": ["sdss", "2mrs", "glade"], "tier": "large",
                 "n_points": 1642391, "nan_mass_filled": 20114 },
    "params": { "senseSpreadDeg": 20, "senseDistanceMpc": 4.6, "turnAngleDeg": 10,
                "moveDistanceMpc": 0.1, "depositValue": 0, "persistence": 0.8,
                "sharpness": 2.5, "normalizationFactor": 1.0 },
    "n_agents": 10000000,
    "steps": 5000,
    "seed": 12345
  }
}
```

`voxel_size_mpc` is written as three equal numbers because §6 makes it exactly
cubic; the importer's 0.5% spread assert then passes with no margin consumed. No
git commit rides the provenance — the browser cannot know it. Filenames default to
`mcpm-<yyyymmdd-hhmm>.npy` / `.json`; the pair must keep a common basename, which
the download button enforces by naming both from one stem.

**Leg 2 — in-browser `.scfd`.** `packLogTraceVoxels` (post-P2) →
`encodeScalarField` (`src/data/volume/scalarFieldFormat.ts:119`) with
`channels = 1`, identity rotation, `frameKind = 'equatorial-cartesian'`, origin and
voxel size from the grid box. Downloads directly. Same packing code as leg 1's
importer, so the two outputs are diffable, which is the whole reason both exist.

Neither leg touches `public/data` or the manifest. Promoting an export to a shipped
asset is `buildRhizomeVolume --quick-look` or `--out`, unchanged.

## 9. Validation

The anchor is the VAC trace skymap already has on the maintainer path:
`data/raw/mcpm/trace.bin` (712×1200×728, headerless f16, `index = z·W·H + y·W + x`)
plus `data/raw/mcpm/export_metadata.txt`, which carries every parameter of the run
that produced it. Both are gitignored maintainer downloads
(`data/raw/mcpm/README.md`).

The obstacle (Q10) is that this trace was fitted to the packed VAC catalog —
324,901 points with the VAC's own cuts — which skymap's SDSS bin (970k points,
different cuts) is not. So validation gets its own input path:

- **Dev-only packed-catalog loader.** Drag-drop the fork's flat f32 `[X, Y, Z, W]`
  `.bin` plus its metadata txt (count, extrema, mean weight), gated on
  `import.meta.env.DEV`. Weights take the packed file's `W` through the same
  transform as §6. This is the *only* concession to the Polyphorm packed format;
  Q2's "no packed loader" deferral said "until validation day", and this is it.

- **Node comparator CLI.**

  ```
  npx tsx tools/mcpm-workbench/validate/compareTraceCubes.ts \
    --a data/raw/mcpm/trace.bin --b ~/Downloads/mcpm-20260818.npy \
    --dims 712,1200,728 --points <packed-catalog.bin> [--bins 17] [--json out.json]
  ```

  `--dims` describes the headerless `.bin` inputs only; a `.npy` carries its own
  shape and dtype, and a mismatch between the two sides is a hard error.

  ```ts
  export type TraceStats = {
    readonly logHistogram: Float64Array;       // fixed edges over log(1+trace), all voxels
    readonly dataPointHistogram: Float64Array; // 17 bins, the fork's N_HISTOGRAM_BINS
    readonly marginals: readonly [Float64Array, Float64Array, Float64Array];
    readonly meanLogTraceAtPoints: number;
  };
  ```

  Reported comparison: **total-variation distance** between each normalised
  histogram pair, and max relative deviation per axis marginal. TV distance because
  it is bounded in [0,1], needs no bin-count tuning, and does not blow up on empty
  bins the way a χ² or KL does — the low-density tail is nearly all empty.

Exact acceptance bands are **not** set here. They are an output of Phase 3: the
first run establishes what "the same fit twice" looks like under racy deposits, and
that number becomes the band, recorded in the tool README. Setting a band before
measuring the noise floor would be inventing a threshold.

Round-tripping a skymap catalog *out* to packed format and running the native fork
(Q10 option B) stays available as a manual exercise; nothing is built for it.

## 10. State and UI

Hand-rolled observable store, flow-workbench's shape (`createStore` / `useStore` +
typed slices, React binding via `useSyncExternalStore`, immutable updates). No
redux, no react-redux — the tool is outside `src/state`'s regime entirely.

| slice       | holds                                                                             |
| ----------- | --------------------------------------------------------------------------------- |
| `catalog`   | selected sources + tier, load status, point count, NaN-fill count, weight mode     |
| `grid`      | `GridBox`, auto-fit vs manual, long-axis target, resolved `GridElement`, byte budget |
| `sim`       | `McpmParams`, agent count, agent-init mode, running/paused, step counter, seed     |
| `view`      | active mode, camera, raymarch params, path-tracer params                            |
| `histogram` | latest 17-bin vector + the `meanLogTraceAtPoints` time series                       |

```ts
export type McpmParams = {
  readonly senseSpreadDeg: number;      // SDSS-VAC preset: 20
  readonly senseDistanceMpc: number;    // 4.6
  readonly turnAngleDeg: number;        // 10
  readonly moveDistanceMpc: number;     // 0.1
  readonly depositValue: number;        // 0 — data-driven
  readonly persistence: number;         // 0.8 (the fork's decay_factor)
  readonly sharpness: number;           // 2.5
  readonly normalizationFactor: number; // 1.0
};
```

The SDSS-VAC values are the starting preset (Q12). Parameter save/load is a JSON
download/upload of `McpmParams` + agent count + init mode + grid box; the same
object rides the export sidecar's `provenance.params`, so a screenshot's parameters
are always recoverable from its cube.

UI wears skymap's chrome by importing `src/styles/global.css` and referencing
tokens, as the sibling tools do. `Slider` / `Toggle` are tool-local (flow-workbench
has its own pair; promoting them to `src/components/common/` is a standing backlog
item, not this PR's business). `HistogramPlot` is new: a small canvas drawing the
17 bins plus the mean-log-trace curve.

## 11. Build wiring

```jsonc
"mcpm-workbench":         "vite --config tools/mcpm-workbench/vite.config.ts",
"mcpm-workbench:probe":   "tsx tools/mcpm-workbench/probeGpuErrors.ts",
"mcpm-workbench:compare": "tsx tools/mcpm-workbench/validate/compareTraceCubes.ts"
```

- `vite.config.ts`: own `root`, `publicDir: ../../public` (so the workbench serves
  the very same `public/data/galaxy-catalog/v9/*.bin` the runtime fetches), port
  **5500**, `@vitejs/plugin-react`, and `viteWesl({ extensions:
  [staticBuildExtension], weslToml: resolve(__dirname, 'wesl.toml') })`. The
  explicit `weslToml` is mandatory, not stylistic: the plugin otherwise reads
  `<process.cwd()>/wesl.toml`, and npm scripts keep cwd at the repo root — the tool
  would silently link the runtime's shader set.
- `wesl.toml`: `root = "../../src/services/gpu/shaders"` with `include` covering
  that tree plus `src/render/shaders/*.wesl`, mirroring
  `tools/flow-workbench/wesl.toml` and its reasoning.
- `tsconfig.tools.json` already covers all of `tools/`, so `npm run typecheck`
  picks the tool up with no change; a local `tsconfig.json` exists only for editor
  resolution, as the siblings have.
- The new `mcpm/` shader family is auto-included by the root `wesl.toml` glob. It
  costs the app build nothing: `wesl-plugin` is import-driven via `?static`, so
  `.wesl` files nothing imports are inert.
- `probeGpuErrors.ts` follows `tools/galaxy-renderer/probeGpuErrors.ts`: its own
  ephemeral-port Vite server, real `chromium` channel first with a headless-shell
  fallback (`--enable-unsafe-webgpu --use-angle=metal`), an `addInitScript` that
  monkey-patches `requestDevice` to capture `uncapturederror` and `device.lost`
  (ignoring reason `'destroyed'`), a step queue, six settle frames, an error drain,
  and a non-zero exit on any failure. Its step queue drives: load a synthetic
  catalog, allocate a small grid, run every pass once in each view mode.

## 12. Testing strategy

Judged by the house question — will it fail on a real bug nothing else catches?

**Vitest (pure TS, no GPU):**

- `autoFitGridBox` — hand-computed dims and voxel size for an asymmetric bbox;
  every axis a multiple of 8; voxel size identical on all three axes (the property
  the importer's spread assert depends on); manual override preserving it.
- World↔grid mapping — a point at a known Mpc position lands at a hand-computed
  voxel index, and the round trip through the origin/voxel-size affine returns it.
- `deriveAgentWeights` — median fill with an odd and an even finite count, NaN count
  and fraction, mean-normalised output (mean of `w` is 1 before the `1e6/n` scale),
  uniform mode ignoring mass entirely.
- `writeNpy` → `readNpy` round trip for `<f2` and `<f4`, including a non-cubic
  shape so an axis-order slip is visible.
- `emitTraceSidecar` → `parsePolyphyTraceSidecar` round trip: every field survives
  the snake_case wire hop, and a cube whose voxel sizes were computed by
  `autoFitGridBox` passes the importer's spread rule.
- `specializeGridElement` — the f16 output enables f16 exactly once, before any
  declaration, and rewrites the alias; the f32 output is byte-identical to input.
- Comparator statistics on constructed cubes: TV distance 0 for identical inputs, 1
  for disjoint supports, and a hand-computed value for a two-bin case; marginals of
  a cube with one hot plane.
- P3's f16-`.npy` acceptance (§3).

**GPU probe:** `npm run mcpm-workbench:probe` — the only automated gate that
reaches the kernels. Fails on any WebGPU validation error, device loss, or shader
compile diagnostic.

**Deferred to Phase 4 — energy smoke:** a probe step running N iterations on a tiny
synthetic catalog and asserting `meanLogTraceAtPoints` lands in a band. Racy
deposits make the result nondeterministic, so it can only ever be a band, and the
band is unknown until Phase 3 measures the noise floor.

**Deliberately not tested:** kernel numerics (validated statistically against the
VAC trace — stronger than any mock), `packLogTraceVoxels` / `encodeScalarField`
(already covered by their own suites; the in-browser SCFD path adds no logic), the
`McpmParams` preset values (a constant restatement), and anything visual.

## 13. Phases

Each phase ends where the next can start without rework. Phase 1 is a walking
skeleton: it fits, it draws, it is tunable — everything after adds legs.

### Phase 1 — walking core

Device + specialised buffers + propagate/decay + catalog seed + raymarch + the
sliders that change the picture.

**Exit criteria**

- `npm run mcpm-workbench` serves on 5500; SDSS + 2MRS + GLADE v9 tiers load and
  the HUD shows point count, NaN-fill count and fraction, resolved `GridElement`,
  and the summed byte budget.
- Grid auto-fits from the catalog bbox; the manual override changes the box; an
  over-budget configuration is refused by name rather than crashing the tab.
- A ≥300-class grid runs continuously; the trace visibly sharpens into filaments
  over a few hundred steps, and sense distance / turn angle / persistence /
  sharpness each change the image in the expected direction.
- Pause, resume, reset, and trace-only clear behave; the agent-count control steps
  in 100k units.
- `npm run mcpm-workbench:probe` exits 0.
- Vitest: auto-fit, world↔grid, weights.

### Phase 2 — export legs

**Exit criteria**

- The `.npy` + sidecar pair downloads, and
  `npx tsx tools/volumes/buildRhizomeVolume.ts <file>.npy --out /tmp/x.scfd`
  succeeds on it untouched apart from P3.
- The in-browser `.scfd` decodes with `decodeScalarField` and agrees with the
  importer's output from the same run within f16 rounding.
- The preview-export view renders the packed cube and matches the live raymarch in
  structure.
- Vitest: writer round trip, sidecar round trip, P3 acceptance.

### Phase 3 — validation

**Exit criteria**

- The dev-only packed loader ingests the fork's VAC catalog (324,901 points) and
  runs with the parameters transcribed from `export_metadata.txt`.
- A 712×1200×728 run completes on the maintainer machine and exports.
- `npm run mcpm-workbench:compare` against `data/raw/mcpm/trace.bin` reports TV
  distances and marginal deviations; two independent workbench runs of the same
  configuration establish the noise floor, and the accepted band is recorded in
  `tools/mcpm-workbench/README.md` with both numbers.
- Any band the workbench-vs-fork comparison misses by more than the noise floor is
  either explained or logged as an open item before Phase 4 starts.

### Phase 4 — quirk strip and energy smoke

**Exit criteria**

- Each quirk override is flipped off individually and the comparator's statistics
  stay inside the Phase 3 band; the flags whose removal is clean are deleted, and
  any flag whose removal shifts the statistics keeps its default with the measured
  delta recorded beside it.
- The probe grows the energy smoke test with the band Phase 3 measured.
- Racy float deposits remain. They are not a quirk.

### Track V — views (parallel, any time after Phase 1)

Agent splat, volumetric path tracer, parameter save/load. Independent of the export
and validation legs; they share only the grid buffers.

**Exit criteria:** splat mode shows the swarm with data points visibly dominant;
the path tracer accumulates and resets correctly on camera and parameter changes;
a saved parameter JSON reloads to a visually identical run.

## 14. Risks and deferred

- **The 1200-class grid may not fit any browser.** 3.7 GB of f16 grids plus 240 MB
  of agents is plausible on Apple Silicon with raised limits and unproven anywhere
  else. The preflight makes the failure legible rather than a crash, and the box is
  customizable, so the fallback is a smaller long axis — but the Q4 goal itself is
  the risk, and Phase 1's exit criteria deliberately only demand a 300-class grid.
- **Linear-layout cache locality.** Storage buffers lose the swizzled layout a 3D
  texture gets, and both the 27-tap diffusion and the raymarch touch Z-neighbours.
  If measured slow, Z-order or tiled indexing is confined to `grid.wesl`. Not
  pre-optimised; `npm run perf` does not cover this tool, so any claim here needs
  its own measurement.
- **Quirk strip may find a quirk that matters.** Phase 4 is written to accept that
  outcome (keep the flag, record the delta) rather than to force the strip.
- **Comparator bands are unknown until measured.** Stated as a risk because the
  temptation at Phase 3 will be to pick a band that passes.
- **Deferred:** in-app MCPM layer (the shader family is positioned for it, nothing
  more); overdensity and highlight view modes; agent sort; `--shell` style tiering
  of workbench exports; promoting `Slider`/`Toggle` to `src/components/common/`;
  the f16 helper consolidation from §3's adjacent finding.

## 15. Decisions this spec made

The grill session settled Q1–Q13; these were open and are decided above, listed so
review can overturn them cheaply.

| # | Decision | Where |
|---|----------|-------|
| 1 | P1's semantics: unsupported features are dropped and limits clamped, not thrown — the caller reads `device.features`/`device.limits` for truth. | §3 P1, §5 |
| 2 | The box absorbs multiple-of-8 rounding so voxels stay exactly cubic; the manual override takes a long-axis resolution, not free dims. | §6 |
| 3 | f16/f32 "one code path" is a one-line textual specialisation of the linked WGSL, not `?link` conditional compilation. | §5 |
| 4 | The whole `mcpm/` family (view shaders included, not only the kernels) lands in `src/services/gpu/shaders/`; the tool keeps one local blit. | §4 |
| 5 | `.npy` writer lives at `tools/parsers/npyWriter.ts`, mirroring `npyReader.ts`, rather than under `tools/utils/`. | §4, §8 |
| 6 | The palette is the existing `buildPaletteLut`, RGB only; alpha stays Polyphorm's `opticalThickness · r`. No bundled `.tga`. | §7 |
| 7 | Comparator metric is total-variation distance plus per-axis marginal deviation; the scalar convergence signal is `meanLogTraceAtPoints`, defined here (the fork's kernel only bins). Acceptance bands are a Phase 3 output, not a spec constant. | §9 |
| 8 | Weight derivation clamps `W ≥ 0` before `log10(1 + W)`. | §6 |
| 9 | Agent count steps in 100k units so the dispatch truncation quirk is unobservable. | §5 |
| 10 | Sidecar provenance carries no git commit (unavailable in-browser); export filenames share one generated stem so the pair cannot drift apart. | §8 |
