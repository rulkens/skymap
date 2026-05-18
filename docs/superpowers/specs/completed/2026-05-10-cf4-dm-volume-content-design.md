# CF-4 Dark-Matter Density Volume — Content + Ingest

**Status:** Draft (2026-05-10, retargeted 2026-05-11)
**Owner:** @rulkens
**Supersedes:** [`2026-05-07-cf4-dark-matter-volume-render-design.md`](./archive/2026-05-07-cf4-dark-matter-volume-render-design.md)
**First consumer:** A "CF-4 dark matter" entry in the existing Volumes panel that visualizes the local-universe DM density field as a translucent 3D volume.

## 2026-05-11 retarget — Courtois 2025 CF4++ 128³

While shopping for the Valade 2024 HAMLET 256³ `.sav` referenced below, we discovered that file is **not publicly distributed**.  The closest public dataset is the Courtois 2025 **CF4++** ensemble (`CF4pp_mean_std_grids.npz`, ~167 MB, hosted at <https://projets.ip2i.in2p3.fr/cosmicflows/>), which ships the mean and standard deviation across 10 000 HMC posterior steps at 128³ over a 1000 Mpc box in supergalactic Cartesian.  We consume only the `d_mean_CF4pp` mean-density array; the std cube is the natural input for a future uncertainty overlay.

Concrete changes from the original spec (everything below this section was written against the 256³ HAMLET assumption — read the rest with these in mind):

| Original | Retarget |
|---|---|
| 256³ at 5.236 Mpc/h voxels | 128³ at 7.81 Mpc voxels |
| Coordinates in Mpc/h (h = 0.746 rescale) | Coordinates in physical Mpc (no h-rescale; CF4++ ships in Mpc) |
| `tools/cf4DensityIngest.py` (Python + scipy) | `unzip -j CF4pp_mean_std_grids.npz d_mean_CF4pp.npy` |
| `.npy` + `.meta.json` (sidecar with cosmology) | `.npy` alone (cosmology constants baked into `buildCf4Density.ts`) |
| `cf4_density_256.npy` + `cf4_density_256.meta.json` on R2 (EXTRA_FILES) | `d_mean_CF4pp.npy` on R2 (EXTRA_FILES) |
| `~32 MB cf4_density.scfd` runtime payload | `~4 MB cf4_density.scfd` runtime payload |

The architectural design is unchanged: SCFD format, scalar-volume renderer, `cf4DensityFetcher`, eager slot wiring in `wireSlots.ts`.  Only the ingest+build path is simpler.

A separate maintainer task is in flight to request the actual 256³ HAMLET cube from Hélène Courtois (IP2I Lyon).  If we receive it, the runtime swap is a one-line change to `tools/buildCf4Density.ts`'s constants — the renderer is dims-agnostic.

---

## Goal

Add the **Cosmicflows-4 reconstructed dark-matter density field** (Valade et al. 2024 "HAMLET" 256³) as a new volume in Skymap's existing scalar-volume infrastructure. With the field enabled, named cosmic-web structures — Laniakea, the Local Void, the Great Attractor, Perseus-Pisces, Coma, Shapley — become visible as glowing blobs and dark cavities sitting underneath the existing galaxy point cloud. With the field disabled (default), Skymap looks exactly as it does today.

## Why this spec exists (and supersedes the 2026-05-07 one)

The original 2026-05-07 spec assumed Skymap had no volume-rendering primitive. It scoped a bespoke `cf4DensityFormat`, `cf4DensityRenderer`, `cf4Density.wgsl`, settings UI, and CommandPalette wiring — ~50 tasks across two sub-plans.

Between then and now, [`2026-05-09-scalar-volume-renderer-design.md`](./2026-05-09-scalar-volume-renderer-design.md) landed. It ships a generic, multi-field, palette-driven scalar-volume primitive:

- `SCFD` self-describing binary format (`src/data/scalarFieldFormat.ts`) with palette + frame metadata baked into the 96-byte header
- `scalarVolumeRenderer` with `addField/removeField/setEnabled/setIntensity/setFieldPalette` — additive, multi-field, layout-`auto`-safe
- WESL ray-march shader (`src/services/gpu/shaders/scalarVolume/{vertex,fragment}.wesl`) with proper AABB entry/exit and inside-the-cube handling
- `scalarVolumePass` engine wiring + `volumeFields` settings state + `VolumeFieldRow` / `PaletteSelect` UI
- An end-to-end working example via `syntheticVolumeFetcher` and the `wireSlots.ts` slot pattern

So the CF-4 DM volume is no longer a renderer task — it is a **content + ingest task**. The new scope: convert one IDL `.sav` file into one `.scfd` file, host on R2, register one slot. ~10–15 tasks instead of ~50.

**Non-goals (this spec):**

- Anything covered by the scalar-volume-renderer spec (format, renderer, shader, UI, settings state). All of that is shipped.
- CF-4 velocity-field streamlines or basins-of-attraction colouring (covered by the unrelated `2026-05-05-cf4-{01..04}` plan series; SG→equatorial transform is the only shared piece).
- Ensemble uncertainty (CF-4++ mean+std). Single MAP-like field for v1.
- BORG-SDSS or BORG-2M++ density fields. Same primitive, different content; defer until this proves out.
- Lazy / on-demand loading. Eager-at-boot for v1, mirroring the syntheticVolume slot pattern. Bandwidth optimisation deferred.
- Picking on the volume.
- Transfer-function curve editor. Palette + intensity slider already covers the v1 controls.

## Architecture

```
data/raw/cf4/
   CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav   (gitignored, ~64 MB; maintainer-only)
   cf4_density_256.npy                               (gitignored, on R2 EXTRA_FILES)
   cf4_density_256.meta.json                         (gitignored, on R2 EXTRA_FILES)
        │
        │  tools/cf4DensityIngest.py   (one-shot maintainer-only: .sav → .npy + meta)
        ▼
   tools/buildCf4Density.ts            (pure Node/TS: .npy → .scfd, no Python)
        │
        ▼
   public/data/cf4_density.scfd        (~32 MB, gitignored, on R2 ALLOW)
        │
        │  cf4DensityFetcher (Fetcher<ScalarCube, void>) wired as an
        │  AssetSlot in wireSlots.ts; fires at boot.
        ▼
   state.gpu.scalarVolumeRenderer.addField('cf4-density', cube)
        │
        ▼
   already-existing scalarVolumePass + VolumeFieldRow UI (no changes)
```

**The maintainer path** (Python required, run once per upstream release):

1. Download `CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav` from Valade 2024 release.
2. `python tools/cf4DensityIngest.py` → produces `cf4_density_256.npy` + `cf4_density_256.meta.json`.
3. `npm run sync-r2` uploads both intermediates (EXTRA_FILES).

**The contributor path** (no Python — mirrors the HyperLEDA precedent):

1. `curl` `cf4_density_256.npy` + `.meta.json` from R2 into `data/raw/cf4/`.
2. `npm run build-cf4-density` produces `public/data/cf4_density.scfd`.

**The "I just want to render" path** (no rebuild):

1. `curl` `cf4_density.scfd` directly from R2 into `public/data/`. Or, for production, the runtime fetcher already pulls it from R2 via `dataUrl()`.

## Build pipeline

### Python preprocessor: `tools/cf4DensityIngest.py`

One-shot, maintainer-only. Reads the `.sav` via `scipy.io.readsav`, extracts the density-field array, validates shape `(256, 256, 256)` and dtype `float32`, writes:

- `data/raw/cf4/cf4_density_256.npy` — flat f32 cube, NumPy v1.0 format
- `data/raw/cf4/cf4_density_256.meta.json` — cosmology + provenance:
  ```json
  {
    "h": 0.746,
    "box_size_h_mpc": 1000,
    "voxel_size_h_mpc": 3.90625,
    "field_type": "delta",
    "coord_frame": "supergalactic_cartesian",
    "source": "Valade et al. 2024 (HAMLET) CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav",
    "sav_variable_name": "<filled in by maintainer after probe>"
  }
  ```

The `.sav` variable name is undocumented in Valade 2024. **Pre-implementation step:** the maintainer downloads the `.sav` once and runs

```
python -c "import scipy.io; print(list(scipy.io.readsav('CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav').keys()))"
```

to discover the actual key; the discovered name is hard-coded into the ingest script and recorded in `data/raw/cf4/README.md` for future maintainers. Plausible candidates: `delta`, `density`, `rho_over_rho_bar`.

Python is acceptable because (a) it runs once per upstream release, (b) the existing CF-4 streamline plans already require Python, (c) the contributor path bypasses it entirely via R2 curl.

### TS build script: `tools/buildCf4Density.ts`

Invoked via `npm run build-cf4-density`. Idempotent, prints what it generated, exits non-zero on missing inputs. Steps:

1. Read `data/raw/cf4/cf4_density_256.npy` via `tools/parsers/npyReader.ts` (a minimal NumPy v1.0 parser, ~80 LOC; format is well-documented; no new runtime dep).
2. Read `data/raw/cf4/cf4_density_256.meta.json`.
3. Compute `min(δ)`, `max(δ)` over the cube. (Stored in the SCFD `value_min` / `value_max` fields — used by the renderer to normalise into the palette LUT.)
4. Build the SG→equatorial rotation quaternion via `superGalacticTransform`, encoded into the SCFD header's `rotation` field. The cube's data stays in supergalactic-Cartesian (`frame_kind = supergalactic-cartesian`); the rotation tells the renderer how to orient the cube in world space.
5. Compute the cube's `origin` (lower corner in observer-Mpc) and `voxel_size` (post-h-rescale: `3.90625 / 0.746 ≈ 5.236 Mpc`).
6. Pick a default `palette_id`. Choice for v1: a perceptually-uniform sequential palette (the renderer spec already lists candidates; we pick whichever is closest to the Pomarède/Tully reference aesthetic). Per-field palette can be changed at runtime via `setFieldPalette`.
7. Cast f32 → f16 voxel-by-voxel. The SCFD format spec confirms `dtype = 0` (f16) is the only v1 value.
8. Call `scalarFieldFormat.encode(scalarCube)` → `ArrayBuffer`.
9. Write `public/data/cf4_density.scfd` (~32 MB).

Output is **not committed to git** (gitignored, same pattern as catalog `.bin` files). It's synced to R2 by `npm run sync-r2` once added to the ALLOW filter in `tools/syncR2.ts`.

### Why the SCFD format already covers our needs

Inspecting `src/data/scalarFieldFormat.ts`, the SCFD header already carries:

- Cube dims (`Nx, Ny, Nz`) — ours is 256³
- `voxel_size` — ours is ~5.236 Mpc
- `origin` — ours is ~(−667.5, −667.5, −667.5) Mpc (lower corner of the centred cube)
- `rotation` quaternion — ours encodes SG→equatorial
- `frame_kind` — `supergalactic-cartesian` matches our `frame_kind = 0`
- `palette_id` — chosen at build time, runtime-overridable
- `value_min` / `value_max` — used as normalisation range
- `density_scale` — per-cube opacity multiplier

No format extension needed. No `cf4DensityFormat.ts` exists — we use `scalarFieldFormat` directly.

## Coordinate transforms

CF-4 uses **supergalactic Cartesian Mpc/h, observer at cube center (voxel 128, 128, 128)**. Skymap world is **observer-centered Cartesian Mpc, equatorial-aligned**.

The build-time transform from CF-4 voxel to Skymap world is captured by three SCFD header fields:

- `voxel_size` — `3.90625 / 0.746 ≈ 5.236 Mpc` (post-h-rescale to physical Mpc)
- `origin` — places the cube relative to the observer in Skymap world Mpc; exact convention (cube corner vs. centre, applied before or after `rotation`) follows whatever `scalarVolumeRenderer.ts`'s model-matrix construction expects. The build script reads the renderer once to confirm the convention and computes the matching value
- `rotation` — `R_sg_to_eq` as a unit quaternion (x, y, z, w), produced by `superGalacticTransform`

`R_sg_to_eq` is the standard 3×3 rotation taking supergalactic Cartesian to equatorial Cartesian, built from the convention SGX-axis points to (l, b) = (137.37°, 0°), SGZ-axis points to (l, b) = (47.37°, +6.32°). Composed of three Euler rotations; numerical values are well-documented in de Vaucouleurs 1991 / NED.

The runtime renderer applies `rotation`, `origin`, and `voxel_size` via the SCFD header — no Skymap-side cube-aware code needed.

### `src/data/superGalacticTransform.ts`

Pure helper, ~60 LOC. Exports:

```ts
export const SG_TO_EQ_MATRIX: readonly [readonly number[], readonly number[], readonly number[]];
export const SG_TO_EQ_QUATERNION: readonly [number, number, number, number]; // x, y, z, w
export function sgCartesianToEquatorial(sg: [number, number, number]): [number, number, number];
```

Anchored test: Virgo cluster at SGX ≈ −2.5, SGY ≈ +10.0, SGZ ≈ −1.0 (Mpc/h) → equatorial (RA ≈ 187°, Dec ≈ +12°), distance ≈ 16.5 Mpc. Coma at SGX ≈ +0.6, SGY ≈ +71.5, SGZ ≈ +12 → (RA ≈ 195°, Dec ≈ +27°). Origin → origin. Quaternion is unit-norm; matrix is its own inverse-transpose (orthonormal). Tolerance ≈ 1° on RA/Dec.

This helper is also consumed by the (future) `2026-05-05-cf4-*` flow-field plans. If they land first, this plan inherits the helper.

## Runtime: loading

### `src/services/loading/fetchers/cf4DensityFetcher.ts`

```ts
export const cf4DensityFetcher: Fetcher<ScalarCube, void> = async () => {
  const url = dataUrl('cf4_density.scfd');
  const buffer = await fetchWithProgress(url);  // existing helper
  return scalarFieldFormat.decode(buffer);       // existing helper
};
```

Mirrors `syntheticVolumeFetcher`'s shape and `filamentFetcher`'s URL-fetching pattern. No request payload — there is one and only one CF-4 cube.

### Slot wiring in `wireSlots.ts`

Eager-at-boot, mirroring the synthetic-volume pattern:

```ts
state.assetSlots.cf4Density = createAssetSlot({
  name: 'cf4Density',
  fetch: cf4DensityFetcher,
  commit: async (cube) => {
    const renderer = state.gpu.scalarVolumeRenderer;
    if (!renderer) return;
    renderer.addField('cf4-density', cube);
    if (!state.settings.volumeFields['cf4-density']) {
      state.settings.volumeFields['cf4-density'] = {
        enabled: DEFAULT_CF4_DENSITY_ENABLED,        // false
        intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
        paletteId: cube.paletteId,
      };
    }
    const persisted = state.settings.volumeFields['cf4-density'];
    renderer.setIntensity('cf4-density', persisted.intensity);
    renderer.setEnabled('cf4-density', persisted.enabled);
    renderer.setFieldPalette('cf4-density', persisted.paletteId);
    cb.onVolumeFieldsChanged?.();
    state.subsystems.scheduler.requestRender();
  },
});
```

Default OFF so it doesn't surprise users on first load. They discover it in the Volumes panel and toggle it on.

**Failure mode:** if the R2 fetch 404s or decode throws, the slot's existing error path logs and `commit` is never called. The field simply doesn't appear in the Volumes panel — same behaviour as a missing filaments file.

**Costs accepted:** ~32 MB extra bandwidth on every page load, ~32 MB GPU memory always allocated. Acceptable for v1; if it shows up in load metrics we switch to lazy in a follow-up (lazy was considered and dropped from v1 to keep this plan small).

## File layout

**New files:**

```
data/raw/cf4/README.md                                     download + citation + R2 curl commands
tools/cf4DensityIngest.py                                  one-shot maintainer .sav → .npy + meta
tools/parsers/npyReader.ts                                 minimal NumPy v1.0 parser
tools/buildCf4Density.ts                                   .npy → .scfd
src/data/superGalacticTransform.ts                         SG → equatorial helper
src/services/loading/fetchers/cf4DensityFetcher.ts         Fetcher<ScalarCube, void>
tests/data/superGalacticTransform.test.ts                  anchored Virgo / Coma
tests/parsers/npyReader.test.ts                            tiny fixture round-trip
tests/tools/buildCf4Density.smoke.test.ts                  end-to-end synthetic 8³
tests/services/loading/fetchers/cf4DensityFetcher.test.ts  mocked fetch happy + 404 + malformed
tests/fixtures/cf4/tiny.npy                                ~1 KB synthetic 8³ NumPy file
```

**Modified files:**

```
src/services/engine/phases/wireSlots.ts                    register cf4Density slot
src/data/defaults.ts                                       DEFAULT_CF4_DENSITY_ENABLED = false
tools/syncR2.ts                                            ALLOW cf4_density.scfd; EXTRA_FILES .npy + .meta.json
package.json                                               build-cf4-density script
.gitignore                                                 data/raw/cf4/*.sav, *.npy, *.meta.json
```

**Notably NOT touched:**

- `src/services/gpu/renderers/scalarVolumeRenderer.ts` — generic; accepts arbitrary handles
- `src/services/gpu/shaders/scalarVolume/*.wesl` — generic
- `src/services/engine/frame/passes/scalarVolumePass.ts` — generic
- `src/components/SettingsPanel/VolumeFieldRow.tsx`, `PaletteSelect.tsx` — list any registered field
- `src/@types/EngineSettingsState.d.ts` — `volumeFields: Record<string, ...>` accepts any handle
- `src/@types/EngineHandle.d.ts`, `EngineGpuHandles.d.ts` — already shape-correct

## Testing strategy

WebGPU isn't headless-mockable in vitest, so the same split as the rest of `services/gpu/` applies — pure logic gets unit tests; GPU paths rely on the existing scalar-volume-renderer tests against the real device.

| Test | What it covers |
|---|---|
| `tests/data/superGalacticTransform.test.ts` | Anchored positions (Virgo, Coma); quaternion unit-norm; matrix orthonormal; tolerance ≈ 1° on RA/Dec |
| `tests/parsers/npyReader.test.ts` | Round-trip against `tests/fixtures/cf4/tiny.npy`; asserts shape, dtype, raw bytes |
| `tests/tools/buildCf4Density.smoke.test.ts` | End-to-end with synthetic 8³ `.npy` + meta in tmpdir → `.scfd` written → `scalarFieldFormat.decode()` round-trips → header fields (origin, voxel size, rotation quaternion, paletteId, value_min/max) match expected |
| `tests/services/loading/fetchers/cf4DensityFetcher.test.ts` | Mocked-fetch happy path returns populated `ScalarCube`; 404 throws; malformed header throws with the SCFD format's regenerate message |

**Visual verification (manual, per CLAUDE.md "dev server stays running"):**

- After `npm run build-cf4-density` against a real `.npy`, `public/data/cf4_density.scfd` is ~32 MB
- Toggle "CF-4 dark matter" in Volumes panel → Laniakea blob appears toward (RA, Dec) ≈ (160°, −60°), distance ~80 Mpc
- Local Void as a transparent / cool gap toward (l, b) ≈ (60°, +20°)
- Great Attractor in Hydra-Centaurus at ~50 Mpc
- Volume fades to transmittance ≈ 1 beyond ~half the box; no hard cube edge visible
- Toggle off → scene identical to current `main`
- Intensity slider 0 → 2 → fades cleanly

**Explicitly NOT tested:**

- The Python ingest script (one-shot maintainer-only; manual run is the verification)
- R2 sync wiring (existing `syncR2.ts` tests already cover the mechanism; we add data, not code)
- New shader paths (no new shader code)
- New renderer paths (no new renderer code)

## Sub-plan decomposition

Single plan. The whole feature fits comfortably in ~10–15 tasks because the renderer infrastructure is already done. No need for a stop-anywhere split.

## Open questions / future work

- **`.sav` variable name** — discovered manually before Task 1 runs. Recorded in `data/raw/cf4/README.md` and hard-coded in the ingest script.
- **Default off → on flip** — once visual verification passes, may flip `DEFAULT_CF4_DENSITY_ENABLED` to `true`. Out of scope here.
- **Lazy loading** — explicitly deferred. If the eager 32 MB on every page load shows up in load-metric regressions, a follow-up plan can add a `KNOWN_VOLUME_FIELDS` registry + on-toggle fetch.
- **Higher resolution** — if 256³ looks under-resolved, the same pipeline accepts 512³ with only a build-script tweak. (No 512³ CF-4 release exists today.)
- **CF-4++ ensemble uncertainty** — a second SCFD field (std dev) could modulate opacity. Future plan; same primitive.
- **BORG-SDSS** — same primitive, different cube. Becomes a different fetcher + slot once this plan lands.
- **Flow-field overlay** — layering this with the planned `2026-05-05-cf4-{02..04}` flow-field plans gives the full Pomarède/Tully cosmography. They share `superGalacticTransform.ts`.
