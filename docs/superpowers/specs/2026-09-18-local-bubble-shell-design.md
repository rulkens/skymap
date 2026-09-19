# Local Bubble shell — design

**Status:** approved in brainstorm 2026-09-18; rides PR #755 (data + prep + layer on one PR, by the user's ruling).
**Supersedes:** `docs/backlog/2026-09-18-local-bubble-shell-render.md` (deleted with this spec; its load-bearing content is carried below).

## 1. Purpose

Draw the Local Bubble, the ~300 pc cavity of hot gas around the Sun, as a glowing Fresnel membrane that appears as the camera leaves the solar neighbourhood and recedes before the Galaxy becomes the subject. Source: O'Neill, Zucker, Goodman & Edenhofer (2024), CC0, already fetched and baked by PR #755 (`data/raw/localBubble/README.md`).

## 2. Scope

In:

- A lean baked-mesh runtime format (`.shell`) and the bake that writes it.
- A self-contained `localBubble` Layer: loader, renderer, shaders, pass, distance window, toggle fade row, settings, UI section.
- Two prep refactors (§3.5).

Out:

- The Per-Tau Shell (Bialy+ 2021). It becomes a second `.shell` file plus a second instance; the format carries a centre so that needs no format change, but the layer ships one instance.
- The double-walled shell (`d_inner`/`d_outer`/`thick`). Only the peak radius `d` is meshed.
- Migrating mesh bodies off SKMH, or onto glTF.

## 3. Ground preparation

### 3.1 Ideal shape

```
src/layers/localBubble/                 filaments template, ui shape per the merged flow Layer (#750)
  layer.ts        defineLayer({ name:'localBubble', settings, create, destroy,
                                passes, assets, fades, ui:{ settings: LocalBubbleSectionContainer } })
  create.ts / destroy.ts
  load/     localBubbleFetcher.ts · localBubbleSlot.ts · localBubbleAssetRows.ts
  render/   localBubbleRenderer.ts
  passes/   localBubblePass.ts
  present/  localBubbleOpacity.ts · localBubbleFadeRows.ts
  settings/ localBubbleLayerSettings.ts · localBubbleSlice.ts
  types/    LocalBubbleRuntime.ts
  ui/       LocalBubbleSectionContainer.tsx
src/services/gpu/shaders/localBubble/{vertex,fragment}.wesl
src/data/shellMesh/shellMeshFormat.ts          encode + decode (the format's single authority)
src/@types/data/shellMesh/ShellMesh.d.ts
tools/localBubble/buildLocalBubbleShell.ts     radius map → mesh → .shell

core rows:  SCALE_FADE_BANDS  +localBubble +localBubbleRecede
            frameOrder.ts     +'local-bubble' in the hdr NEAR0 roster (boot-checked)
            AssetKey          +'localBubble'
            app.ts, appSettingsSlices.ts   register (known double listing)
            fade tables ×7    +'localBubble' kind (filaments pattern, §7.3)
            allowDataFile     +'local-bubble.shell'
```

### 3.2 Greenfield cross-check

A fresh agent, given only the requirements, disagreed with the first sketch in two places:

- **Mesh source.** It proposed building the mesh on the CPU at load time from a 1 MB radius map. Ruled against by the user: baked mesh (§4).
- **Header.** It put the centre, units, orientation and a nodata sentinel in the file. Adopted: centre and frame. Units (pc) and orientation are fixed by the format definition; the bake heals NaN sight lines, so no sentinel.

### 3.3 Joint verdicts

| Touchpoint                                                           | Verdict                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layer registration, asset row, pass roster, fade band rows, AssetKey | growth (rows at existing seams)                                                                                                                                                                                 |
| Distance window                                                      | bolt-on today: ZoA hand-multiplies two bands (`zoneOfAvoidanceLayerOpacity.ts:13`); a second copy is the consolidation trigger → prep 1                                                                         |
| Galactic → world rotation                                            | missing: `FRAME_TO_WORLD.galactic` in `buildCubeModelMatrix.ts:63` is an identity stub, and `R_GAL_TO_EQ` is private (`superGalacticTransform.ts:80`) → prep 2                                                  |
| Toggle fade row                                                      | bolt-on: 7 hand edits across core tables plus core importing the layer's setter. Accepted by the user; the same cost filaments and flow pay, and consolidating it is layer-composition work, not this feature's |
| UI                                                                   | growth: `Layer.ui.settings` section; not a hand edit to core's Labels & guides container                                                                                                                        |

### 3.4 Priced shape decisions (user rulings)

