# CF-4 Dark-Matter Density Volume Render — Design

**Status:** Draft (2026-05-07)
**Owner:** @rulkens
**First consumer:** A toggleable "Dark Matter (CF-4)" overlay on the Skymap renderer that visualizes the local-universe DM density field as a translucent 3D volume.

## Goal

Add an optional rendering layer that visualizes the **Cosmicflows-4 reconstructed dark-matter density field** (Valade et al. 2024, "HAMLET" 256³ HMC reconstruction) as a translucent 3D volume around the observer. With the layer on, named cosmic-web structures — Laniakea, the Local Void, the Great Attractor, Perseus-Pisces, Coma, Shapley — become visible as glowing blobs and dark cavities sitting underneath / around the existing galaxy point cloud. With the layer off, Skymap looks exactly as it does today.

This is the first time the renderer tackles a **continuous 3D scalar field** rather than discrete points or lines. The pipeline established here is intended to be reusable for later DM-related layers (BORG-SDSS, future CF-4++ ensembles).

**Non-goals (this spec):**
- CF-4 velocity field streamlines or basins-of-attraction colouring (covered by the existing `2026-05-05-cf4-*` plan series).
- Ensemble uncertainty rendering (CF-4++ mean+std). The 256³ HAMLET cube is a single MAP-like field; uncertainty visualization is deferred to a future plan.
- BORG-SDSS or BORG-2M++ density fields. Those use a similar primitive but per-paper download packaging is messier and warrants a separate plan once this primitive is proven.
- eROSITA cluster billboards. Different rendering primitive (point cloud), separate plan.
- A transfer-function curve editor in the UI. v1 hard-codes a `log(1+δ)` perceptual ramp with a single intensity slider.
- Picking on the volume. The DM field is decorative; clicks pass through to galaxies behind.

## Why CF-4 (and the 256³ HAMLET cube specifically)

Cosmicflows-4 is the leading observational reconstruction of the local-universe DM density field, derived from ~56k galaxy peculiar velocities. The field is **smooth on ~5 h⁻¹ Mpc scales** (set by the velocity-survey resolution), so volume-rendering it produces the canonical "cosmography" aesthetic familiar from Pomarède & Tully's published work.

Three CF-4 density cubes are publicly available:

| Release | Resolution | Voxel size | Box size | Format | f16 size |
|---|---|---|---|---|---|
| Courtois et al. 2023 | 64³ | 8 h⁻¹ Mpc | ~480 h⁻¹ Mpc | FITS | ~0.5 MB |
| Valade et al. 2024 (HAMLET) | 256³ | 3.9 h⁻¹ Mpc | 1000 h⁻¹ Mpc | IDL `.sav` | ~32 MB |
| CF-4++ Courtois et al. 2025 | 256³ | similar | similar | `.npz` ensemble | ~64 MB (mean+std) |

We pick **Valade 2024 256³**. Rationale: voxel size matches CF-4's intrinsic information-content smoothing (~5 h⁻¹ Mpc), so the cube is "honestly" full-resolution rather than upsampled. 32 MB f16 is comfortably inside Skymap's GPU budget. The IDL `.sav` format requires a one-shot Python preprocessing step, but that cost is paid once and matches the precedent set by the existing CF-4 streamline plans (which also accept Python preprocessing for laniakea CSV ingestion).

The voxel value is **linear over-density δ = (ρ − ρ̄) / ρ̄**, range roughly `[-1, +30]` (voids near −1, cluster cores ~+30). Not log-encoded in the source file; the log mapping happens in the shader.

## Architecture overview

Three phases, mirroring the existing `tools/buildAllBins.ts` → `cloudLoader` → renderer pipeline and the precedent set by `2026-05-04-disperse-filament-skeleton.md`:

