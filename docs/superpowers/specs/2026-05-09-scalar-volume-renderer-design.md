# Scalar Volume Renderer

**Date:** 2026-05-09
**Status:** Spec
**Related:**
- [CF-4 Dark-Matter Density Volume Render (2026-05-07)](2026-05-07-cf4-dark-matter-volume-render-design.md) — predecessor; this spec generalises its renderer half so multiple density-field datasets can share infrastructure.  After this lands, the CF-4 spec is reduced to "build-time ingest + a `SCFD` cube on R2".
- Future sibling: MCPM density-field ingest (Elek/Burchett slime-mold reconstruction from our merged 2MRS+GLADE+SDSS catalogs) — to be specced separately.

## Goal

Add a renderer that takes a 3D scalar field on a regular grid and draws it as a translucent volume composited over the existing scene.  Multiple fields can be active at once, each with an independent intensity slider and a per-dataset colour palette so two overlays read as two distinct things rather than one mush.  No dataset-specific code lives in the renderer — adding a new density cube is a build-time concern, not a rendering one.

The first downstream consumer is the **CF-4 256³ HAMLET cube** (Wiener-filter reconstruction of local-universe dark-matter density from ~56k peculiar velocities; Valade et al. 2024).  The second planned consumer is an **MCPM density field** computed offline from skymap's own merged galaxy catalog (Polyphorm/PolyPhy slime-mold transport-network estimator; Elek/Burchett 2022).  The two fields are mostly complementary: CF-4 covers the local ~500 Mpc with reconstructed-DM mass (including everything not visible as galaxies); MCPM covers wherever skymap has galaxies (out to GLADE's ~1000 Mpc).  Showing both at once with distinct palettes lets a viewer eyeball where the two reconstructions agree.

The motivating problem this addresses for skymap as a whole: **the cosmic web is hard to read off the existing point cloud**.  Galaxies are too sparse (~1.5M visible at the perf ceiling) to convey large-scale structure on their own, and the DisPerSE filaments are wiggly 1D ridges that the eye doesn't fuse into a continuum.  A continuous translucent density layer underneath both is the canonical fix — it's what the published Pomarède/Tully cosmography videos use, and it's how the human visual system actually parses "where the mass is".

## Non-goals (this spec)

- **Picking on volumes.**  The fields are decorative — clicks pass through to galaxies and filaments behind, just like Phase 1 of the filament renderer.  No `volumePick`, no per-voxel hover readout.
- **Per-frame field updates.**  Cubes are static after upload.  Live MCPM in WebGPU compute (Option C from the brainstorm) is explicitly deferred.  If we ever want it, this renderer's `addField` API doesn't preclude swapping the texture later.
- **Curve-editor transfer functions.**  The renderer assumes the cube has *already been mapped through a perceptual ramp at build time* and ships values in `[0, 1]`.  Datasets that need log-δ or asinh-trace bake that into their preprocessing.  Pushes domain expertise into the dataset where it belongs and keeps the WGSL trivial.
- **LOD / mipmapped 3D textures.**  256³ at f16 is 32 MB — comfortably one mip.  If we later add a 512³ dataset we revisit.
- **Anisotropic voxels, non-cubic boxes, wrap-around.**  Cubes are cubic, axis-aligned-or-quaternion-rotated, no periodic boundaries.  Both target datasets satisfy this.
- **CF-4-specific or MCPM-specific code paths.**  The renderer is dataset-agnostic.  Anything that smells like `if (cube.id === 'cf4')` is a bug in this spec.

## Background — why generalise now

The CF-4 spec was drafted as a single-purpose renderer (one cube, one palette, one transfer function).  When MCPM came up as a second source — also a 3D scalar field, also volume-rendered, also additive-translucent over the existing scene — the right move is to factor the shared infrastructure out before either is built rather than after.  The renderer is ~80% of the engineering for both consumers; the per-dataset work is a one-shot Python preprocessor.  Building it twice would be wasteful, and building it once-then-refactoring tends to leave dataset-specific assumptions baked into the "shared" code (the WebGPU layout-`auto` trap is a reminder of how subtle those assumptions get).

