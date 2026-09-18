# Local Bubble shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Local Bubble as an additive Fresnel shell, in a new `localBubble` Layer fed by a baked `.shell` mesh.

**Architecture:** Two prep refactors (`fadeWindow`, a shared `FRAME_TO_WORLD` with a real galactic rotation), then a lean binary mesh format and the bake that writes it, then a self-contained Layer on the filaments template (one asset slot, one renderer, one NEAR0 pass, one fade row, a settings section).

**Tech Stack:** TypeScript, WebGPU + WESL, Redux Toolkit, Vitest, tsx build tools.

**Spec:** `docs/superpowers/specs/2026-09-18-local-bubble-shell-design.md`

## Global Constraints

- Worktree `.claude/worktrees/pr-755-local-bubble`, branch pushed to `claude/per-tau-shell-milky-way-qm66h4` (PR #755). One commit per task, prep first.
- Conventions from CLAUDE.md: `type` not `interface`; one symbol per file in `utils/` and `@types/`; Layer-own types in `src/layers/localBubble/types/`; comments per `docs/superpowers/conventions/comments.md`; pass files export only their one symbol (`frameFilePurity.test.ts`).
- Moves and extractions use `npm run move-files` / `npm run refactor`, never `git mv` + hand-edited imports.
- Units: the `.shell` file is **parsecs**, centre-relative; world space is **equatorial Mpc**; NEAR0's origin is the Sun.
- `public/data` in this worktree is a symlink to main's. Do not run the bake or `build-data-manifest` from an agent; the user runs the bake.
- No GPU tests; the look is an in-app eye-check by the user.

## Dispatch grouping (controller)

A = Tasks 1–2 (prep) · B = Tasks 3–4 (format + bake) · C = Tasks 5–8 (layer) · Task 9 inline.

---

### Task 1: `fadeWindow` helper, ZoA onto it

**Files:** Create `src/utils/math/fadeWindow.ts`, `tests/utils/math/fadeWindow.test.ts`. Modify `src/services/engine/presentation/zoneOfAvoidanceLayerOpacity.ts`.

**Interfaces — Produces:**

```ts
export function fadeWindow(bands: readonly FadeBand[], value: number): number; // ∏ fadeBand(band, value)
```

- [ ] Test `fadeWindow is 0 below the in-band, 1 inside the window, 0 past the out-band` with an approach band `{ fullAt: 2, goneAt: 1 }` and a recede band `{ fullAt: 4, goneAt: 8 }` at values 0.5, 3, 10.
- [ ] Test `fadeWindow of no bands is 1`.
- [ ] Implement over `fadeBand` (`src/utils/math/fadeBand.ts:33`).
- [ ] `zoneOfAvoidanceLayerOpacity` becomes `fadeWindow([zoneOfAvoidance, zoneOfAvoidanceRecede], camDistMpc) * layerFadeOpacity`; its existing tests stay green unchanged.
- [ ] Commit `prep(presentation): fadeWindow composes fade bands; ZoA onto it`.

### Task 2: shared `FRAME_TO_WORLD` with the real galactic rotation

`review: yes` (frame maths)

**Files:** Create `src/data/frameToWorld.ts`, `tests/data/frameToWorld.test.ts`. Modify `src/data/superGalacticTransform.ts`, `src/utils/math/buildCubeModelMatrix.ts:60-67`, `tools/volumes/buildDustVolume.ts:119-129` (comment only).

**Interfaces — Produces:**

```ts
// superGalacticTransform.ts — beside the SG_TO_EQ exports, same derivation style
export const GAL_TO_EQ_MATRIX: Mat3;
export const GAL_TO_EQ_MAT4_COL_MAJOR: Mat4;
// frameToWorld.ts
export const FRAME_TO_WORLD: Readonly<Record<ScalarFieldFrameKind, Mat4>>;
//   'supergalactic-cartesian' → SG→EQ (unchanged), 'equatorial-cartesian' → identity,
//   'galactic' → GAL→EQ (was an identity stub)
```

- [ ] Test `galactic north pole maps to J2000 RA 192.85948°, Dec +27.12825°` (unit vector, tolerance 1e-5 rad) through `FRAME_TO_WORLD.galactic`.
- [ ] Test `galactic l=0, b=0 maps to RA 266.40499°, Dec −28.93617°`.
- [ ] Test `supergalactic entry is unchanged` against the existing `SG_TO_EQ_MAT4_COL_MAJOR`.
- [ ] Export `R_GAL_TO_EQ` (`superGalacticTransform.ts:80`) as the pair above; lift the table out of `buildCubeModelMatrix.ts` into `frameToWorld.ts` and import it back. Existing `buildCubeModelMatrix` tests stay green.
- [ ] Update the `buildDustVolume.ts` comment: the galactic rotation now exists.
- [ ] Commit `prep(frames): FRAME_TO_WORLD in its own module, galactic is a real rotation`.

### Task 3: the `.shell` format

`review: yes` (binary format)

**Files:** Create `src/data/shellMesh/shellMeshFormat.ts`, `src/@types/data/shellMesh/ShellMesh.d.ts`, `src/@types/data/shellMesh/ShellMeshDtype.d.ts`, `tests/data/shellMesh/shellMeshFormat.test.ts`.

**Byte table (little-endian):**

| Offset | Bytes | Field       | Notes                                                                                                                                             |
| ------ | ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | 4     | magic       | ASCII `SHEL`                                                                                                                                      |
| 4      | 4     | version     | u32 = 1                                                                                                                                           |
| 8      | 1     | dtype       | 0 = f16, 1 = f32                                                                                                                                  |
| 9      | 1     | frame       | SCFD numbering: 0 supergalactic-cartesian, 1 equatorial-cartesian, 2 galactic (reuse the SCFD id maps in `scalarFieldFormat.ts`, don't copy them) |
| 10     | 2     | reserved    | zero                                                                                                                                              |
| 12     | 4     | vertexCount | u32                                                                                                                                               |
| 16     | 4     | indexCount  | u32                                                                                                                                               |
| 20     | 12    | centrePc    | f32×3, in `frame`, Sun-relative                                                                                                                   |
| 32     | V·4·s | positions   | 4 components per vertex (pc, centre-relative, w = 1); s = 2 (f16 bits) or 4                                                                       |
| …      | V·4·s | normals     | 4 components per vertex (unit, w = 0)                                                                                                             |
| …      | I·4   | indices     | u32                                                                                                                                               |

32 + V·4·s is 4-byte aligned for both dtypes, so every block is a view over the buffer.

**Interfaces — Produces:**

```ts
export type ShellMeshDtype = 'f16' | 'f32';
export type ShellMesh = {
  dtype: ShellMeshDtype;
  frame: ScalarFieldFrameKind;
  centrePc: Vec3;
  vertexCount: number;
  positions: Uint16Array | Float32Array; // f16 bits when dtype === 'f16'
  normals: Uint16Array | Float32Array;
  indices: Uint32Array;
};
export function encodeShellMesh(mesh: ShellMesh): ArrayBuffer;
export function decodeShellMesh(buf: ArrayBuffer): ShellMesh; // views, not copies
```

- [ ] Test `round-trips an f16 mesh` and `round-trips an f32 mesh` (two triangles, a non-zero centre, frame galactic).
- [ ] Test `rejects a bad magic`, `rejects an unknown version`, `rejects an unknown dtype`, `rejects an unknown frame`; each message names `npm run build-local-bubble`, as `scalarFieldFormat.ts` does for its rebuild command.
- [ ] Implement; the layout comment in the module header states units (pc) and the w conventions.
- [ ] Commit `feat(localbubble): the .shell mesh format`.

### Task 4: the bake writes `.shell`

**Files:** Modify `tools/localBubble/buildLocalBubbleShell.ts`, `tools/localBubble/previewLocalBubbleShell.ts`, `tools/deploy/r2/allowDataFile.ts` (+ its test's table if table-driven), `package.json` (`build-local-bubble` gains `&& npm run build-data-manifest`). Create (by extraction from the preview, `npm run refactor` extract) `tools/utils/geo/icosphere.ts`, `tools/utils/geo/vertexNormals.ts`, `tools/utils/geo/radiusAtDirection.ts`; create `tools/utils/geo/meanDirectionOfLargest.ts` and `tests/tools/utils/geo/vertexNormals.test.ts`.

**Behaviour:**

1. Existing pipeline to the smoothed `d` plane, unchanged; still written to `data/localBubble/` for the preview.
2. `icosphere(2)` → `refineMeshByEdgeLength(dirs, faces, radiusOf, 4, 8, maxFaces)`; raise the preview's `MAX_FACES = 500000` cap so a 4 pc target is reached (~570k triangles), and print the final longest displaced edge.
3. Positions = dir × radius (pc, centre `[0,0,0]`, frame galactic); normals = `vertexNormals`.
4. **Chimney assertion:** `meanDirectionOfLargest(dirs, radii, 0.05)` must be within 30° of `[0, 0, 1]` (galactic north), else throw with the angle in the message.
5. `encodeShellMesh` → `public/data/local-bubble/v1/local-bubble.shell`; `--dtype f32` flag, f16 default (pack with the existing `f32ToF16Bits`).
6. The preview reads the `.shell` file via `decodeShellMesh` instead of rebuilding the mesh; its view directions stay galactic.

```ts
export function meanDirectionOfLargest(
  dirs: readonly Vec3[],
  radii: readonly number[],
  fraction: number,
): Vec3;
export function vertexNormals(
  positions: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
): Vec3[];
```

- [ ] Test `vertexNormals of a unit icosphere point radially outward` (dot with the position > 0.99 for every vertex). Catches a winding flip that would invert the Fresnel term.
- [ ] Extract, implement, wire; `allowDataFile` gains `name === 'local-bubble.shell'`.
- [ ] Delete the stale RMAP/f32-plane remnants from both tool headers.
- [ ] Commit `feat(localbubble): bake the shell mesh to .shell`.

### Task 5: Layer scaffold, settings, loading

**Files:** Create under `src/layers/localBubble/`: `layer.ts`, `create.ts`, `destroy.ts`, `types/LocalBubbleRuntime.ts`, `settings/localBubbleLayerSettings.ts`, `settings/localBubbleSlice.ts`, `load/localBubbleFetcher.ts`, `load/localBubbleSlot.ts`, `load/localBubbleAssetRows.ts`. Modify `src/compositions/app.ts`, `src/compositions/appSettingsSlices.ts`, `src/@types/loading/AssetKey.d.ts`. Tests: `tests/layers/localBubble/load/localBubbleAssetRows.test.ts`.

Template: `src/layers/filaments/` file for file; `ui` shape per `src/layers/flow/layer.ts`.

**Interfaces — Produces:**

```ts
// settings slice state (key: 'localBubble')
type LocalBubbleSettings = { enabled: boolean; intensity: number }; // defaults { true, 1 }, intensity clamped 0–2
// actions: setLocalBubbleEnabled(boolean), setLocalBubbleIntensity(number)
type LocalBubbleRuntime = { renderer: LocalBubbleRenderer; slot: AssetSlot<ShellMesh, void> };
```

Asset row: `key: 'localBubble'`, tier-agnostic request, `demand = settings.localBubble.enabled && |cameraPosMpc| < 0.020` (Mpc; the Sun is `RENDER_ORIGIN_MPC = [0,0,0]`, `src/data/renderOrigin.ts:27`, so distance is `|cameraPosMpc|`), `release = |cameraPosMpc| > 0.040`, priority below filaments' 80 ranking (it is a near-scale overlay; pick the next free rank and say which).

- [ ] Test `demands only when enabled and within 20 kpc`, `releases beyond 40 kpc, holds in between`.
- [ ] Scaffold. `create` builds the renderer, so this commit adds `render/localBubbleRenderer.ts` with `upload(mesh)`, `hasMesh()` and `destroy()` only (buffers, no pipeline, no draw); Task 6 adds the pipeline and draw. Each commit typechecks.
- [ ] Commit `feat(localbubble): layer scaffold, settings and distance-gated loading`.

### Task 6: renderer, shaders, pass, distance window

`review: yes` (shaders, TS↔WGSL contract)

**Files:** Create `src/layers/localBubble/render/localBubbleRenderer.ts`, `src/layers/localBubble/passes/localBubblePass.ts`, `src/layers/localBubble/present/localBubbleOpacity.ts`, `src/services/gpu/shaders/localBubble/vertex.wesl`, `src/services/gpu/shaders/localBubble/fragment.wesl`, `src/data/localBubble/shellVertexFormats.ts`, `tests/layers/localBubble/present/localBubbleOpacity.test.ts`. Modify `src/services/engine/presentation/scaleFadeBands.ts`, `src/services/engine/frame/frameOrder.ts:148-160`, `layer.ts` (`passes`).

**Contracts:**

```ts
// shellVertexFormats.ts
export const SHELL_VERTEX_FORMAT: Record<ShellMeshDtype, GPUVertexFormat> = { f16: 'float16x4', f32: 'float32x4' };
// scaleFadeBands.ts (Mpc; kpc = 1e-3)
localBubble:       { fullAt: 0.0015, goneAt: 0.0006 },
localBubbleRecede: { fullAt: 0.004,  goneAt: 0.010 },
// localBubbleOpacity.ts
export function localBubbleOpacity(camDistMpc: number, fadeAlpha: number, intensity: number): number;
//   fadeWindow([localBubble, localBubbleRecede], camDistMpc) * fadeAlpha * intensity
```

Uniform block (std140-style, 96 bytes):

| Offset | Field      | Type                                                                                     |
| ------ | ---------- | ---------------------------------------------------------------------------------------- |
| 0      | model      | mat4x4<f32> — `FRAME_TO_WORLD[frame] × translate(centrePc·PC_TO_MPC) × scale(PC_TO_MPC)` |
| 64     | tint       | vec3<f32>                                                                                |
| 76     | opacity    | f32                                                                                      |
| 80     | (reserved) | vec4<f32>                                                                                |

Camera: the NEAR0 view-projection and eye from the pass's frame context (see how `horizonShellPass.ts:52-66` and NEAR0 passes read `view.vp`, `slabs.ts:240`); the eye is Sun-relative.

Fragment: `pow(1 - abs(dot(normalize(N), normalize(V))), 3) * tint * opacity`, additive; normal renormalised per pixel. Fresnel line from `src/services/gpu/shaders/horizonShell/fragment.wesl`.

Pipeline: `ADDITIVE_BLEND` (`gpu/lib/blendStates`), **no depthStencil** (the `hdr` target has none, `renderTargets.ts:198-200`), `cullMode: 'none'`, vertex buffers from `SHELL_VERTEX_FORMAT[dtype]`, u32 indices.

Pass: `enabled = slot ready && localBubbleOpacity(...) > 0`; `'local-bubble'` added to the hdr NEAR0 roster after `'milky-way'`. Do not touch `foregroundChainOrder` or NEAR0's `distanceRangeM`.

- [ ] Test `localBubbleOpacity is 0 inside 0.6 kpc, 1 between 1.5 and 4 kpc, 0 beyond 10 kpc` (fadeAlpha 1, intensity 1) and `scales with intensity and fadeAlpha`.
- [ ] Implement renderer + shaders + pass + bands; `checkFrameOrder` passes at boot.
- [ ] Commit `feat(localbubble): the shell renderer, pass and distance window`.

### Task 7: toggle fade row

`review: yes` (Redux state, fade registry)

**Files:** Create `src/layers/localBubble/present/localBubbleFadeRows.ts`. Modify `src/@types/animation/FadeId.d.ts`, `src/services/animation/fadeRegistry.ts`, `src/services/engine/presentation/focusRecession.ts`, `src/services/engine/presentation/fadeIdToVisibilityKey.ts`, `src/@types/animation/VisibilityLayerKey.d.ts`, `src/data/animation/visibilityLayerRows.ts`, `src/services/animation/visibilityActionRow.ts`, `layer.ts` (`fades`), and the pass/opacity call site (feed `fadeAlpha`).

Pattern: `filaments` everywhere (grep `'filament'` / `filaments` in each file above). Fade kind `{ kind: 'localBubble' }`, row key `'localBubble'`, `seed: () => 0`, `intent: (s) => s.localBubble.enabled`, `guard: () => runtime.renderer.hasMesh()`.

- [ ] No new test: the tables are exhaustive `Record`s over the kind union, so the compiler catches a missed entry. Say so in the commit body.
- [ ] Commit `feat(localbubble): the toggle fade row`.

### Task 8: settings section

**Files:** Create `src/layers/localBubble/ui/LocalBubbleSectionContainer.tsx` (+ its `.module.css` if it needs one). Modify `layer.ts` (`ui: { settings: LocalBubbleSectionContainer }`).

Follow the `create-component` skill conventions; model on `src/layers/flow/ui/FlowSectionContainer.tsx`. Contents: a "Local Bubble" toggle bound to `enabled`, an intensity slider 0–2 (step 0.05) using the shared slider component the flow section uses.

- [ ] No new test (a two-control container); the manual smoke covers it.
- [ ] Commit `feat(localbubble): settings section`.

### Task 9: docs (controller, inline)

**Files:** `docs/DATA.md` (formats table row `SHEL` v1 → `shellMeshFormat.ts`; "Six formats"; layout line `local-bubble/v1/: local-bubble.shell`), PR #755 description (data + layer, the three open eye-check questions).

- [ ] Commit `docs(localbubble): DATA.md for the .shell format`.

---

## Definition of Done

**Deliverables**

- `fadeWindow`, `FRAME_TO_WORLD` (`src/data/frameToWorld.ts`) with a real galactic entry, `GAL_TO_EQ_*` exports.
- `shellMeshFormat.ts` encode/decode, `ShellMesh`/`ShellMeshDtype` types.
- `npm run build-local-bubble` writes `public/data/local-bubble/v1/local-bubble.shell` (~11 MB f16) and fails loudly if the chimney is not near galactic north; `allowDataFile` lists it.
- `src/layers/localBubble/` registered in the app composition, with its settings section.

**Manual smoke (user, after running the bake)**

- At Earth / solar-system scale: no shell, no `local-bubble` pass in the timings panel.
- Pull back past ~0.6 kpc: the shell fades in; full by ~1.5 kpc; the chimney opens toward galactic north (up out of the disk).
- Beyond ~4 kpc it recedes; gone by 10 kpc, and the pass stops running.
- Toggle off/on in the section: cross-fades, not a pop. Intensity slider scales brightness.
- Network: the `.shell` file is fetched only once the camera comes within 20 kpc.

**Deferred**

- Per-Tau Shell instance; the double-walled shell; SKMH / glTF consolidation; consolidating the 7 fade tables.
- Whether the shell reads against the Milky Way, the smoothing radius and the band edges: eye-tuning after landing, not DoD.