- **Baked mesh over a load-time mesher**: ~11.4 MB file vs ~1 MB + a worker; the runtime stays a buffer upload.
- **Own lean format over SKMH**: SKMH is 48 B/vertex (tangent, uv unused), metres, no centre (~20 MB); giving it an attribute table would rebuild glTF by hand. Two simple mesh formats instead of one general one.
- **Galactic frame in the file**, tagged, rotated at draw time through the shared frame table (§3.5 prep 2, §6).
- **Toggle fade row**: yes.

### 3.5 Prep refactors (own commits, before the feature)

1. **`fadeWindow(bands, v)`** in `src/utils/math/fadeWindow.ts`: the product of `fadeBand` over a list of bands. `zoneOfAvoidanceLayerOpacity` moves onto it; its tests stay green unchanged.
2. **`FRAME_TO_WORLD`** moves from `buildCubeModelMatrix.ts` to `src/data/frameToWorld.ts`, and its `galactic` entry becomes the real galactic → equatorial rotation (export `GAL_TO_EQ` from `superGalacticTransform.ts` in the same 3×3 → column-major form as `SG_TO_EQ`). `buildCubeModelMatrix` imports it. Only consumer of `galactic` today is the unrendered Edenhofer dust cube, so nothing visible changes.

### 3.6 Packaging

Everything on PR #755, by the user's ruling: prep, feature and docs as separate commits, prep first.

### 3.7 Adjacent findings

- The backlog doc stated skymap's world frame is supergalactic. It is **equatorial** (`FRAME_TO_WORLD`, `buildDustVolume.ts:119-129`). Corrected here; the doc is deleted with this spec.
- `horizonShellPass.ts` header still says "UV-sphere mesh"; it is a fullscreen ray-march. Backlog.

## 4. Data

### 4.1 Bake

`npm run build-local-bubble` (then `build-data-manifest`):

1. FITS → `l, b, d` → equirect 1024×512 → median-then-mean smoothing at 2.5° (unchanged; smoothing is load-bearing, raw displaced data renders as radial spikes).
2. Icosphere displaced by the smoothed map, refined with `refineMeshByEdgeLength` toward a 4 pc displaced-edge target (8 passes: 569k triangles, longest edge 7.66 pc in the measured tail; a uniform sphere would need ~21M to match that tail). Whether the tail reads is an eye-check.
3. Smooth vertex normals from the refined mesh. The table's own `nx, ny, nz` describe the unsmoothed surface and are not used.
4. **Chimney assertion**: the mean direction of the outermost 5% of radii must lie within 30° of the north galactic pole, else the bake throws. The FITS header names no frame, so this pins the source's frame at its source.
5. `encodeShellMesh` → `public/data/local-bubble/v1/local-bubble.shell`, f16 by default, `--dtype f32` to override.

The smoothed radius map and previews still go to the gitignored `data/localBubble/`; the offline preview reads the `.shell` file, so it predicts the renderer from the same bytes.

### 4.2 `.shell` format v1 (little-endian)

```
 0  4  magic       'SHEL'
 4  4  version     1
 8  1  dtype       0 = f16 (vertex format float16x4) · 1 = f32 (float32x4)
 9  1  frame       SCFD numbering (ScalarFieldFrameKind): 0 supergalactic · 1 equatorial · 2 galactic
10  2  reserved    zero
12  4  vertexCount u32
16  4  indexCount  u32
20 12  centrePc    f32×3, in `frame`, Sun-relative
32     positions   vertexCount × 4 components (pc, centre-relative, w = 1)
       normals     vertexCount × 4 components (unit, w = 0)
       indices     indexCount × u32
```

- Four components for both dtypes: WebGPU has no `float16x3`, and one layout for both keeps the dtype a table lookup. f16 steps are 0.25 pc at 256–512 pc, ~0.2 px from 1.5 kpc.
- Estimated size at ~285k vertices, f16: 4.6 MB vertices + 6.8 MB indices ≈ 11.4 MB.
- Decoder rejects bad magic, unknown version, dtype or frame with the repo's "regenerate via `npm run build-local-bubble`" wording, and returns views, not copies.
- Units are parsecs by definition; the renderer applies pc → Mpc.
- DATA.md gains a formats-table row and a `local-bubble/v1/` layout line; `allowDataFile` gains `local-bubble.shell`.

## 5. Loading