Two of the user's recurring memories also push toward generality here: *minimise stateful surface in skymap* (the renderer is mostly pure: voxels in, blended pixels out) and *be meticulous with WGSL / shader code* (one well-tested raymarch shader is safer than two parallel ones with subtle drift).

## Architecture overview

```
                     build-time (per-dataset)                                runtime
                     ─────────────────────────                              ─────────

   data/raw/cf4/*.sav  ──┐                                              ┌── cf4DensityLoader.ts
                         │                                              │
   tools/cf4DensityIngest.py ──▶ tools/buildScalarField.ts ──▶ *.bin ──┤
   tools/mcpmIngest.py       ──▶ tools/buildScalarField.ts ──▶ *.bin ──┤
                         │                                              │── mcpmDensityLoader.ts
   data/raw/galaxies ──┘                                                │
                                                                        ▼
                                                            scalarVolumeRenderer.addField()
                                                                        │
                                                                        ▼
                                                            engine.ts wires into renderFrame
                                                                        │
                                                                        ▼
                                                            SettingsPanel "Volumes" section
                                                            (one row per registered field)
```

Three boundaries:

1. **Per-dataset Python preprocessor** — knows about the source file format (CF-4's IDL `.sav`, an MCPM run's `.npy`), the source's value semantics (linear δ, MCPM trace), and the right perceptual ramp for that quantity.  Emits a normalised f32/f16 cube in `[0, 1]`.
2. **Shared TS build script (`tools/buildScalarField.ts`)** — takes the normalised cube + per-dataset metadata (frame, origin, voxel size, palette), writes a `SCFD` v1 binary.  No dataset-specific logic.
3. **Runtime renderer (`src/services/gpu/scalarVolumeRenderer.ts`)** — knows how to decode `SCFD`, upload to a 3D texture, and raymarch one or more active cubes per frame.  Knows nothing about CF-4, MCPM, or any other specific dataset.

This is the same shape as the existing point-cloud pipeline (`tools/buildAllBins.ts` → `cloudLoader` → `pointRenderer`), and it follows the precedent set by the filament pipeline (`tools/buildFilaments.ts` → `loadFilaments` → `filamentRenderer`).

## File format — `SCFD` v1

A self-describing binary, header + raw voxels.  Matches the existing `.bin` precedent in `src/data/pointCloudFormat.ts` and avoids sidecar JSON drift.

```
struct ScfdHeader {  // 96 bytes
  magic       : u32;          // = 0x44464353 ("SCFD" little-endian)
  version     : u32;          // = 1
  dims        : [u32; 3];     // (Nx, Ny, Nz); each in [1, 1024]
  dtype       : u8;           // 0 = f16, 1 = u8.  v1 supports f16 only; u8 reserved.
  value_kind  : u8;           // 0 = pre-normalised [0,1].  1 = raw, reserved (not implemented).
  palette_id  : u8;           // index into the renderer's palette table (see "Palettes")
  frame_kind  : u8;           // 0 = supergalactic-cartesian, 1 = equatorial-cartesian, 2 = galactic.  More as needed.
  origin      : [f32; 3];     // position of voxel (0,0,0) corner, in `frame_kind`'s coordinate frame, Mpc
  voxel_size  : f32;          // Mpc; cubic voxels assumed (no anisotropy in v1)
  rotation    : [f32; 4];     // unit quaternion (x, y, z, w) applied in the native frame before frame→world; identity for axis-aligned cubes
  value_min   : f32;          // for diagnostics; only meaningful if value_kind == 1
  value_max   : f32;
  reserved    : [u8; 32];     // pad to 96 bytes; zero-filled
}
// followed by Nx * Ny * Nz × dtype voxels, x-fastest, then y, then z
```

**Why pre-normalised in v1.**  The renderer's WGSL never has to reason about the underlying physical quantity — it samples a value in `[0, 1]`, indexes into a 1D palette LUT, and accumulates.  All the domain knowledge ("CF-4 over-density wants `log(1 + δ)` so voids don't dominate") lives in the per-dataset Python preprocessor where the upstream paper's authors already documented the right mapping.  This is the same separation-of-concerns that keeps `pointRenderer` from knowing about magnitudes vs absolute magnitudes vs colour indices.