```
data/raw/cf4/
   CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav    (gitignored, ~64 MB upstream IDL .sav)
   README.md  — download URL, paper citation, license, expected MD5
        │
        │  tools/cf4DensityIngest.py  (one-shot, scipy.io.readsav → flat .npy)
        │  not run on every build; only when source changes
        ▼
   data/raw/cf4/cf4_density_256.npy  (gitignored, ~64 MB f32)
        │
        │  tools/buildCf4Density.ts   (npm run build-cf4-density)
        │  reads .npy, computes stats, casts f32 → f16, prepends header
        ▼
   public/data/cf4_density.bin       (~32 MB, gitignored, R2-hosted alongside .bin catalogs)
        │
        │  runtime fetch via dataUrl()
        ▼
   src/services/engine/cf4DensityLoader.ts  →  Cf4DensityField | null
        │
        ▼
   src/services/gpu/cf4DensityRenderer.ts
   src/services/gpu/shaders/cf4Density.wgsl
        │
        ▼
   engine.ts wires it as a new pre-pass; SettingsPanel toggle + intensity slider
```

## Build pipeline

### Python preprocessor: `tools/cf4DensityIngest.py`

Single-purpose, one-shot. Invoked manually (`python tools/cf4DensityIngest.py`) when the upstream `.sav` changes — which is essentially never, since CF-4 releases are published catalogues, not streaming feeds. Reads the `.sav` via `scipy.io.readsav`, extracts the density-field array, validates shape `(256, 256, 256)` and dtype `float32`, and writes `data/raw/cf4/cf4_density_256.npy`.

**Pre-implementation step (Plan 01 first task):** the variable name inside the `.sav` is not documented in Valade 2024's text. Implementer downloads the `.sav` once and runs `python -c "import scipy.io; print(list(scipy.io.readsav('CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav').keys()))"` to discover the actual key names; the discovered name is hard-coded into the ingest script. Plausible candidates (based on convention in the CF-4 ecosystem): `delta`, `density`, `rho_over_rho_bar`. The discovery output is recorded in `data/raw/cf4/README.md` for future maintainers.

The script also writes a sibling `data/raw/cf4/cf4_density_256.meta.json` with cosmology parameters from the paper (`h = 0.746`, `box_size_h_mpc = 1000`, `voxel_size_h_mpc = 3.90625`, `field_type = "delta"`, `coord_frame = "supergalactic_cartesian"`). This metadata is read by `buildCf4Density.ts` so the cosmology constants don't have to be hard-coded across two languages.

Python is acceptable here because the laniakea CSV ingestion in the existing CF-4 streamline plans already requires a Python step. Contributors who want to rebuild from scratch need Python + scipy; contributors who only want the runtime artifacts pull `cf4_density.bin` from R2.

### TS build script: `tools/buildCf4Density.ts`

Invoked via `npm run build-cf4-density`. Mirrors the conventions of `tools/buildAllBins.ts` and `tools/buildFilaments.ts`: idempotent, prints what it generated, exits non-zero on missing inputs.

Steps:

1. Read `data/raw/cf4/cf4_density_256.npy` and `cf4_density_256.meta.json`. The `.npy` parser is small (NumPy's format spec is well-documented); we write a minimal in-tool parser rather than adding a runtime dep, matching the project's "no new deps for tiny tasks" pattern.
2. Compute `min(δ)`, `max(δ)`, `mean(δ)` over the cube — embedded in the binary header for diagnostic logging at runtime.
3. Convert `f32 → f16` voxel-by-voxel. f16 has plenty of dynamic range for δ in `[-1, 30]` (f16 max is 65504, precision is ~3 decimal digits — fine).
4. Prepend a fixed 64-byte header (see binary format below).
5. Write `public/data/cf4_density.bin` (~32 MB).

The output is **not committed to git** — same pattern as the catalog `.bin` files. It's gitignored and synced to R2 by `npm run sync-r2` once added to the ALLOW filter in `tools/syncR2.ts`.

### Binary format: `src/data/cf4DensityFormat.ts`

Header (64 bytes, little-endian):

```
offset  size  field            meaning
0       4     magic            ASCII "CF4D"
4       4     version          u32, currently 1
8       4     nx               u32, voxel count along X (256)
12      4     ny               u32, voxel count along Y (256)
16      4     nz               u32, voxel count along Z (256)
20      4     voxel_size_mpc   f32, post-h-rescale (≈ 3.90625 / 0.746 ≈ 5.236 Mpc)
24      4     box_origin_mpc_x f32, lower-corner of cube in observer-Mpc supergalactic (≈ -2.5 × box / 2)
28      4     box_origin_mpc_y f32
32      4     box_origin_mpc_z f32
36      4     observer_voxel_x f32, observer position in voxel coords (typically 128.0)
40      4     observer_voxel_y f32
44      4     observer_voxel_z f32
48      4     min_delta        f32, statistical min over cube (diagnostic)
52      4     max_delta        f32, statistical max over cube
56      4     mean_delta       f32, should be ≈ 0 for a properly normalised δ field
60      4     reserved         u32, must be 0
```

Body: `nx × ny × nz × 2 bytes` of voxel data, f16, X-major (X varies fastest, then Y, then Z — matches NumPy's default C-order when the array is `(nz, ny, nx)`; we transpose during the build step so on-disk order matches GPU 3D-texture expectation).

`encode(field) → ArrayBuffer` and `decode(buffer) → Cf4DensityField` mirror the existing `pointCloudFormat.ts` and `filamentBinaryFormat.ts` shapes:

```ts
export type Cf4DensityField = {
  nx: number; ny: number; nz: number;
  voxelSizeMpc: number;
  boxOriginMpc: [number, number, number];   // observer-Mpc supergalactic
  observerVoxel: [number, number, number];
  minDelta: number; maxDelta: number; meanDelta: number;
  voxels: Uint16Array;    // raw f16 bits, length = nx*ny*nz, interpreted by GPU sampler
};
```

Version mismatches throw with a clear regenerate message (`"cf4_density.bin version N expected, got M — run npm run build-cf4-density"`), matching the point-cloud format pattern.

## Runtime: loading

### `src/services/engine/cf4DensityLoader.ts`

```ts
export async function loadCf4Density(): Promise<Cf4DensityField | null>;
```

Mirrors `loadFilaments()` exactly. Fetches `dataUrl('cf4_density.bin')`. On 404 or network error, returns `null` (asset is optional). On success, decodes via `cf4DensityFormat.decode` and returns the field. Logs to console at info level.

The engine treats a `null` return as "DM layer disabled" — same pattern as filaments. The toggle UI greys out with "(asset not available)" rather than throwing.

## Runtime: GPU subsystem

### `src/services/gpu/cf4DensityRenderer.ts`

Owns:

- A `texture_3d<f16>` (256³, ~32 MB GPU memory) populated once at construction from the decoded `Uint16Array`. WebGPU's `r16float` format accepts the f16 raw bits directly — no per-voxel conversion at upload time.
- A linear-filtered, clamp-to-edge sampler.
- A small uniform buffer (`Cf4DensityUniforms`) holding:
  - `inv_view_proj` (4×4) — for reconstructing world rays from screen pixels.
  - `model_to_cf4` (4×4) — Skymap world Mpc → CF-4 supergalactic voxel coords. Static, computed once at startup.
  - `camera_pos_world` (vec3) — Mpc, observer frame.
  - `box_min_world`, `box_max_world` (vec3 each) — AABB bounds in Skymap world space, used for fast ray-box intersection.
  - `intensity` (f32) — driven by the UI slider, multiplies the final emission.
  - `delta_log_min`, `delta_log_max` (f32) — input range for the transfer function (default `log(1 + (-0.5)) ≈ -0.69`, `log(1 + 30) ≈ 3.43`).
  - `step_count` (u32) — ray-march sample count, default 128.
- A pipeline drawing a fullscreen triangle (vertex shader emits NDC corners directly; no vertex buffer needed).

Public API:

```ts
export type Cf4DensityRenderer = {
  render(pass: GPURenderPassEncoder, viewProj: Float32Array, cameraPos: [number, number, number], intensity: number): void;
  destroy(): void;
};
```

`viewProj` and `cameraPos` are passed per-frame; `intensity` is sourced from settings; `model_to_cf4` is computed once at construction from the field's `boxOriginMpc` and `observerVoxel`.

### Ray-march shader: `src/services/gpu/shaders/cf4Density.wgsl`

Fragment shader pseudocode:

```wgsl
// Reconstruct world-space ray from screen-space NDC.
let ndc = vec4(in.uv * 2.0 - 1.0, 0.0, 1.0);
let world = uniforms.inv_view_proj * ndc;
let ray_origin = uniforms.camera_pos_world;
let ray_dir = normalize(world.xyz / world.w - ray_origin);

// Ray-AABB intersection in world space.
let t_range = intersect_aabb(ray_origin, ray_dir, uniforms.box_min_world, uniforms.box_max_world);
if (t_range.y <= t_range.x) { discard; }   // ray misses cube

let t_start = max(t_range.x, 0.0);          // start at camera if camera is inside cube
let t_end   = t_range.y;
let dt      = (t_end - t_start) / f32(uniforms.step_count);

var color = vec3(0.0);
var transmittance = 1.0;

for (var i = 0u; i < uniforms.step_count; i = i + 1u) {
    let t  = t_start + dt * f32(i);
    let p_world = ray_origin + ray_dir * t;

    // World → CF-4 voxel coords.
    let p_cf4 = (uniforms.model_to_cf4 * vec4(p_world, 1.0)).xyz;

    // Half-box-sphere clip: CF-4 reconstructions are noise beyond half-box from observer.
    let r_from_observer = length(p_cf4 - uniforms.observer_voxel);
    let half_box = 128.0;        // 256/2 in voxels
    if (r_from_observer > half_box) { continue; }

    // Sample the field. textureLoad uses voxel coords; textureSampleLevel uses normalized coords.
    let uv3 = p_cf4 / vec3(256.0);
    let delta = textureSampleLevel(field, samp, uv3, 0.0).r;

    // Transfer function: log(1+δ) → emission color.
    let log_d = log(max(1.0 + delta, 1e-6));
    let t_param = clamp(
        (log_d - uniforms.delta_log_min) / (uniforms.delta_log_max - uniforms.delta_log_min),
        0.0, 1.0
    );

    // Perceptual ramp: voids cool blue, mean transparent black, overdensities warm white.
    let emission = transfer_color(t_param);          // small inline LUT
    let opacity  = transfer_opacity(t_param) * uniforms.intensity * dt / 5.0;   // dt-scaled

    // Front-to-back compositing.
    color += transmittance * emission * opacity;
    transmittance *= 1.0 - opacity;
    if (transmittance < 0.01) { break; }              // early-out
}

return vec4(color, 1.0 - transmittance);
```

Notes:

- The opacity is scaled by `dt / 5.0` (the divisor is the reference Mpc step at which one unit of opacity per step would saturate after ~5 Mpc) so that changing `step_count` does not change the apparent density of the field. Standard volume-rendering opacity-correction pattern.
- `transfer_color` is a small inline gradient (3-4 stops) lerped per fragment. No texture needed — keeps the shader self-contained.
- Voids (`δ < 0` → `log(1+δ) < 0`) get mapped to a faint cool-blue tint with low opacity, not a hot color. This is the "negative space" visual.
- `discard` on missed AABB means most off-screen pixels do almost no work.

### Composition with the rest of the scene

**Render order, post-this-change:**

```
clear HDR target
   ↓
[NEW] cf4DensityRenderer.render()  — additive into HDR; fullscreen pass; no depth read/write
   ↓
pointRenderer (galaxies)
quadRenderer (thumbnails)
filamentRenderer
milkyWayRenderer
labelRenderer / markerLineRenderer (if landed)
pickRenderer
   ↓
toneMapPass → canvas
```

**Composition decision: pure additive emission, no depth interaction.** Galaxies and filaments draw on top of the volume because they're emitted later. The volume's own internal occlusion is handled by front-to-back compositing inside the ray march. This sidesteps the harder problem of interleaving translucent volume samples with opaque-ish point billboards on a per-fragment basis.

A consequence is that bright cluster cores in CF-4 (where δ is high) won't *occlude* galaxies sitting in front of them in 3D — galaxies always win pixel-for-pixel. This is fine and probably desirable: the volume is a contextual fog, not a hard surface.

If this turns out to look wrong (e.g., the cube's far face shines through galaxies it should hide), the alternative is to read the depth buffer in the fragment shader and clip rays at the recorded depth. That's a one-shader change, deferred unless needed.

## Coordinate transforms

CF-4 uses **supergalactic Cartesian Mpc/h, observer at cube center**. Skymap uses **observer-centered Cartesian Mpc, equatorial-aligned (RA/Dec/cz-derived)**. The transform from Skymap world to CF-4 voxel is:

```
p_cf4_voxel = (R_sg_to_eq^T * p_world_mpc) * h / voxel_size_h_mpc + observer_voxel
```

Where:

- `R_sg_to_eq` is the standard 3×3 rotation taking supergalactic Cartesian to equatorial Cartesian. Built from the convention SGX-axis points to (l, b) = (137.37°, 0°), SGZ-axis points to (l, b) = (47.37°, +6.32°). Composed of three Euler rotations; numerical values are well-documented in de Vaucouleurs 1991 / NED.
- `h = 0.746` (CF-4 catalog value).
- `voxel_size_h_mpc = 3.90625` (1000 / 256).
- `observer_voxel = (128, 128, 128)` (cube center).

The full 4×4 `model_to_cf4` matrix is computed once at `Cf4DensityRenderer` construction time, baking in all of these constants. It is a pure rigid-plus-uniform-scale transform, so the shader can do a single matrix-vector multiply per ray sample.

A small unit test (`tests/data/cf4Coords.test.ts`) anchors the transform against known supergalactic positions:

- Virgo cluster at SGX ≈ −2.5, SGY ≈ +10.0, SGZ ≈ −1.0 (Mpc/h) → equatorial (RA ≈ 187°, Dec ≈ +12°), distance ≈ 16.5 Mpc.
- Coma cluster at SGX ≈ +0.6, SGY ≈ +71.5, SGZ ≈ +12 → equatorial (RA ≈ 195°, Dec ≈ +27°), distance ≈ 100 Mpc.
- Origin (0, 0, 0) maps to observer voxel (128, 128, 128).

These are the same anchors the existing `2026-05-05-cf4-01-build-pipeline.md` plan uses for streamline-coordinate validation, so the transform code can in fact be **shared between the two plans** — both want SG → equatorial. We extract the transform helper into `src/data/superGalacticTransform.ts` so both this plan and the streamline plan can consume it. (If the streamline plan lands first, this plan inherits the helper; if this plan lands first, it provides the helper.)

## UI

- **SettingsPanel** gets a new "Dark Matter (CF-4)" section with:
  - On/off toggle (`cf4DensityEnabled`, default off — opt-in until the visual is dialed in).
  - Intensity slider (`cf4DensityIntensity`, range 0.0–2.0, default 1.0).
- **CommandPalette**: "Toggle CF-4 dark matter".
- **State persistence**: same `useEngineSettings` hook the filament toggle uses. Stored in `localStorage` with the other settings.
- **Default off** — the layer is off by first-load. A user discovers it via the toggle. We can flip the default to `true` in a follow-up once we're happy with how it looks.

## File layout

**New files:**

```
data/raw/cf4/README.md                                    (download instructions, citation, license)
tools/cf4DensityIngest.py                                 (one-shot .sav → .npy)
tools/buildCf4Density.ts                                  (.npy → .bin)
src/data/cf4DensityFormat.ts                              (encode/decode + types)
src/data/superGalacticTransform.ts                        (SG → equatorial helper, SHARED with streamline plan)
src/services/engine/cf4DensityLoader.ts                   (loadCf4Density)
src/services/gpu/cf4DensityRenderer.ts                    (renderer class)
src/services/gpu/shaders/cf4Density.wgsl                  (ray-march shader)
src/@types/Cf4DensityField.d.ts                           (runtime type)
tests/data/cf4DensityFormat.test.ts                       (encode/decode round-trip)
tests/data/superGalacticTransform.test.ts                 (anchored positions)
tests/services/engine/cf4DensityLoader.test.ts            (mocked-fetch happy + null path)
tests/services/gpu/cf4DensityRenderer.test.ts             (init with synthetic 8³ field)
```

**Modified files:**

```
src/services/engine/engine.ts            (load + construct + render-pass wiring)
src/components/SettingsPanel.tsx         (toggle + slider)
src/hooks/useEngineSettings.ts           (cf4DensityEnabled, cf4DensityIntensity)
src/data/defaults.ts                     (DEFAULT_CF4_DENSITY_ENABLED, _INTENSITY)
src/components/CommandPalette.tsx        (new entry)
tools/syncR2.ts                          (add cf4_density.bin to ALLOW filter)
package.json                             (build-cf4-density script)
.gitignore                               (data/raw/cf4/*.sav, *.npy)
```

## Testing strategy

WebGPU isn't headless-mockable in vitest, so the same split as the rest of `services/gpu/` applies:

- **Pure logic, fully unit-tested:**
  - `cf4DensityFormat` encode/decode round-trip with synthetic 8³ field.
  - Header version-mismatch error.
  - `superGalacticTransform`: anchored positions (Virgo, Coma, observer, cube extrema).
  - `.npy` parser inside `buildCf4Density.ts` against a NumPy-saved fixture.
- **Loader tests:** `cf4DensityLoader.test.ts` against mocked `fetch`: happy path returns a populated `Cf4DensityField`, 404 returns `null`, malformed header throws with regenerate message.
- **Renderer construction:** `cf4DensityRenderer.test.ts` against the project's existing test WebGPU device wrapper: instantiate with synthetic 8³ field, assert no throws, assert uniform buffer sizes.
- **Visual verification (manual):** Per CLAUDE.md "dev server stays running" convention. Once the layer renders, the user inspects:
  - Laniakea blob centered roughly toward (RA, Dec) ≈ (160°, −60°), distance ~80 Mpc.
  - Local Void as a transparent / cool-tinted gap toward (l, b) ≈ (60°, +20°).
  - Great Attractor in the Hydra-Centaurus direction at ~50 Mpc.
  - Volume fades out (transmittance → 1) beyond ~half the box, no hard cube edge visible.
  - Toggle off: scene identical to current `main`. Toggle on: smooth crossfade.

## Sub-plan decomposition

Two independently shippable sub-plans, modeled on the existing `2026-05-05-cf4-*` series stop-anywhere convention:

### Plan 01 — Build pipeline

**Ships:** `tools/cf4DensityIngest.py`, `tools/buildCf4Density.ts`, `cf4DensityFormat.ts`, `superGalacticTransform.ts`, all corresponding tests, R2 sync entry. After this plan: `cf4_density.bin` exists locally and on R2; round-trips through encode/decode in tests; nothing visual.

**Estimated tasks:** ~25.

**Stop-anywhere demo:** Run `npm run build-cf4-density`, observe a 32 MB binary in `public/data/`, run the round-trip test, see green.

### Plan 02 — Renderer + UI integration

**Ships:** `cf4DensityLoader`, `cf4DensityRenderer`, `cf4Density.wgsl`, engine wiring, SettingsPanel toggle + slider, CommandPalette entry, `useEngineSettings` hook update, defaults, gitignore additions, visual verification checklist.

**Estimated tasks:** ~30.

**Stop-anywhere demo:** Toggle "Dark Matter (CF-4)" in the settings panel. See Laniakea light up around the existing GLADE galaxies. Toggle off — scene returns to current Skymap. Slide the intensity from 0 to 2 — volume fades from invisible to dominant.

### Dependency graph

```
01 build-pipeline
       │
       ▼
02 renderer + UI
```

Plan 01 has no external prereqs (the upstream `.sav` is a one-time manual download). Plan 02 requires `cf4_density.bin` to exist (so 01 must land first).

## Open questions / future work

- **Higher-resolution upgrade.** If 256³ ends up looking under-resolved, the same pipeline accepts a 512³ cube with only a build-script tweak. (No 512³ CF-4 release exists today.)
- **Ensemble uncertainty (CF-4++).** A second 3D texture for the std-dev field could modulate opacity ("certain regions render solid, uncertain regions render hazy"). Future plan.
- **BORG-SDSS.** Same primitive, different cube. Once this plan lands, BORG is a different `Cf4DensityField` (with renamed type) read from a different `.bin`.
- **Combined with streamlines.** Layering this with the planned `2026-05-05-cf4-03-streamline-renderer` produces a complete cosmography overlay (density + flow). Both layers are independently toggleable; they share `superGalacticTransform.ts`.
- **Depth-aware compositing.** If purely-additive blending looks wrong, swap to depth-aware ray clipping. One-shader change.
- **Transfer-function presets.** A small dropdown of pre-baked transfer functions ("voids only", "filaments", "clusters") could make exploration easier without exposing a curve editor. Defer until users complain.
- **Picking on the volume.** Click-to-locate the nearest named structure ("you clicked: this is the Great Attractor at ~50 Mpc"). Requires a reverse lookup from world-position to a named-structure registry; doable as a follow-up.
