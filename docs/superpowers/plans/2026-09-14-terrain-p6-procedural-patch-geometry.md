# Terrain P6 — procedural vertex-shader patch geometry

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the Earth surface-tile path draws every resident patch from one shared template mesh with **no vertex data at all** — positions computed in the vertex shader from a 64-byte per-patch instance record, one `drawIndexed(384, patchCount)` for the whole cut. The CPU mesh bake, its LRU cache and the 3–5 MB per-frame vertex upload are deleted. Landed at today's mesh resolution `n = 8`, **no displacement, no height, no edge collapse**: the picture must be like-for-like with `main` so the numerics are proven before displacement rides on them (spec §3.5 P6).

**Architecture:** `cutSurfaceTiles` stops emitting a corner **direction** (`originLocal`) and starts emitting the patch's **angular anchor** (`lon0Rad, lat0Rad, dLonRad, dLatRad`) — the f32 triple that is the CPU/GPU contract (§7.1). The renderer composes each patch's eye-relative origin in f64 from the **f32-rounded** anchor, writes one `PatchInstance` record per cut tile, and issues a single instanced indexed draw over a shared `(n+1)²`-vertex template. `@builtin(vertex_index)` supplies `i, j`; `@builtin(instance_index)` selects the record. The shader rebuilds the vertex offset with the spec's haversine small-angle form in the patch-local ENU frame, mirroring one pure TS util that the f64 ground-truth test exercises. `fragment.wesl` and `VSOut` are **unchanged** — this is a geometry-sourcing change only.

**Tech Stack:** unchanged. TS + WebGPU + WESL (`wesl-plugin` `?static` linking), Vitest, `npm run perf` (headless Chromium GPU-timing harness).

**Spec:** [`docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md`](../specs/2026-09-13-per-planet-terrain-design.md) — §3.1 (deleted/added lists), §3.4d, §3.5 P6, §7 intro + `PatchInstance`, §7.1 (position derivation + the CPU/GPU fround contract), §7.4, §10 (GPU line), §11 (the position-derivation test and the perf gate). §12 puts P6 in **its own PR**.

**Ground preparation:** spec §3, produced by `refactor-ground` and signed off 2026-09-13. P6 **is** a prep refactor. It must not depend on P1 (`BodySurface`), which is a separate PR: read the body radius the way the code reads it today (`EarthSurfaceTileDrawArgs.radiusM`, fed from `earthPass`), and do not introduce `datumRadiusM` as a plumbed field.

## Branch and PR

One branch off `main`, one PR, drafted at task 1. Do not rebase onto P1.

| Branch                      | Base   | Tasks |
| --------------------------- | ------ | ----- |
| `terrain-p6-patch-geometry` | `main` | 1–10  |

## Parallelism map

| Wave | Tasks (parallel) | Waits on                              |
| ---- | ---------------- | ------------------------------------- |
| 1    | 1                | — (must be first: it is the baseline) |
| 2    | 2, 3, 4          | 1                                     |
| 3    | 5                | 2, 3                                  |
| 4    | 6, 7             | 5 (7 also needs 3, 4)                 |
| 5    | 8                | 7                                     |
| 6    | 9                | 8                                     |
| 7    | 10               | 9                                     |

**Tasks 5–7 are an atomic trio for a runnable app.** The suite and `npm run typecheck` stay green at each of the three commits, but the WGSL struct, the shader and the renderer only agree again at the end of task 7 — land them back-to-back, never stop between them and hand over a branch that renders nothing.

## Global constraints