**Why a quaternion rotation.**  CF-4 is axis-aligned in supergalactic Cartesian, so its rotation is identity.  But MCPM-from-our-data will run in whatever frame is convenient for the build (likely the same equatorial-Cartesian frame our point clouds use), and a future dataset might be axis-aligned in some other frame.  Carrying a per-cube rotation makes "draw this cube where it actually lives" a single matrix multiply rather than a frame-specific code path.

**Why no value scale per voxel.**  Pre-normalisation removes it.  If we ever add `value_kind = 1` (raw), we recover the per-voxel range from `value_min`/`value_max` in the header.

## Renderer API — `src/services/gpu/scalarVolumeRenderer.ts`

```ts
export type ScalarFieldHandle = string;  // caller-chosen, e.g., "cf4", "mcpm"

export type ScalarVolumeRenderer = {
  addField(handle: ScalarFieldHandle, cube: ScalarCube): void;
  removeField(handle: ScalarFieldHandle): void;
  setEnabled(handle: ScalarFieldHandle, enabled: boolean): void;
  setIntensity(handle: ScalarFieldHandle, intensity: number): void;  // [0, 1]
  hasActiveFields(): boolean;  // for render-on-demand gating
  draw(pass: GPURenderPassEncoder, camera: CameraUniforms): void;
};
```

`ScalarCube` is the decoded form of a `SCFD` file — a typed shape carried by the loader (see "Loaders" below).  `addField` uploads the cube data to a 3D `r16float` texture, builds the model matrix from `(frame_kind, origin, voxel_size, rotation)`, and stores the per-field state (enabled, intensity, model matrix, palette index) in a `Map<handle, FieldEntry>`.

`draw` iterates active enabled fields in registration order and dispatches one raymarch pass each, additively blending into the bound HDR target.  Fields with `intensity === 0` skip dispatch entirely (the per-field early-out — cheaper than letting the shader multiply by zero).

Single shader pipeline shared across all fields; only the bind group differs between dispatches.  This sidesteps the layout-`auto` trap from memory: one pipeline → one auto-derived bind-group layout → no cross-pipeline bind-group reuse needed.

## Rendering pipeline

### Vertex stage

A unit cube (8 verts, 36 indices, axis-aligned).  The vertex shader transforms by the field's `modelMatrix` and the camera's `viewProj` to draw the cube's bounding box.  **Front-face culling** so only back faces rasterise — this is the production-standard setup for handling both inside-the-cube and outside-the-cube cases with the same pipeline.  Back faces always exist at the cube's full screen footprint regardless of camera position; front faces disappear when the camera enters the cube.  A full-screen quad would also work but pays for every screen pixel even when the cube projects to a small footprint (e.g., CF-4 viewed zoomed out), which becomes a real fragment-shader cost with multiple active cubes.

### Fragment stage — front-to-back raymarch

For each fragment:

1. Compute world-space ray from camera through the fragment.
2. Intersect with the cube's local-space AABB (transform ray into local coords using the inverse model matrix).  Get `(tMin, tMax)`, then `tMin = max(tMin, 0)` so a camera *inside* the cube starts marching from its own position rather than a negative entry point behind it.
3. March from `tMin` to `tMax` in `STEP_COUNT = 192` fixed-size steps:
   - Sample the 3D texture (linear interpolation) at the current point.
   - Look up `RGBA` in the palette LUT using the sampled value.
   - Pre-multiply alpha by `intensity * stepLength` (intensity is the per-field slider value; stepLength normalises against the fixed step count so opacity is invariant to `STEP_COUNT`).
   - Front-to-back composite: `accumRGB += (1 - accumA) * sampleRGB; accumA += (1 - accumA) * sampleA`.
   - Early-out when `accumA > 0.99`.
4. Output `accumRGB` with alpha `accumA`.  Blend mode is `src + dst * (1 - srcA)` for over-compositing — but since the renderer additively blends multiple fields, we use straight additive (`src + dst`) and let the per-field opacity ramp handle saturation.  *(Note: the trade-off here needs visual verification; see "Open questions".)*

`STEP_COUNT = 192` is a starting point — empirically what CF-4-class fields look right at on a 256³ cube.  Exposed as a renderer-construction constant; not in `SettingsPanel` for v1.

### Palettes