- `localBubbleFetcher`: `fetchWithProgress(dataUrl(...))` → `decodeShellMesh`.
- `localBubbleSlot`: `createAssetSlot`, commit → `renderer.upload(mesh)`.
- `localBubbleAssetRows`: key `'localBubble'`, tier-agnostic request,
  `demand = enabled && |cameraPosMpc − Sun| < 20 kpc`, `release = |…| > 40 kpc`. Keeps the ~11 MB off the boot path for sessions that never come near the solar neighbourhood.

## 6. Rendering

- **Renderer** (built in the layer's `create`): two vertex buffers with formats from a `dtype → GPUVertexFormat` table, a u32 index buffer, one `drawIndexed`. Pipeline: `ADDITIVE_BLEND`, **no depthStencil** (the `hdr` target has no depth, `renderTargets.ts:198`, so stars cannot occlude the far wall), no culling (both walls contribute; the folds read additively without a sort).
- **Model matrix**: `FRAME_TO_WORLD[frame] × translate(centrePc) × scale(pc → Mpc)`, on NEAR0.
- **Shaders**: vertex → world position, normal, view vector; fragment `pow(1 − |N·V|, 3) × tint × opacity`, normal renormalised per pixel (flat normals make every edge visible). Fresnel line borrowed from `shaders/horizonShell/fragment.wesl`.
- **Slab: NEAR0 only.** `COSMO_NEAR_MPC = 0.01` (10 kpc, `slabs.ts:120`) and the bubble is 0.07–0.6 kpc, entirely inside COSMO's near plane; the visibility window also straddles 10 kpc. NEAR0 is infinite-far reversed-Z with the Sun as origin, so the shell can be neither far- nor near-clipped. **Do not widen NEAR0's `distanceRangeM`**: it is the painter key merging NEAR0 with body rows, and an additive, depthless shell adds no depth-bearing content.
- **Pass**: `localBubblePass`, placed in the hdr NEAR0 roster after `milky-way` so the multiplicative dust does not dim it. `enabled = slot resident && opacity > 0`: at zero it does not run.

## 7. Visibility, settings, UI

### 7.1 Distance window

Keyed on the camera's distance from the Sun (NEAR0's origin and the shell's centre):

```ts
localBubble:       { fullAt: 1.5 kpc, goneAt: 0.6 kpc },  // out of the shell
localBubbleRecede: { fullAt: 4 kpc,   goneAt: 10 kpc },   // before the Galaxy
```

`localBubbleOpacity = fadeWindow([localBubble, localBubbleRecede], camDistMpc)`. Invisible from inside (0.6 kpc > the 536 pc maximum radius), absent at solar-system scale. Eye-tuned, not derived; sized from apparent diameter (1.5 kpc → ~22°, 10 kpc → ~3.4°). The outer edge matches the constellations recede band.

### 7.2 Opacity

`opacity = window × fadeRowAlpha × intensity`.

### 7.3 Toggle fade row

A `localBubble` fade kind, filaments pattern: `FadeId`, `serializeFadeId` (`fadeRegistry.ts`), `RECESSION_BY_KIND` (`focusRecession.ts`), `VISIBILITY_KEY_BY_KIND` (`fadeIdToVisibilityKey.ts`), `VisibilityLayerKey`, `visibilityLayerRows`, `visibilityActionRow`; the layer declares `fades: localBubbleFadeRows`.

### 7.4 Settings and UI

`{ enabled: true, intensity: 1 }`, intensity 0–2. On by default: the window already keeps it invisible outside 0.6–10 kpc. The layer's own settings-panel section holds the toggle and the slider.

## 8. Testing

- `shellMeshFormat`: round trip in both dtypes; rejection of bad magic, version, dtype and frame.
- `frameToWorld`: the galactic north pole → J2000 RA 192.86°, Dec +27.13°; l = 0 → the Galactic Centre (RA 266.40°, Dec −28.94°).
- `fadeWindow`: its edges; existing ZoA tests stay green.
- Fade-table exhaustiveness is already type- and test-checked.
- No GPU tests. The look is an in-app eye-check.

## 9. Open questions (settled in the app, not here)

1. **Does it read against the background?** The window sits where the Milky Way impostor is at full strength and Gaia is crossfaded in. The biggest risk to the feature; if a thin additive membrane does not read, tint/intensity and the bands are the first levers.
2. **Smoothing radius.** 2.5° is eye-tuned; `--smooth-deg` re-bakes.
3. **Band edges** (§7.1) are eye-tuned.

## 10. Commit sequence on #755

1. prep: `fadeWindow`, ZoA onto it.
2. prep: `FRAME_TO_WORLD` to its own module with the real galactic rotation.
3. feat: `.shell` format, bake, preview.
4. feat: the `localBubble` layer.
5. docs: DATA.md, PR description.