- `type` aliases only, never `interface`. **One function per file** under `src/utils/**`; **one type per file** under `src/@types/**`; filename = the exported symbol. Deep relative imports, no barrels. (`earthSurfaceTileLayout.ts` is an existing multi-export layout module — the `starCatalogLayout.ts` shape — and stays that way.)
- Files under `src/services/engine/frame/` (including `passes/`) export only the one symbol they are named for; helpers go to `src/utils/`, constants to `src/data/`. Task 7 deletes a module-level `let` from `earthPass.ts` under this rule.
- Comment budget: **module header ≤ 10 lines, comment lines ≤ half the code lines in the file.** Why, never what. A byte-layout contract file may exceed it and must say so in its first line. The three files this plan touches that today carry long derivation headers (`earthSurfaceTileRenderer.ts`, `io.wesl`, `vertex.wesl`) get **shorter**, not longer: most of what they explain — mesh expansion, `vertexBase` addressing, why instancing was impossible — stops being true.
- WESL: **no backticks in comments** (use single quotes), one `import` per identifier, all imports at the top of the file, the literal `package::` prefix. Explicit bind-group layouts, never `'auto'`. Every varying costs bandwidth — this plan adds none. Renormalize any direction after a rotation. `.claude/skills/wesl-shaders/SKILL.md` has the full list.
- **There is no offline WGSL compiler in this repo.** "The shader compiles" is only claimable from `createShaderModuleWithDevLog`'s dev-console output in a real browser (or a clean headless boot in `npm run perf`, which fails loudly on page errors). Never claim it from a green Vitest run — Vitest links the WESL as text and never reaches a WGSL parser.
- Inner loop `npm run typecheck:fast`; `tsc` (`npm run typecheck` / `npm run build`) is the gate. Suite green after every task. `npm run format` over touched files only, before each commit.
- Never `git add -A`. Never bare `git stash`. Commits are `type(scope): summary`, no `Co-Authored-By` trailer, no other attribution trailer.
- The dev server for this worktree is started with `npm run dev` and **left running**; read its `Local:` line for the port and pass that port to every `npm run perf` invocation as `--url http://localhost:<port>`. Omitting `--url` in a worktree silently measures whichever branch owns 5173.
- No file in this plan moves or is renamed on disk. Deletions are plain removals of whole files (`rm -f`), after `npm run refactor -- refs <symbol>` reports no remaining references. If any file ever does need to move, it goes through `npm run move-files -- <from> <to>` (`--dry` first), never `git mv` plus hand-edited imports.

---

### Task 1: capture the before-measurement and the before-picture

**Branch:** create `terrain-p6-patch-geometry` off `main`, open the PR as a draft. **No code changes in this task.**

This is the baseline for the §11 gate, and it can only be taken before the code moves.

- [ ] Start this worktree's dev server (`npm run dev`), note the port from its `Local:` line, and record that port at the top of the scratchpad file below — every later perf run uses it.
- [ ] `npm run perf -- --url http://localhost:<port> --scenario earth-surface --frames 30`, and the same for `--scenario solar-system`. Save both outputs verbatim to a scratchpad file (`perf-before.txt`); you cannot reconstruct them after editing.
- [ ] Record the four eye-check poses as before-shots (ask the user to look, or capture with the in-app still capture — do not guess at the picture): **orbit** (whole Earth, tiles engaged), **the 300 km base-globe fade band**, **Søndermarken at z19** (the deepest GeoDanmark band), and **a limb view** (patches against the horizon, where any patch-origin drift shows as a scalloped edge).
- [ ] Commit nothing. Report the MERGED medians for both scenarios into the ledger.

**Interpretation rules for every perf run in this plan:** quote MERGED medians only; never quote PER-LAYER rows as real costs (each carries 1–3 ms of instrumentation overhead — use the EST. PER-PASS FLOOR section for attribution); on Apple Silicon MERGED slot-sums are ~3× inflated and per-slot ms are ordinal, never additive. Run-to-run noise is ~0.5 ms at 30 frames.

---

### Task 2: `patchVertexOffsetM` — the position derivation, and its f64 ground-truth test

**Files:**

- New: `src/@types/scene/SurfacePatchAnchor.d.ts`
- New: `src/utils/scene/patchVertexOffsetM.ts`
- New: `tests/utils/scene/patchVertexOffsetM.test.ts`