A small renderer-side table.  Each palette is a 256-entry RGBA8 LUT in a 1D texture.  v1 palettes:

| `palette_id` | Name | Suggested use |
|---|---|---|
| 0 | `viridis` | generic / fallback |
| 1 | `magma` | generic warm |
| 2 | `blue-purple` | CF-4 default (matches Pomarède publications) |
| 3 | `yellow-green` | MCPM default (visually distinct from blue-purple when both layers are on) |

Palette generation: a build-time TS script emits the LUTs as a single `palettes.bin` shipped with the renderer.  Easy to extend — add an entry, regenerate, increment `palette_id` capacity.  Palettes are renderer-internal; the cube's header just carries an index.

## Coordinate frames

The renderer composes two transforms per field:

```
modelMatrix = frameToWorld[frame_kind] * cubeLocal
```

where `cubeLocal = translate(origin) * rotate(quat) * scale(voxel_size * dims)` maps the unit cube to the cube's footprint in its native frame, and `frameToWorld[frame_kind]` is a small lookup table the renderer ships with.

For `frame_kind == 1` (equatorial-cartesian — skymap's native frame), `frameToWorld` is identity.  For `frame_kind == 0` (supergalactic-cartesian — CF-4's frame), it's the standard rotation matrix from supergalactic to equatorial coordinates (pre-computed constant; values in the standard astronomy references).  Adding a new frame is a single new entry in the table.

Datasets that don't fit any of the three v1 frames bump the renderer version with a new entry — preferable to letting each dataset carry its own ad-hoc world-space matrix (which would re-encode the same supergalactic→equatorial rotation in many places and be a debugging nightmare when one of them is wrong).

## Loaders

One per dataset — but each is ~30 lines of boilerplate calling a shared `decodeScfd(buffer): ScalarCube` helper that parses the header and packages the voxel data with the metadata fields the renderer needs.

```ts
// src/services/engine/cf4DensityLoader.ts
export async function loadCf4Density(): Promise<ScalarCube | null> {
  const buf = await fetch(dataUrl('cf4_density.bin')).then(r => r.arrayBuffer());
  return decodeScfd(buf);  // throws on bad magic / bad version
}

// src/services/engine/mcpmDensityLoader.ts — same shape
```

The two loader files exist mainly so each dataset has a clear ownership home for its URL and any dataset-specific load-failure handling (e.g., a one-line "MCPM cube unavailable, skipping" warning vs the CF-4 case).

## Engine wiring

`engine.ts` constructs the renderer once during init.  Each dataset loader runs as part of the existing async asset-load flow (port to `AssetSlot` per the existing loading work); on success, it calls `scalarVolumeRenderer.addField('cf4', cube)` (or `'mcpm'`).  If a dataset's binary isn't on the CDN, the loader returns `null` and the field simply doesn't register — no error path needed in the renderer.