**The type** (one type per file; angles in radians, `lat0/lon0` name the patch's **uv-origin corner**, which is its south-west corner — mesh `v` increases north while tile rows count south, the flip `cutSurfaceTiles` already applies):

```ts
export type SurfacePatchAnchor = {
  readonly lon0Rad: number; // longitude of the patch's u0 edge
  readonly lat0Rad: number; // latitude of the patch's v0 (SOUTH) edge
  readonly dLonRad: number; // longitude span, always > 0
  readonly dLatRad: number; // latitude span, always > 0
};
```

**The function** (one symbol; returns the vertex's offset from the patch origin, in the body's fixed axes, metres):

```ts
export function patchVertexOffsetM(
  anchor: Readonly<SurfacePatchAnchor>,
  radiusM: number,
  s: number, // template parameter along +east,  [0,1]
  t: number, // template parameter along +north, [0,1]
): Vec3;
```

**The derivation is spec §7.1, exactly** — with `dlon = s·dLonRad`, `dlat = t·dLatRad`, `lat = lat0Rad + dlat`, `R = radiusM` (the `h` terms of §7.1 are F2's and arrive with their own non-zero test — an always-zero parameter is untested surface):

```
hav_lon = 2·sin²(dlon/2)          // NEVER (1 − cos dlon)
hav_lat = 2·sin²(dlat/2)
cE = cos(lat)·sin(dlon)
cN = sin(dlat) + cos(lat)·sin(lat0)·hav_lon
cU = −hav_lat − cos(lat)·cos(lat0)·hav_lon
xE = R·cE
xN = R·cN
xU = R·cU
offset = xE·Ê + xN·N̂ + xU·Û
```

with the ENU frame at `(lon0, lat0)` in the body's fixed axes (`+Z` is the pole, longitude 0 on `+X`, the convention `equirectUvToDirection` fixes — `src/utils/math/equirectUvToDirection.ts:16-20`):

```
Ê = (−sin lon0,            cos lon0,           0      )
N̂ = (−sin lat0·cos lon0,  −sin lat0·sin lon0,  cos lat0)
Û = ( cos lat0·cos lon0,   cos lat0·sin lon0,  sin lat0)
```

One fact the header must record, because it looks wrong and would get "fixed" back: `1 − cos` is algebraically equal to the haversine form and catastrophically worse in f32 at small `dlon`. (F2 adds the second: `R` and `h` distributed, never summed — spec §7.1.)

- [ ] Add the test `patchVertexOffsetM matches an f64 absolute-direction reference at z19`. Reference (an independent formula, not the function under test): `R · (dir(lon0+dlon, lat0+dlat) − dir(lon0, lat0))` with `dir(lon, lat) = [cos lat·cos lon, cos lat·sin lon, sin lat]` in plain f64. Anchor: a z19 patch (`dLonRad = 2π/2^19`, `dLatRad = π/2^18`) near Søndermarken (`lon0 ≈ 12.52°`, `lat0 ≈ 55.66°`), `R = 6378137`, sampled at `(s,t) ∈ {(0,1), (1,0), (1,1), (0.5,0.5), (0.37,0.81)}`. Assert each component agrees to **≤ 1e-7 m**.
- [ ] Add the test `patchVertexOffsetM matches an f64 absolute-direction reference at z7`, same reference and samples, `dLonRad = 2π/2^7`, `dLatRad = π/2^6`, anchor at a mid-latitude corner. Assert **≤ 1e-6 m**.
- [ ] Add the test `patchVertexOffsetM returns exactly zero at the patch origin`: at `s = t = 0`, assert `Math.abs(c) === 0` for all three components (`toBe(0)` would reject the `−0` the `−hav_lat` term produces). This is what makes a patch corner land on the f64 origin **exactly**, which is the whole f32 argument.
- [ ] Implement. `npm test -- patchVertexOffsetM` → green. Commit.

**Why those tolerances, and what they do and do not prove.** The reference cancels two near-unit f64 vectors, so its own error floor is `2.2e-16 × R ≈ 1.4e-9 m` at any level; the thresholds sit ~70× above that floor and 50–20,000× **below** the f32 budget the spec derives for the GPU (≈ 6e-8 of patch extent: ~5 µm at z19, ~2 cm at z7). So a passing test proves the **algebraic identity** — the small-angle form is the same surface as the absolute one — and a wrong formula (a dropped `hav_lon` term, a swapped `sin lat0`, the forbidden `R + h` unit-vector shape) fails it by orders of magnitude, not by a near-miss. It does **not** prove the shader's f32 error; nothing in TS can, and simulating f32 intermediates would test a transcription rather than the shader. The shader's numerics are gated by task 9's eye-check, the limb pose in particular.

**TS ↔ WGSL parity** is kept honest the only way available here: task 6's `patchVertexOffset` in WGSL is written line-for-line against this function, same variable names and same order, and each file's header names the other as its twin. There is no WGSL test runner; do not invent one.

---

### Task 3: the patch anchor — emitted by the walk, consumed as the f64 origin

**Files:**

- New: `src/utils/scene/surfacePatchAnchor.ts`, `src/utils/scene/patchOriginRelEyeM.ts`
- New: `tests/utils/scene/patchOriginRelEyeM.test.ts`
- Modify: `src/@types/scene/SurfaceCutTile.d.ts`, `src/utils/scene/cutSurfaceTiles.ts` (the cut push, `:250-256`)
- Modify (fixtures only): `tests/services/engine/frame/passes/earthPass.test.ts:597,708`, `tests/services/engine/subsystems/earthTileSubsystem.test.ts:292,415`

**Signatures:**

```ts
// surfacePatchAnchor.ts — uv footprint → angles, the ONE place the equirect
// registration (TEXTURE_PRIME_MERIDIAN_U) enters the patch path.
export function surfacePatchAnchor(
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): SurfacePatchAnchor;

// patchOriginRelEyeM.ts — the CPU/GPU contract of spec §7.1.
export function patchOriginRelEyeM(
  anchor: Readonly<SurfacePatchAnchor>,
  radiusM: number,
  eyeRelBodyM: Readonly<Vec3>,
): Vec3;
```

**The contract `patchOriginRelEyeM` exists to hold (spec §7.1):** `Math.fround` `radiusM`, `lon0Rad` and `lat0Rad` **first**, derive the f64 unit direction from the **rounded** angles, scale by the **rounded** radius, subtract the eye in f64, return f64. The f32 triple is the contract and f64 is downstream of it, never parallel to it. If the CPU derives the origin from the unrounded `lat0` while the shader derives its frame from `f32(lat0)`, every patch shifts coherently by ~0.13 m, differently per patch — which is cracks.

The other half of the contract needs no discipline and the header should say why: `DataView.setFloat32` performs exactly the same rounding, so the record's `lon0Rad`/`lat0Rad` and the uniform's `radiusM` carry the identical f32 words this function rounded to, whatever the caller passes.

**`SurfaceCutTile.originLocal: Vec3` → `anchor: SurfacePatchAnchor`.** The direction is now derivable from the anchor and must not survive beside it: two parallel statements of the same corner, one rounded and one not, is precisely the drift §7.1 warns about. The walk already has `u0/u1/v0/v1` at the push site (`cutSurfaceTiles.ts:133-141, 250-256`); it calls `surfacePatchAnchor` there. `equirectUvToDirection` stays — the walk still uses it for centres and corners.

- [ ] Add the test `patchOriginRelEyeM lands on the uv corner direction the walk's own convention names`: for a z0 tile's `[u0, v0]`, `patchOriginRelEyeM(surfacePatchAnchor(u0, v0, u1, v1), 1, [0,0,0])` equals `equirectUvToDirection([u0, v0])` to within f32 rounding (1e-7). This is the one test standing between this rewrite and a 180°-rotated Earth — the `TEXTURE_PRIME_MERIDIAN_U` landmine, whose other three sites are listed in `src/data/bodies/texturePrimeMeridianU.ts`.
- [ ] Add the test `patchOriginRelEyeM composes from the f32-rounded anchor, not the f64 one`: pick a `lat0`/`radiusM` that are not f32-exact, assert the result equals the composition from `Math.fround`ed inputs and **differs measurably** from the unrounded composition (the ~0.13 m coherent shift). A test that passes either way is not testing the contract.
- [ ] Implement both utils, reshape `SurfaceCutTile`, update the walk and the four test fixtures. `npm test` → green. Commit.

---

### Task 4: the shared template index buffer

**Files:**

- New: `src/utils/scene/surfacePatchIndices.ts`, `tests/utils/scene/surfacePatchIndices.test.ts`

**Signature:** `export function surfacePatchIndices(resolution: number): Uint16Array`

`resolution² × 6` indices over an `(resolution+1)²` vertex grid addressed `vid = j·(resolution+1) + i`. At `n = 8` that is 81 vertices and 384 indices, so `'uint16'` is the index format (81 ≪ 65536) and the buffer is 768 B, created once and shared by every patch, level and body. The quad order is `bakeSurfaceTileMesh.ts:71-84`'s: `p00, p10, p01` then `p10, p11, p01`, which is CCW-outward for `u = east`, `v = north` and matches the pipeline's `frontFace: 'ccw'` + `cullMode: 'back'`.

- [ ] Add the test `surfacePatchIndices winds every triangle CCW in the (i, j) parametric plane`: for each triangle, the z-component of `(p1 − p0) × (p2 − p0)` in `(i, j)` coordinates is `> 0`. This is the one silent failure mode — a flipped winding culls the entire cut and shows up only as "the tiles vanished", with no error anywhere.
- [ ] Add the test `surfacePatchIndices covers the grid`: length is `6·n²` and no index exceeds `(n+1)² − 1`.
- [ ] Implement. `npm test -- surfacePatchIndices` → green. Commit.

---

### Task 5: the `PatchInstance` record — WGSL struct, CPU writer, parity

**Files:**

- Modify: `src/services/gpu/shaders/bodies/earthSurfaceTile/io.wesl`, `src/services/gpu/renderers/bodies/earthSurfaceTileLayout.ts`, `tests/services/gpu/renderers/bodies/earthSurfaceTileLayout.test.ts`

`struct NodeParams` → `struct PatchInstance`; `struct TileVertex` **deleted** along with `TILE_VERTEX_BYTES` and `writeTileVertex`. `VSOut` is untouched.

**Byte layout — 64 B stride, zero padding. The declaration order is load-bearing:**

| off | size | WGSL type   | field           | source                                                  |
| --- | ---- | ----------- | --------------- | ------------------------------------------------------- |
| 0   | 12   | `vec3<f32>` | `originRelEyeM` | `patchOriginRelEyeM(tile.anchor, radiusM, eyeRelBodyM)` |
| 12  | 4    | `f32`       | `fadeWeight`    | the existing crossfade weight, unchanged                |
| 16  | 4    | `f32`       | `lon0Rad`       | `tile.anchor`                                           |
| 20  | 4    | `f32`       | `lat0Rad`       | `tile.anchor`                                           |
| 24  | 4    | `f32`       | `dLonRad`       | `tile.anchor`                                           |
| 28  | 4    | `f32`       | `dLatRad`       | `tile.anchor`                                           |
| 32  | 16   | `vec4<f32>` | `albedoRect`    | `(atlasUvOrigin.x, .y, atlasUvScale.x, .y)`             |
| 48  | 16   | `vec4<f32>` | `fallbackRect`  | the resolved ancestor's rect, same flattening as today  |
|     |      |             |                 | **stride 64**                                           |

`fadeWeight` sits at 12 to fill the `vec3`'s alignment pad, and both `vec4`s come last: move `fadeWeight` after `dLatRad` and the first `vec4` is pushed to 48, the struct to 80 B, and every patch reads the wrong bytes with no compiler signal (spec §7's note that the field order matters).

**Writer:**

```ts
export const PATCH_INSTANCE_BYTES = 64;

export function writePatchInstance(
  view: DataView,
  base: number,
  originRelEyeMX: number,
  originRelEyeMY: number,
  originRelEyeMZ: number,
  fadeWeight: number,
  lon0Rad: number,
  lat0Rad: number,
  dLonRad: number,
  dLatRad: number,
  albedoUvOriginX: number,
  albedoUvOriginY: number,
  albedoUvScaleX: number,
  albedoUvScaleY: number,
  fallbackUvOriginX: number,
  fallbackUvOriginY: number,
  fallbackUvScaleX: number,
  fallbackUvScaleY: number,
): void;
```

Every write stays a hand-literal `view.setFloat32(base + N, expr, true)` — the parity test parses these literals mechanically and a loop defeats it.

**This is spec §7's record, minus F2's two fields.** Two things the `io.wesl` header must record: `datumRadiusM` is deliberately not in the record — it is the per-draw uniform `SurfaceTileUniforms.radiusM` (offset 76), one engaged body per draw (spec §3.4f), and because both paths reach the GPU through an f32 write the uniform carries the identical word `patchOriginRelEyeM` rounded to; and `fallbackRect` is required because the shipped fragment crossfades two rects (`fragment.wesl:102-106`) and P6 must not change the picture.

Do **not** add `heightSlotOrigin` or `edgeCoarser`. They are F2's, they have no reader in P6, and an unused field is a claim the reviewer has to check.

- [ ] Rename `SurfaceTileUniforms.vertsPerTile` (u32, offset 92) to `meshResolution` — same slot, same type, new meaning: the template's `n`, which the vertex shader needs to split `vertex_index`. No byte moves. `SURFACE_TILE_UNIFORM_BYTES` stays 176.
- [ ] Update the parity test: rename its `NodeParams` describe to `PatchInstance`, delete the `TileVertex` describe, and extend the `fieldOf` map so each writer argument maps to its struct field (`albedoUvOrigin[XY]`/`albedoUvScale[XY]` → `albedoRect`, likewise `fallbackRect`, `originRelEyeM[XYZ]` → `originRelEyeM`, `vertsPerTile` → `meshResolution`).
- [ ] `npm test -- earthSurfaceTileLayout` → green (`PATCH_INSTANCE_BYTES === 64` falls out of the struct walk, it is not asserted as a literal). Commit.

**Why this parity test earns its keep** (it looks like a constant restatement and is not): it is the only cross-check between a WESL declaration and a TS byte offset. A field reorder on one side alone scrambles every drawn patch, and WebKit rejects a mislaid layout that Chrome's Tint tolerates — the failure mode is "iOS presents nothing, no error".

---

### Task 6: the vertex shader

**Files:**

- Modify: `src/services/gpu/shaders/bodies/earthSurfaceTile/vertex.wesl`

Storage binding 2 (`array<TileVertex>`) is gone; binding 1 becomes `array<PatchInstance>`.

**Addressing** (spec §7): `let row = u.meshResolution + 1u; let i = vid % row; let j = vid / row;` with `vid = @builtin(vertex_index)` — under an indexed draw that builtin is the **index-buffer value**, i.e. the template vertex id, which is exactly what the template addressing wants. `let patch = patches[instanceIndex];` with `instanceIndex = @builtin(instance_index)`.

**Body:** `s = f32(i) / f32(u.meshResolution)`, `t = f32(j) / f32(u.meshResolution)`; `patchVertexOffset` transcribed line-for-line from task 2's TS util (no `h` — F2 adds displacement); `worldPosRelCam = patch.originRelEyeM + offset`.

**Everything downstream stays as it is today**, and the header must say so, because each of these looks like an easy improvement:

- `out.uv = vec2<f32>(s, 1.0 - t)` — image-space v, north at the top of the slot (`bakeSurfaceTileMesh.ts:56-59`). The atlas rect is applied in the fragment, unchanged.
- `out.tangent = vec3<f32>(-sin(lon), cos(lon), 0.0)` with `lon = patch.lon0Rad + s·patch.dLonRad` — the same latitude-independent unit-east tangent the bake wrote per vertex (`bakeSurfaceTileMesh.ts:61-64`), now derived.
- `out.normalLocal` keeps **today's** reconstruction, `worldPosRelCam + u.camPosRelBodyM` (rotated by the inert `rotCol0/1/2`). Deriving the exact unit direction from `(lon, lat)` would be more accurate and costs three more trig calls — and it would change the shading in a task whose gate is "like-for-like". It belongs to F2, where the normal comes from the height field anyway (spec §7.2).
- `out.viewDirLocal`, the rects and `fadeWeight` pass through unchanged; the rects unpack from `patch.albedoRect.xy/.zw` and `patch.fallbackRect.xy/.zw`.
- `rotCol0/1/2` stay applied and stay the identity under the body-slab frame (`io.wesl`'s `SurfaceTileUniforms` header) — this is not the task that removes them.

- [ ] Rewrite the shader and cut the header down: the mesh-expansion, `vertexBase` and "instancing is impossible" paragraphs describe code that no longer exists. What replaces them is short — where `i, j` come from, that `originRelEyeM` is f64-differenced CPU-side, and that `patchVertexOffset` is the twin of `src/utils/scene/patchVertexOffsetM.ts`.
- [ ] Single quotes in comments, imports at the top, one import per identifier, `package::` prefix.
- [ ] `npm run typecheck` green. The shader is **not** verified here — task 7 is the first point it can be. Commit.

---

### Task 7: the renderer — one instanced indexed draw

**Files:**

- Modify: `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts`, `src/@types/rendering/EarthSurfaceTileRenderer.d.ts`, `src/services/engine/frame/passes/earthPass.ts`

**What changes** (`earthSurfaceTileRenderer.ts`):

- Constructor drops the `meshCache: SurfaceTileMeshCache` parameter; `resolution` stays (it is `n`, and it feeds both the index buffer and `meshResolution`).
- Build the index buffer **once**, at construction: `surfacePatchIndices(resolution)`, `GPUBufferUsage.INDEX | COPY_DST`, uploaded once, destroyed in `destroy()`. `indexCount = resolution * resolution * 6`.
- Bind-group layout: binding 1 becomes `read-only-storage` with `minBindingSize: PATCH_INSTANCE_BYTES`; **binding 2 is removed and bindings 3–9 keep their numbers** (the fragment's bindings must not move — bindings need not be contiguous).
- One grow-only storage buffer and one scratch `ArrayBuffer`, both sized `tileCount * PATCH_INSTANCE_BYTES`. `vertexScratch`, `tileVertsBuffer`, `vertsPerTile` and the per-corner expansion loop all go.
- Per tile: `patchOriginRelEyeM(tile.anchor, radiusM, eyeRelBodyM)` then one `writePatchInstance`. The fade weight logic and its `nowMs`-sampled-once-per-draw rule are unchanged (`:249-267`).
- Draw: `pass.setIndexBuffer(indexBuffer, 'uint16')` then `pass.drawIndexed(indexCount, tileCount)`.
- `depthCompare: resolveDepthCompare('nearer-or-equal', reversedZ)` is **unchanged** — the tie with the base globe's nominal radius still exists without displacement (`:29-33, :157`; spec §7.4 only breaks that tie once displacement lands, and the base-globe shrink is F2's).

**What changes elsewhere:**

- `EarthSurfaceTileDrawArgs.frame` is deleted — its only consumer was the mesh cache's LRU stamp.
- `earthPass.ts`: drop `frame: ++earthFrameCounter` from the draw args and delete the module-level `earthFrameCounter` and its 7-line comment (`:102-108, :241`). A pass file declares only its own symbol.
- `src/services/engine/gpuHandles/gpuHandleRegistry.ts:426-440`: drop the `createSurfaceTileMeshCache(...)` argument and the two now-unused imports; the row keeps `EARTH_SURFACE_TILE_MESH_RESOLUTION` as the last argument, and its "the mesh cache is constructed here" comment goes with the cache.

- [ ] Rewrite the renderer's module header to the ≤ 10-line budget. Three of its five paragraphs (mesh expansion, why not instanced, the mesh cache) describe deleted code. What must survive: the `'nearer-or-equal'` tie with the base globe, and that this renderer owns neither the atlas nor the base globe's maps.
- [ ] `npm test && npm run typecheck` green.
- [ ] **Verify the shader actually compiles**: with the dev server running, put the camera near Earth so tiles engage, and confirm the dev console shows no `createShaderModuleWithDevLog` compile error and no `Invalid ShaderModule` / `Invalid RenderPipeline` cascade. A black or empty NEAR0 slab with a moving camera is the signature of a rejected module, not of a missing cut.
- [ ] Commit.

---

### Task 8: delete the CPU mesh path

**Files (all deletions):** `src/utils/scene/bakeSurfaceTileMesh.ts`, `src/services/gpu/resources/surfaceTileMeshCache.ts`, `src/@types/scene/SurfaceTileMesh.d.ts`, `tests/utils/scene/bakeSurfaceTileMesh.test.ts`, `tests/services/gpu/resources/surfaceTileMeshCache.test.ts`. **Modify:** `src/data/bodies/earthTileParams.ts`.

- [ ] `npm run refactor -- refs bakeSurfaceTileMesh`, and the same for `createSurfaceTileMeshCache`, `SurfaceTileMesh`, `SurfaceTileMeshCache`, `EARTH_SURFACE_TILE_MESH_CACHE_CAPACITY` — every one must report only its own definition and the sites this task deletes. Then remove the five files (`rm -f`).
- [ ] Delete `EARTH_SURFACE_TILE_MESH_CACHE_CAPACITY` (`earthTileParams.ts:58-66`). **Keep `EARTH_SURFACE_TILE_MESH_RESOLUTION`** — it is `n`, and F2 raises it to 64 — but rewrite its doc comment: it no longer describes a bake grid or a per-frame re-upload; it is the template's subdivision per patch edge, and geometry density is now independent of the height data's density (spec §7).
- [ ] `npm test && npm run typecheck` green; grep the repo for `TileVertex`, `vertsPerTile`, `SurfaceTileMesh` and confirm only intentional hits remain (WESL string paths and `.wesl` text are outside the refactor CLI's reach). Commit.

---

### Task 9: the gate — perf after, eye-check after

**No code changes** unless the gate fails.

- [ ] Confirm the dev server picked up the shader and renderer edits (HMR line in its output, or restart it — a stale server measures the old pipeline).
- [ ] `npm run perf -- --url http://localhost:<port> --scenario earth-surface --frames 30` and `--scenario solar-system`, **same flags as task 1**. Save to `perf-after.txt`.
- [ ] Compare MERGED medians against task 1. If any scenario is worse by more than run-to-run noise (~0.5 ms at 30 frames), raise `--frames` and re-measure before drawing a conclusion; if the regression holds, consider a paired-baseline A/B (alternate A-B-A-B across two dev servers) before attributing it, since thermal drift over a long task is real.
- [ ] Eye-check the same four poses from task 1 — **orbit, the 300 km fade band, Søndermarken z19, a limb view** — against the before-shots. What to look for, in order of what this change can break: patches missing entirely (winding or index format), a 180° or hemisphere-flipped surface (the anchor convention), hairline seams between neighbouring patches at z19 (the fround contract), a scalloped or beaded limb (patch-origin drift), faceting or shading that differs from before at the fade band (the normal/tangent derivation), and the crossfade still running when a deep tile lands.
- [ ] Report both the numbers and the eye-check verdict.

**The halt rule, verbatim from spec §11 and §3.5:** `npm run perf` runs before and after P6, with the worktree's own `--url`. **A neutral-or-negative measurement halts the pipeline and the land/park call is the user's.** Do not land on process momentum, and do not go looking for a compensating optimization inside this PR — report and stop.

---

### Task 10: documentation

**Files:** `docs/RENDERER.md`, `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md`

- [ ] `RENDERER.md`'s "Earth surface virtual texture" bullet (`:14`) and the matching "Things that have bitten us" entry (`:27`) both describe `earthSurfaceTileRenderer` as drawing "instanced, camera-relative **curved meshes**". Replace with what it does now: one shared template addressed off `vertex_index`, per-patch records off `instance_index`, one `drawIndexed` for the cut, positions derived in the vertex shader from the patch anchor, no vertex data and no per-frame vertex upload. Keep the `'nearer-or-equal'` tie sentence — it is still true and still load-bearing.
- [ ] Spec §3.1's deleted list becomes fact for four of its five entries. Mark P6 landed in §3.5 and §12. §7 already prints this record as the first 64 B of F2's 80 B — do **not** rewrite it.
- [ ] Commit.

---

## Definition of Done

**Deliverable inventory**

- New: `src/@types/scene/SurfacePatchAnchor.d.ts`; `src/utils/scene/{patchVertexOffsetM,surfacePatchAnchor,patchOriginRelEyeM,surfacePatchIndices}.ts`; tests for `patchVertexOffsetM`, `patchOriginRelEyeM`, `surfacePatchIndices`.
- Deleted: `src/utils/scene/bakeSurfaceTileMesh.ts`, `src/services/gpu/resources/surfaceTileMeshCache.ts`, `src/@types/scene/SurfaceTileMesh.d.ts`, their two test files, `EARTH_SURFACE_TILE_MESH_CACHE_CAPACITY`, the WESL `TileVertex` struct, `TILE_VERTEX_BYTES` / `writeTileVertex`, the `array<TileVertex>` storage buffer and its per-frame `writeBuffer`, `vertexScratch`, `EarthSurfaceTileDrawArgs.frame`, `earthPass.ts`'s `earthFrameCounter`.
- Kept: `EARTH_SURFACE_TILE_MESH_RESOLUTION = 8` (it is `n`), the `'nearer-or-equal'` depth compare, `fragment.wesl` and `VSOut` byte-for-byte.
- The `PatchInstance` record is 64 B with the offsets in task 5's table, and `earthSurfaceTileLayout.test.ts` cross-checks it against `io.wesl`.
- The whole cut draws in **one** `drawIndexed(384, patchCount)` off one shared 768-byte index buffer.

**Named observable behaviours** (the four poses, before vs after, compared against task 1's shots)

- Orbit: the detail patches cover the visible cap with no gaps, no flipped hemisphere, and no patch missing.
- The 300 km fade band: the base globe fades out under the patches exactly as before — no punch-through, no z-fight, no shading step at the handover.
- Søndermarken at z19: no hairline seams between neighbouring patches, and a freshly-landed tile still crossfades in over its coarser ancestor.
- Limb view: the horizon edge is smooth — no scalloping, beading or per-patch offset along the silhouette.

**The perf gate**

- `npm run perf` was run before (task 1) and after (task 9) on **this worktree's** dev server via `--url`, same scenarios and same flags, with MERGED medians quoted and recorded in the PR.
- A neutral-or-negative measurement halts the pipeline; the land/park call is the user's, never process momentum.

**Deferral boundary — none of this is P6**

Displacement (the `h` terms of §7.1); height tiles, the height atlas, `decodeHeightTile`, `heightTileFormat`; height-derived fragment normals; edge collapse and `edgeCoarser`; the walk's 2:1 balance constraint and the terrain-aware horizon cap; `n = 64`; the base-globe shrink to `datumRadiusM + reliefM[0]`; `BodySurface` / the `radiusM` split (P1, its own PR); the tile stack's de-Earthing (P2–P5, F1). If a task finds itself reaching for one of these, it has gone out of scope — stop and report.