In `renderFrame.ts`, one new `Pass` (per Spec D's `Pass` abstraction, if landed by then; otherwise a flat block) sits *after* the point/quad/disk/filament passes but *before* the tone-map post-process.  Volumes render into the HDR target so they participate in tone-mapping.

```ts
// in renderFrame.ts, after existing draw blocks:
if (settings.volumesEnabled && scalarVolumeRenderer.hasActiveFields()) {
  scalarVolumeRenderer.draw(hdrPass, cameraUniforms);
}
```

The `settings.volumesEnabled` master toggle exists for the same reason `filamentsEnabled` does — single switch to opt out of the whole layer regardless of per-field state.

The render-on-demand gate (`renderScheduler.ts`) gets one new condition: re-render while any per-field intensity tween is active.  Cube uploads are one-shot and don't move the camera, so post-upload renders are triggered by the existing `requestRender()` call from the loader's success path.

## Settings UI — `Volumes` section

A new collapsible section in `SettingsPanel`, structured like the current `Filaments` section.  Layout:

```
▾ Volumes [ ☑ master ]
   ☑ CF-4 dark matter         [intensity slider ▬▬▬●▬▬]
   ☐ MCPM galaxy density      [intensity slider ▬●▬▬▬▬]
```

The list is **populated dynamically** from `scalarVolumeRenderer`'s registered fields.  No hard-coded "CF-4" or "MCPM" labels in the React component — fields self-describe their human-readable name via a per-handle metadata bag the loader passes alongside the cube.  Adding a new dataset → new row appears automatically.

Persistence: per-field enabled state and intensity round-trip through `localStorage`, keyed by handle.  Unknown handles in storage are ignored (graceful when fields are removed).

## Performance budget

- **GPU memory per cube**: 256³ × f16 = 32 MB for the 3D texture, plus a 1 KB palette LUT.  Two cubes active = 64 MB — well within budget on integrated GPUs, comfortable on dGPUs.
- **Per-frame fragment work**: at 1920×1080, ~2M fragments × 192 steps × (1 texture sample + 1 LUT sample + 1 composite) per active field.  Rough back-of-envelope: ~400M texture samples per active field per frame.  Modern hardware handles this at 60 FPS for one field; two fields likely fine, three may push budget on integrated GPUs.  Early-out at `accumA > 0.99` recovers significant headroom in dense regions.
- **CPU cost**: negligible — `draw` is N pass dispatches (N = active fields), each is a couple of `setBindGroup` + `drawIndexed` calls.

If the multi-field perf is not actually fine, fall back to single-pass multi-texture with a fixed max-N (probably 2 — CF-4 + MCPM is the realistic ceiling for skymap's foreseeable lifetime).  Defer that decision to measurement.

## Testing

Unit tests:
- `tests/data/scfdFormat.test.ts` — round-trip an `SCFD` v1 buffer (encode → decode → assert equality on all header fields + voxel data).  Bad-magic and bad-version paths.
- `tests/services/gpu/scalarVolumeRenderer.test.ts` — `addField` / `removeField` / `setEnabled` / `setIntensity` round-trips on the public API.  Mock the GPU layer (the existing test pattern in `tests/services/gpu/`).
- `tests/services/engine/scalarVolumeFrame.test.ts` — render-on-demand integration: enabling a field re-requests a frame; intensity tweens hold the frame loop.

Visual verification (per the *be meticulous with WGSL* memory): a small synthetic cube fixture (e.g., a fuzzy 3D Gaussian centred in the box) goes into a manual visual test page so the raymarcher can be eyeballed independently of either real dataset.  Don't ship the renderer based purely on green unit tests.

## Out of scope (v1) — recap

- Volume picking
- Live MCPM compute in WebGPU
- Curve-editor transfer functions
- LOD / mipmapped 3D textures
- `value_kind = 1` (raw, non-pre-normalised) cubes
- Anisotropic / non-cubic voxels, periodic boundaries
- More than one active palette per field (no multi-channel cubes in v1)

## Open questions

1. **Additive vs over compositing across fields.**  The spec assumes additive between fields.  This is right for "two distinct overlays", but if the user wants a single perceptually-coherent density (e.g., CF-4 inside its box, MCPM outside), over-compositing in registration order may read better.  Worth testing both with real data.
2. **HDR vs LDR target.**  The current `renderFrame` HDR pipeline tone-maps everything together.  Volume renders should participate, but additive accumulation can blow out fast — may need a soft `tanh`-style limiter before write.

## Future work

- **MCPM ingest spec** — Python preprocessor wrapping PolyPhy (Taichi) on the merged 2MRS+GLADE+SDSS catalog, emitting a normalised cube to feed `buildScalarField.ts`.  Will need its own brainstorm pass — frame choice (equatorial vs supergalactic), grid resolution (256³ vs higher), agent count + iteration count tuning.
- **CF-4 ingest spec rewrite** — strip the rendering half from the existing 2026-05-07 spec and reduce it to "ingest + cube production" only.  Largely a cut-and-trim job once this renderer is approved.
- **Picking on volumes** — would let the user click into a void or a high-density blob and read out its CF-4-derived mass, MCPM-derived trace value, etc.  Genuinely useful for science-communication tours.
- **Diagnostic raw-value mode** — implement `value_kind = 1` so we can show the actual physical quantity (over-density δ, MCPM trace) on hover for a cell, not just the perceptual ramp value.
- **A third dataset.**  BORG-SDSS or BORG-2M++ density fields are natural candidates and would validate that the "renderer is dataset-agnostic" promise holds.
