# Terrain F2 — displacement, normals, edge collapse, base-globe shrink

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execution follows the lean protocol in `docs/superpowers/conventions/sdd-execution.md`.

**Goal:** Earth's surface patches stop being a sphere. The template mesh goes from `n = 8` to `n = 64`, each of its 65×65 vertices reads its own post out of F1's `r32float` height atlas with `textureLoad`, and the vertex stage applies spec §7.1's distributed `R·c + h·c (+ h on Û)` form — never the f32 sum `R + h`. Neighbouring patches at different levels stitch with an **edge collapse** (odd template index snaps to the even neighbour), band seams — the multi-level steps the 2:1 balance may not cross — get a **skirt**, the fragment stage takes its normal from the height cell's own four posts instead of the whole-globe normal map, and the base globe is drawn at `datumRadiusM + reliefM[0]` so terrain below the datum can never be occluded by it. F1 already put everything this needs in the cut; F2 is a renderer-and-shader PR.

**Architecture:** the cut's per-edge state becomes one 3-valued code (same-or-finer / one level coarser / more than one level coarser), `PatchInstance` grows from 64 B to its full 80 B with `heightSlotOrigin` + `edgeCoarser`, and the height atlas binds at the pipeline's free binding 2, visible to **both** stages. `vertex.wesl` grows a post lookup, a collapse snap and a skirt ring; `fragment.wesl` swaps `perturbNormal(normalTexture)` for the bilinear cell's own gradient. Three prod-less TS twins (`surfacePatchPostIndex`, `collapseTemplateIndex`, `surfaceNormalFromHeightCell`) state the WGSL contracts in a form tests can reach — the `patchVertexOffsetM` precedent P6 set. Nothing on the bake, stream, walk or manifest side changes: **no re-bake, no manifest touch, no new data**.

**Tech Stack:** unchanged. TS + WebGPU + WESL, Vitest. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md`](../specs/2026-09-13-per-planet-terrain-design.md) — §3.4d (procedural VS geometry, the price P6 paid), §5.2 (a leaf's height tile is its own, never an ancestor's), §5.3 (`shgt1`: 129² f32 posts, north row first), §5.5 (`r32float` atlas, slot stride 129, `textureLoad` + manual bilinear — three reasons), §6 (walk, drawability, the R12 balance amendment), §7 whole (the 80-byte record), §7.1 (position derivation + the `fround` contract), §7.2 (fragment normals), §7.3 (crack accounting + the R12 skirt amendment), §7.4 (base globe at `datumRadiusM + reliefM[0]`), §10 (`n = 64` → 1.19 m posts at z19; geometry LOD vs shading LOD), §11 (tests), §12 row F2.

**Ground preparation:** spec §3, produced by `refactor-ground` 2026-09-13. P1 (#704), P6 (#705) and F1 (P2–P5 + the height product) are landed. **None needed beyond them** — F1's two-product cut, `edgeCoarser` bits, `heightSlot` and `getHeightAtlasView()` exist precisely so F2 has joints to grow into, and the one shape change F2 does make (the per-edge code) is a two-line widening of a field F1 introduced for this consumer.

## Rulings made at plan time (do not re-open; the final review checks against these)

| #     | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2-R1 | **One 3-valued code per edge, in the existing `edgeCoarser` field** — `0` neighbour at the same level or finer or absent, `1` exactly one level coarser (collapse), `2` coarser by more than one level (skirt) — packed 2 bits per edge into the record's `u32`. NOT a second `edgeSeam` bit field. **Amended R14:** the comparison is on HEIGHT levels, not leaf levels, and the collapse is a doubled-stride sample rather than an index snap. **Amended R15:** back to ONE bit per edge — the lattice step alone; the 3-valued form and code 2 are gone, because the mesh step it stood for is the skirt's job. **Flagged for the user.** | Two parallel bit arrays admit a state that cannot exist (collapse AND skirt on one edge) and split one fact — how far the neighbour steps up — across two fields the shader would have to keep consistent. Cost if wrong: one element type and ~20 lines in `balanceSurfaceCut`. |
| F2-R2 | **The skirt is always present in the geometry**: the template carries a `4·(n+1)`-vertex ring. **Amended R15:** its depth is non-zero on every edge unconditionally — the cut's MESH levels are not balanced, so any edge can be a T-junction — and both sides of a seam draw one, which is harmless (the walls face inward). One index buffer, one draw, one pipeline for every patch.                                                                                                                                                                                                                                                      | A per-patch index-buffer choice means a draw call per patch, which is exactly what P6 deleted. Zero-depth quads are degenerate and cost a cull. The coarse side sees the fine side as "finer" (code 0), so only the fine side ever draws a skirt — no double wall.               |
| F2-R3 | **Amended R15 (drawn on every edge, not only band seams); depth = `SURFACE_TILE_SKIRT_DEPTH_FRACTION` (0.05) × the patch's north–south extent** (`radiusM · dLatRad`): 15.6 km at z7, 245 m at z13, 3.8 m at z19. Applied as `h − depth` at the ring's boundary post, so the skirt hangs radially inward and is the same position formula, not a second one. **Flagged for the user** (tunable at the eye-check).                                                                                                                                                                                                                            | The true gap is the coarse neighbour's `geometricResidualM`, which the fine side cannot read — F2 carries no neighbour data beyond the edge code. A constant, so tuning it is neither a re-bake nor a format change.                                                             |
| F2-R4 | **Earth's `reliefM` becomes `[-430, 8849]`** — a literal in `sceneEarth.ts` carrying a "F3 replaces this from the compiled §3.4e grid" line. **Flagged for the user**; the alternative, if zero change outside §7.4 is wanted, is `[-430, 0]`.                                                                                                                                                                                                                                                                                                                                                                                               | §7.4 needs `reliefM[0]`; a `[-430, 0]` half-truth is the same lie F3's horizon cap would then inherit. Blast radius is every reader of the two bounds, all under 0.15 % — named in Task 7 so the reviewer can check each.                                                        |
| F2-R5 | **Only the BASE globe shrinks.** The tile draw's `radiusM` uniform, the tile planner's `mvpLocal`, and the body-slab pick sphere all stay on `datumRadiusM`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Heights are defined against the datum (§5.3) — a tile drawn against any other radius displaces off the wrong sphere. F3's `raycast` replaces the pick sphere anyway.                                                                                                             |
| F2-R6 | **`npm run perf` is a USER-RUN step (Task 9).** No agent runs the harness, before or after.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | The user's standing instruction. §11 still wants the measurement after displacement lands; the user runs it in this worktree with its own `--url`.                                                                                                                               |
| F2-R7 | **The TS twins (`latticeHeightSample`, `surfaceNormalFromHeightCell`; `surfacePatchPostIndex` and `collapseTemplateIndex` were retired by R14) have no production caller by design** and exist as the testable statement of a WGSL contract, each named in its WESL counterpart's comment as the twin.                                                                                                                                                                                                                                                                                                                                       | P6's `patchVertexOffsetM` set the precedent and the bug class is real: an index flip or a sign flip in these three is silent in a screenshot and structural in the picture. A deletion audit must not read them as dead.                                                         |

## Branch and PR

Branch `terrain-f2-displacement` off **`terrain-f1-height-products`** (F1, in review), its own worktree. Draft PR opened after dispatch 1's first commit with `gh pr create --draft --base terrain-f1-height-products`; it is a **stacked PR** and must be rebased onto `main` only after F1 squash-merges (never merge from the worktree; fetch + rebase at a dispatch boundary, not mid-task). `public/data` is symlinked to main's, as F1's worktree is — the height tiles the eye-check needs are the ones F1's bake produced; F2 bakes nothing. Note this worktree's dev-server port from its `Local:` line; the perf run and the eye-check both need it.

## Dispatch grouping (controller)

| Dispatch | Tasks | Model  | Why grouped                                                                                                     |
| -------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------- |
| D1       | 1–2   | Opus   | the contract the shader will read: the cut's edge code and the 80-byte record. No picture change lands in D1.   |
| D2       | 3–6   | Opus   | the shader itself — one file set (`vertex.wesl`, `fragment.wesl`, `io.wesl`, the three twins), one mental model |
| D3       | 7–8   | Sonnet | base globe + docs; touches neither the shader nor the cut                                                       |
| —        | 9     | user   | eye-check at four poses + the perf measurement (F2-R6)                                                          |

Every task in D1 and D2 is tagged `review: yes`; those tags **collapse to one review per dispatch** (the dispatch's whole diff, given the tasks' contracts and the named spec sections), not one per task — then one final whole-branch review after D3. Two mid-branch reviews, one final, no re-reviews.

## Global constraints

- `type` aliases only, never `interface`. One function per file under `src/utils/**`, filename = the symbol. Deep relative imports, no barrels.
- Files under `src/services/engine/frame/` (incl. `passes/`) export **only** their one named symbol — `earthPass.ts` already carries two (`earthPass`, `prepareBodySurfaceFrame`) under the ratchet's allow-list; Task 7 must not add a third.
- Comment budget: module header ≤ 5 lines, comment lines ≤ half the code lines, why never what. `io.wesl` and `earthSurfaceTileLayout.ts` are byte-layout contracts and may exceed it — they already say so in their first lines; keep those headers current with the new fields rather than appending to them.
- **Shader work** (Tasks 2–6): invoke the `wesl-shaders` skill before the first `.wesl` edit; run the tint probe after **each** WGSL change, and never start a probe while one is running. No backticks in WGSL comments. Landmines that apply directly here:
  - `package::` imports resolve only through the symlink **at the leaf** of the shader directory, and `?static` + `package::` is the combination that silently yields an unlinked module — if a new WESL file seems necessary, stop and report rather than adding one (F2 needs none: every new constant goes into `vertex.wesl` / `fragment.wesl` themselves).
  - a duplicate `@builtin(position)` in an inter-stage struct is a **runtime-only** failure — Tint accepts it, the frame just stops presenting. `VSOut` gains two `@location`s in Task 6; do not touch its `clip` field.
  - the explicit bind-group layout is mandatory: `layout: 'auto'` silently renumbers groups. This pipeline already builds one by hand — extend it.
  - `r32float` bound for `textureLoad` needs `texture: { sampleType: 'unfilterable-float' }` in the layout entry. `'float'` fails validation unless the optional `float32-filterable` feature is requested, and `device.ts` does not request it (`sgrAStarLensingRenderer.ts` records the same trap).
  - every varying is bandwidth. F2 adds exactly two, both `@interpolate(flat)`; a third needs a reason in the commit message.
  - `wgpu-matrix` is f64 and dst-last; renormalize any vector that has been through an inverse-model transform before using it as a direction.
- Inner loop `npm run typecheck:fast`; `tsc` is the gate via `npm run build`. Targeted tests per touched file; **CI is the gate** — no full-suite run per agent, no verification agent. `npx prettier --write` the files you touched. Stage by path, never `git add -A`. One commit per task, `type(scope): summary`.
- No `public/data` writes, no bake, no `npm run perf` (F2-R6), and the dev server stays running.

---

### Task 1: the cut's per-edge state becomes a 3-valued code

**review: yes** (the walk's contract with the shader).

**Files:** `src/@types/scene/SurfaceCutTile.d.ts`, `src/utils/scene/balanceSurfaceCut.ts`, `src/utils/scene/cutSurfaceTiles.ts` (the `NO_COARSER_EDGES` literal's type), `tests/utils/scene/balanceSurfaceCut.test.ts`.

**Contract:**

```ts
// SurfaceCutTile
/** Per edge, in R9 order [west, east, south, north], how far the neighbouring
 *  leaf steps UP: 0 = same level, finer, or no neighbour; 1 = exactly one level
 *  coarser (F2 collapses that edge onto the coarse neighbour's posts);
 *  2 = coarser by more than one level — a band seam the 2:1 balance may not
 *  cross (spec §6 R12), which F2 hides with a skirt and never collapses. */
readonly edgeCoarser: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2];
```

The fill loop at `balanceSurfaceCut.ts:106-128` already has everything: `coveringLeaf` returns the leaf covering the neighbour cell, `null` when something **finer** covers it — so the coarse side of any step keeps `0` and only the fine side carries a code. Replace the `other.id.z === z - 1` test with `other.id.z < z ? (z - other.id.z === 1 ? 1 : 2) : 0`, and widen the "nothing to change" fast path accordingly.

- [x] Update the existing expectations rather than adding tests — they are the coverage:
      `tests/utils/scene/balanceSurfaceCut.test.ts:177` (the deep-band island's NW leaf, ringed by z7 leaves six levels coarser) becomes `[2, 0, 0, 2]` — west and north, since the template's north edge faces the ring tile at `y − 1`;
      `:194` and `:195` (collapse refused for want of a parent, a two-level step) become `[2, 0, 0, 0]`;
      `:173` (the coarse ring itself), `:127`, `:128`, `:131`, `:132`, `:212`, `:213` are unchanged — a one-level step is still `1`, and the coarse side still carries nothing.
- [x] Rewrite the field's doc comment on `SurfaceCutTile` (it currently promises one bit) and the sentence in `balanceSurfaceCut`'s header that says "one bit per edge".
- [x] `npm run typecheck:fast`; `npm test -- balanceSurfaceCut cutSurfaceTiles`.
- [x] Commit `feat(terrain): per-edge coarseness code, band seams distinguishable from one-level steps`.

### Task 2: `PatchInstance` at its full 80 bytes; the height atlas bound

**review: yes** (binary layout + TS↔WGSL contract).

**Files:** `src/services/gpu/shaders/bodies/earthSurfaceTile/io.wesl`, `src/services/gpu/renderers/bodies/earthSurfaceTileLayout.ts`, `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts`, `src/@types/rendering/EarthSurfaceTileRenderer.d.ts`, `src/services/engine/frame/passes/earthPass.ts`, `tests/services/gpu/renderers/bodies/earthSurfaceTileLayout.test.ts`.

**Contract** — the byte table is the format; the layout test is its enforcement:

```
off  size  kind    field
  0    12  vec3f   originRelEyeM
 12     4  f32     fadeWeight
 16     4  f32     lon0Rad
 20     4  f32     lat0Rad
 24     4  f32     dLonRad
 28     4  f32     dLatRad
 32    16  vec4f   albedoRect
 48    16  vec4f   fallbackRect
 64     8  vec2u   heightSlotOrigin   texel origin of this leaf's slot in the height atlas
 72     4  u32     edgeCoarser        code(west) | code(east)<<2 | code(south)<<4 | code(north)<<6
 76     4  —       padding (the struct rounds up to its 16-byte alignment; nothing writes it)
PATCH_INSTANCE_BYTES = 80
```

The two `vec4f`s must stay **before** `heightSlotOrigin`: a `vec2u` declared earlier pads the record past 80 B (spec §7's note on the field order).

`heightSlotOrigin` from `SurfaceCutTile.heightSlot`, with `SLOTS_PER_ROW = HEIGHT_TILE_ATLAS_SIDE / HEIGHT_POSTS_PER_TILE` (= 16, both from `src/data/bodies/earthTileParams.ts` / `src/data/scene/heightTileFormat.ts`): `[ (slot % SLOTS_PER_ROW) * HEIGHT_POSTS_PER_TILE, Math.floor(slot / SLOTS_PER_ROW) * HEIGHT_POSTS_PER_TILE ]`. This mirrors `TextureAtlas`'s own row-major slot layout (`textureAtlas.ts:312-318`); two lines in the renderer, no helper, no test.

Pipeline and pass wiring:

- bind-group layout gains `{ binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } }` — binding 2 is the slot P6's deleted per-corner vertex array left free.
- `EarthSurfaceTileDrawArgs` gains `readonly heightAtlasView: GPUTextureView;`, bound at 2.
- `earthPass.ts:196-200`: read `earthTiles?.getHeightAtlasView() ?? null` and add it to the `tilesLive` conjunction. **A cut must never draw without the height atlas** — from Task 3 on, every vertex position reads it.
- The layout entry may legally exceed what the shader uses, so this task lands with the WGSL reading neither new field: **no picture change**, and the next tasks change only shader code.

- [x] Extend `earthSurfaceTileLayout.test.ts`'s struct parser to the `vec2u` / `u32` kinds (it parses `io.wesl` field by field) and assert `PATCH_INSTANCE_BYTES === 80` with `heightSlotOrigin` at 64 and `edgeCoarser` at 72.
- [x] `writePatchInstance` gains `heightSlotOriginX/Y` (`setUint32`) and `edgeCoarser` (`setUint32`) in declaration order; the renderer packs the code as `c0 | c1 << 2 | c2 << 4 | c3 << 6`.
- [x] `npm test -- earthSurfaceTileLayout`; probe the shader after the `io.wesl` edit.
- [x] Commit `feat(terrain): 80-byte PatchInstance and the height atlas binding`.

### Task 3: vertex displacement at `n = 64`

**review: yes** (shader + numerics).

**Files:** `src/data/bodies/earthTileParams.ts`, `src/services/gpu/shaders/bodies/earthSurfaceTile/vertex.wesl`, `src/utils/scene/patchVertexOffsetM.ts`, create `src/utils/scene/surfacePatchPostIndex.ts`, `tests/utils/scene/patchVertexOffsetM.test.ts`, create `tests/utils/scene/surfacePatchPostIndex.test.ts`, `tests/services/gpu/shaders/constants.parity.test.ts`.

**Contract:**

```ts
// earthTileParams.ts — 64 cells per patch edge against 128 cells per height tile:
// geometry LOD and shading LOD are separate budgets (spec §7, §10). 1.19 m at z19.
export const EARTH_SURFACE_TILE_MESH_RESOLUTION = 64;

// surfacePatchPostIndex — the template vertex (i, j) → its post in the 129-post
// height tile, as [col, row]. TWIN of the mapping in vertex.wesl.
export function surfacePatchPostIndex(i: number, j: number, n: number): readonly [number, number];
//   stride = (HEIGHT_POSTS_PER_TILE - 1) / n            // 2 at n = 64
//   col    = i * stride
//   row    = (HEIGHT_POSTS_PER_TILE - 1) - j * stride   // the flip, see below

// patchVertexOffsetM gains the height, LAST parameter, metres above the datum:
export function patchVertexOffsetM(
  anchor: Readonly<SurfacePatchAnchor>,
  radiusM: number,
  s: number,
  t: number,
  heightM: number,
): Vec3;
```

The row flip is the whole trap: `SurfacePatchAnchor.lat0Rad` is the patch's **south** edge and the template's `j` counts north, while a height tile's **row 0 is its north row** (R9, matching albedo). So `row = 128 − 2j` at `n = 64`, and the south-west template corner `(0, 0)` reads post `[0, 128]`.

Position, per spec §7.1 — `h` distributed, never summed into the radius:

```
xE = radiusM * cE + h * cE
xN = radiusM * cN + h * cN
xU = radiusM * cU + h * cU + h
```

`(radiusM + h) * cE` is the **forbidden** form: the f32 sum quantizes to 0.5 m at Earth's radius and terraces every patch (§5.3). The `cE / cN / cU` haversine lines above it are unchanged and must stay unchanged — `2·sin²(x/2)` is not `1 − cos x` at a z19 patch's angles.

`patchOriginRelEyeM` does **not** change: `h` is not part of the origin, so §7.1's anchor contract stands exactly as P6 landed it — `Math.fround` the triple `(datumRadiusM, lon0Rad, lat0Rad)` first, derive the f64 origin from the rounded values, and let the shader rebuild its frame from the same f32 words. Adding `h` to the CPU origin would put the height into the patch frame itself and reintroduce the per-patch drift that contract exists to kill.

WGSL side of the lookup, in `vertex.wesl`:

```wgsl
const HEIGHT_POSTS_PER_TILE: u32 = 129u;   // mirrors src/data/scene/heightTileFormat.ts, parity-tested
let stride = (HEIGHT_POSTS_PER_TILE - 1u) / u.meshResolution;
let post = vec2u(i * stride, (HEIGHT_POSTS_PER_TILE - 1u) - j * stride);
let h = textureLoad(heightAtlas, inst.heightSlotOrigin + post, 0).r;
```

`textureLoad` with an integer post, never a sampler: `textureSample` is illegal in the vertex stage, `r32float` is not guaranteed filterable, and hardware bilinear in a slot atlas bleeds the neighbouring slot in along every patch edge (§5.5, all three independent).

- [x] Extend `tests/utils/scene/patchVertexOffsetM.test.ts`: the existing z7 and z19 cases get a displaced twin each (`h = 8000` at z7, `h = 37` at z19) against the file's own f64 reference extended to `(R + h)·dir(lon, lat) − R·dir(lon0, lat0)`. The reference **may** use `R + h`: the ban is an f32 ban, and f64's ulp at 6.4e6 m is 1e-9 m. Keep the existing tolerances (1e-6 m at z7, 1e-7 m at z19) — the reference's own cancellation floor is ~1.4e-9 m.
- [x] Add `at s = t = 0 the offset is exactly h along the anchor's up`: the result must equal `h · (cos lat0 · cos lon0, cos lat0 · sin lon0, sin lat0)` to within 1e-9 m — the §7.1 corner property with height, and the reason patch corners still land on the f64 origin.
- [x] Add `tests/utils/scene/surfacePatchPostIndex.test.ts` with hand-computed pairs: `(0, 0, 64) → [0, 128]`, `(64, 64, 64) → [128, 0]`, `(1, 1, 64) → [2, 126]`, `(1, 0, 8) → [16, 128]`.
- [x] Add a `HEIGHT_POSTS_PER_TILE parity` describe to `constants.parity.test.ts` covering `vertex.wesl` (and, after Task 6, `fragment.wesl`) against the TS export, plus the one invariant that makes the stride integral: `(HEIGHT_POSTS_PER_TILE - 1) % EARTH_SURFACE_TILE_MESH_RESOLUTION === 0`.
- [x] Probe the shader. `npm test -- patchVertexOffsetM surfacePatchPostIndex constants.parity`.
- [x] Commit `feat(terrain): vertex displacement from the height atlas at mesh resolution 64`.

### Task 4: edge collapse on one-level steps

**review: yes** (shader + the crack argument).

**Files:** `src/services/gpu/shaders/bodies/earthSurfaceTile/vertex.wesl`, create `src/utils/scene/collapseTemplateIndex.ts`, create `tests/utils/scene/collapseTemplateIndex.test.ts`.

**Contract:**

```ts
/** collapseTemplateIndex — the template vertex (i, j) a vertex is DRAWN at once
 *  its edge has been collapsed onto a one-level-coarser neighbour's posts.
 *  TWIN of the snap in vertex.wesl. Edge order is R9's [west, east, south,
 *  north]; in the TEMPLATE that is i = 0, i = n, j = 0, j = n, because the
 *  anchor's lat0 is the patch's SOUTH edge and t increases north. */
export function collapseTemplateIndex(
  i: number,
  j: number,
  n: number,
  edgeCoarser: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2],
): readonly [number, number];
```

Rule: code `1` only — code `2` never collapses, since the coarse side is more than one level away and has no post at the even index either.

| code 1 on | applies when | snap              |
| --------- | ------------ | ----------------- |
| west      | `i === 0`    | odd `j` → `j − 1` |
| east      | `i === n`    | odd `j` → `j − 1` |
| south     | `j === 0`    | odd `i` → `i − 1` |
| north     | `j === n`    | odd `i` → `i − 1` |

The two axes are independent, so a corner vertex on two collapsed edges snaps on both. The snapped `(i, j)` feeds **both** `(s, t)` and the post index — one call, before either — which is what makes the two sides of the edge name the same lattice point and read the same post value. Why it is exactly zero crack: our vertices sit at `Δ/64` along the shared edge, the coarse neighbour's at `Δ/32`, so our even indices are its vertices; and the coarse tile's post there is the strict decimation of ours, bit-identical by §5.4.3 (R1). What is left is f32 residue from two different patch origins, ~µm (§7.3 row 4).

- [x] Tests, hand-computed: `an odd vertex on a collapsed west edge snaps toward the south` — `(0, 3, 64, [1,0,0,0]) → [0, 2]`; `an interior vertex never moves` — `(1, 3, 64, [1,1,1,1]) → [1, 3]`; `a vertex on two collapsed edges snaps on both axes` — `(3, 64, 64, [1,0,0,1]) → [2, 64]`; `a band-seam edge does not collapse` — `(0, 3, 64, [2,0,0,0]) → [0, 3]`.
- [x] Mirror the snap in `vertex.wesl` reading `(inst.edgeCoarser >> (2u * e)) & 3u` per edge, before `s`/`t` and the post lookup are computed.
- [x] Probe the shader. `npm test -- collapseTemplateIndex`.
- [x] Commit `feat(terrain): edge collapse onto one-level-coarser neighbours`.

### Task 5: the skirt ring, on band-seam edges only

**review: yes** (shader + index-buffer contract).

**Files:** `src/utils/scene/surfacePatchIndices.ts`, `src/data/bodies/earthTileParams.ts`, `src/services/gpu/shaders/bodies/earthSurfaceTile/vertex.wesl`, `tests/utils/scene/surfacePatchIndices.test.ts`.

**Contract** — the vertex-id space, which the index buffer and the vertex stage must agree on exactly:

```
vid ∈ [0, (n+1)²)                        grid vertex: i = vid % (n+1), j = vid / (n+1)   (unchanged)
vid ∈ [(n+1)², (n+1)² + 4(n+1))          skirt vertex: sid = vid − (n+1)², e = sid / (n+1), k = sid % (n+1)
boundary post of (e, k):  west → (0, k)   east → (n, k)   south → (k, 0)   north → (k, n)
at n = 64: 4225 grid + 260 skirt = 4485 vertices, 24576 + 1536 = 26112 indices — uint16 still fits
```

A skirt vertex is its boundary post, computed through the **same** collapse + post-index + offset path, with `h − depthM` substituted for `h`:

```ts
// earthTileParams.ts
/** Skirt depth as a fraction of the patch's north-south extent (radiusM · dLatRad):
 *  15.6 km at z7, 245 m at z13, 3.8 m at z19. The gap a band seam opens is the
 *  coarse neighbour's geometric residual, which the fine side cannot read — this
 *  is the heuristic that stands in for it (F2-R3). */
export const SURFACE_TILE_SKIRT_DEPTH_FRACTION = 0.05;
```

`depthM = SURFACE_TILE_SKIRT_DEPTH_FRACTION * u.radiusM * inst.dLatRad` when that edge's code is `2`, else `0` — at `0` the ring is coincident with the boundary and every skirt triangle is degenerate. One skirt suffices whichever way the mismatch goes: the hole between the two surfaces is laterally open and bounded by them, and a wall hanging inward from the fine edge closes it from either side.

Index winding — derived, not guessed; `frontFace: 'ccw'` + `cullMode: 'back'` means a reversed edge is simply invisible, which is exactly how a skirt bug hides. With `b(k)` the boundary vertex id and `s(k)` the skirt vertex id:

```
west (outward −Ê) and north (outward +N̂):  [b(k), b(k+1), s(k)]  and  [b(k+1), s(k+1), s(k)]
east (outward +Ê) and south (outward −N̂):  [b(k+1), b(k), s(k+1)] and  [b(k), s(k), s(k+1)]
```

- [x] `surfacePatchIndices(resolution)` appends the four edges' `6n` indices after the grid's `6n²`, in R9 edge order.
- [x] Test `skirt quads wind outward on all four edges`: lay the template flat — grid vertex `(i, j)` at `(i, j, 0)`, skirt vertex at its boundary post with `z = −1` — and assert every skirt triangle's `(B−A)×(C−A)` points along that edge's outward direction (`−x`, `+x`, `−y`, `+y`). This is the one bug class here that no screenshot at an ordinary pose reveals.
- [x] `vertex.wesl` maps the skirt id range and applies the depth; interpolants (`uv`, `tangent`, the atlas rects) are the boundary post's, unchanged.
- [x] Probe the shader. `npm test -- surfacePatchIndices`.
- [x] Commit `feat(terrain): band-seam skirts from a shared template ring`.

### Task 6: fragment normals from the height cell

**review: yes** (shader + shading maths).

**Files:** `src/services/gpu/shaders/bodies/earthSurfaceTile/fragment.wesl`, `io.wesl`, `vertex.wesl`, create `src/utils/scene/surfaceNormalFromHeightCell.ts`, create `tests/utils/scene/surfaceNormalFromHeightCell.test.ts`, `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts`, `src/@types/rendering/EarthSurfaceTileRenderer.d.ts`, `src/services/engine/frame/passes/earthPass.ts`.

**Contract:**

```ts
/** surfaceNormalFromHeightCell — the unit normal of the bilinear cell a fragment
 *  lies in, from that cell's own four posts, in the local (Ê, N̂, Û) frame.
 *  TWIN of the gradient in fragment.wesl. Posts are named by compass corner
 *  rather than by index because the atlas's row index increases SOUTHWARD and
 *  an (i, j) spelling of this is one sign flip from lighting every slope
 *  backwards. `u` runs east across the cell, `v` runs SOUTH; both in [0, 1). */
export function surfaceNormalFromHeightCell(
  hNW: number,
  hNE: number,
  hSW: number,
  hSE: number,
  u: number,
  v: number,
  postSpacingEM: number,
  postSpacingNM: number,
): Vec3; // (E, N, U) components, unit length
//   dhdE = ((hNE − hNW)·(1 − v) + (hSE − hSW)·v) / postSpacingEM
//   dhdN = ((hNW − hSW)·(1 − u) + (hNE − hSE)·u) / postSpacingNM
//   n    = normalize((−dhdE, −dhdN, 1))
```

This is spec §7.2's forward difference, not a central one: a central difference goes one-sided at the 129th post and draws a seam along every tile edge. It reads no post outside the tile, and both sides of a tile boundary read the same bit-identical shared column (§5.4.1), so two patches — at the same level or two levels apart — cannot disagree.

Fragment-side plumbing:

- new varyings, both `@interpolate(flat)` (a `u32` cannot interpolate anyway): `@location(9) heightSlotOrigin: vec2u`, `@location(10) patchSpanRad: vec2f` (`dLonRad`, `dLatRad`). Nothing else is added to `VSOut`.
- cell address: `col = in.uv.x * 128.0`, `row = in.uv.y * 128.0` — `uv.y` already runs from 0 at the patch's north edge (`vertex.wesl:74`, `uv = (s, 1 − t)`), which is the height tile's row order. `i0 = clamp(floor(col), 0, 127)`, `u = col − i0`, likewise for the row; four `textureLoad`s at `heightSlotOrigin + (i0 + di, j0 + dj)`.
- post spacing: `postSpacingNM = u.radiusM * patchSpanRad.y / 128.0`, `postSpacingEM = max(u.radiusM * cos(lat) * patchSpanRad.x / 128.0, 1e-3)` with `lat = asin(clamp(Ng.z, -1, 1))` — the existing `Ng` is body-local with `+Z` the pole. The `max` is the polar guard: `cos(lat) → 0` on the pole row and the gradient would divide by zero.
- frame: `Û = Ng`, `Ê = normalize(in.tangent)` (already carried), `N̂ = cross(Ng, Ê)`. The shading normal is `normalize(Û − dhdE·Ê − dhdN·N̂)`, replacing `perturbNormal(Ng, in.tangent, nEnc)`.
- **delete** from the tile path: the `normalTexture` binding (8) and its layout entry, the `perturbNormal` import, `normalView` from `EarthSurfaceTileDrawArgs`, and `normalView: renderer.getMapView('normal')` from `earthPass`'s tile draw. The base globe keeps its own normal map — compositing both would shade the same relief twice (§7.2). `in.tangent` stays; it is now `Ê`.

- [x] Tests, hand-computed: `a flat cell is up` → `[0, 0, 1]`; `a 1:1 east slope tilts west` — `hNE − hNW = hSE − hSW = spacingE` → `[−√½, 0, √½]`; `a 1:1 north slope tilts south` — `hNW − hSW = hNE − hSE = spacingN` → `[0, −√½, √½]`; `the cell's interior interpolates between its two edge gradients` — an east slope that doubles from the north row to the south row reads its north-row value at `v = 0` and the mean at `v = 0.5`.
- [x] Probe the shader after each of `io.wesl`, `vertex.wesl`, `fragment.wesl`. `npm test -- surfaceNormalFromHeightCell earthSurfaceTileLayout constants.parity`.
- [x] Commit `feat(terrain): fragment normals from the height cell, whole-globe normal map off the tiles`.

### Task 7: the base globe at `datumRadiusM + reliefM[0]`

**review: yes** (pose maths; `reliefM`'s readers).

**Files:** `src/data/bodies/sceneEarth.ts`, `src/services/engine/frame/passes/earthPass.ts`.

**Contract:** Earth's surface record becomes `{ datumRadiusM: 6371000, reliefM: [-430, 8849] }` (F2-R4). In `earthPass.draw`, the **base globe only** composes its own frame from the inner bound:

```ts
const baseGlobeRadiusM = innerBoundRadiusM(body.surface); // datum − 430 m, 0.007 %
// mvp and camLocal for renderer.draw(...) derive from baseGlobeRadiusM;
// prepared.radiusM (the datum) still feeds the tile draw, runFrame's planner and drawPick.
```

`composeBodySlabMvp` and `bodySlabCamLocal` are the two derivations to redo at that radius — `prepared.mvpLocal` and `prepared.camLocal` stay as they are, because `runFrame.ts:273` reads the same memo for the tile planner and it must stay on the datum (F2-R5). Keep `earthPass.ts` at its two existing exports.

The fade band and the `'nearer-or-equal'` compare do not move (§7.4). `CLOUD_SHELL_PARAMS.radiusRatio` stays a ratio of the drawn globe's local radius; the 0.007 % shift in what it multiplies is four orders below the shell's own thickness.

`reliefM`'s blast radius — check each reads sanely in the diff, none needs a code change:

- inner bound: `atmosphereParams.ts:34` (`EARTH_RADIUS_KM` 6371 → 6370.57), `sceneOccluderBodies.ts:75`, `meshBodiesPass.ts:88`.
- outer bound: `earthFlyout.ts:58` and `makeEarthLoop.ts:26` (clip radii), `bodyTextureLoadRadius.ts:20`, `atmosphereDrawList.ts:88`, `bodyFootprintRadiusM.ts:15` — all +8.8 km on 6371 km, 0.14 %.

- [x] No new test: this is a constant and two call-site radii. Existing fixtures that pin an Earth-derived radius will move — update them to the new derivation, never to a hard-coded number.
- [x] `npm run typecheck:fast`; run the tests for the six files above plus `earthPass`; CI covers the rest.
- [x] Commit `feat(terrain): base globe drawn at the inner bound so relief cannot be occluded`.

### Task 8: docs

**Files:** `docs/RENDERER.md`.

- [x] Update the Earth-surface bullet (`:14`) and the "no page table" landmine (`:27`): patches are displaced off the height atlas, geometry is `n = 64` while shading reads all 129 posts, and the module names there are F1's (`surfaceTileSubsystem.ts`, not `earthTileSubsystem.ts`) — fix any stale name in the lines you touch, nowhere else.
- [x] Add the F2 landmines beside the existing `textureSampleLevel` one (`:29`), one line each, no essay: `r32float` needs `sampleType: 'unfilterable-float'` and `textureLoad` (a sampler is illegal in the vertex stage and unguaranteed in the fragment); the height tile's row 0 is NORTH while the template's `j` counts north from the anchor's south edge; the per-edge code is 2 bits and a band seam (`2`) is skirted, never collapsed; the three TS twins are the only testable statement of the WGSL contracts and are not dead code.
- [x] No test. Commit `docs(renderer): displaced surface patches, height atlas, edge stitching`.

### Task 9: eye-check and perf (controller + user)

No code. Runs on **this worktree's own dev server** — note its port from the `Local:` line; a perf run without `--url http://localhost:<port>` silently measures another branch.

- [~] Four poses, with the user looking: **orbit** (terrain reads as relief, not as noise; no cracks along LOD boundaries), the **300 km band** (the base globe stays, at the inner bound, and nothing of it pokes through the patches), **Søndermarken at z19** (1.19 m geometry posts; the fragment normal carries the 0.597 m detail — shading should be finer than the silhouette), and a **limb view** (the silhouette is terrain, and no skirt is visible edge-on as a black wall). Done at Everest, Søndermarken and multiple tilted orbit poses across the eye-check session; surfaced and fixed the shading-quilt spike, the night-lights cream bug and a horizon-cull gap (all landed). NOT cleanly closed: grey rectangles at screen edges under high tilt were investigated at length and PARKED as a known limitation (`docs/backlog/2026-09-15-terrain-grey-holes-high-tilt.md`); the limb view's skirt-wall risk (flagged by the implementer at the 0.05 depth knob) was never separately confirmed clean by the user.
- [x] Band seams specifically: look along the EOX box boundary and the Søndermarken boundary, where the step is multi-level and the skirt is the only thing closing it. If a skirt reads as a visible wall, `SURFACE_TILE_SKIRT_DEPTH_FRACTION` is the one knob (F2-R3). User confirmed: "not really noticeable" — no visible seams.
- [~] Confirm `reliefM`'s literal against the F1 bake's printed global min/max diagnostics (F2-R4); change the constant if they disagree. The bake's printed global range includes uncorrected deep-ocean pit artifacts (§4.4's open water item) that make a literal min/max comparison meaningless; the constant was never explicitly re-confirmed against a corrected figure before landing. Shipped as `[-430, 8849]` (Dead Sea / Everest), unchanged.
- [ ] **USER-RUN:** `npm run perf -- --url http://localhost:<port>` before and after, A-B-A-B, on the earth-surface and solar-system poses — P6 measured 21.28 → 20.78 ms and 20.73 → 20.47 ms at `n = 8`, and F2 raises the drawn triangle count from ~33k to ~2.2M per frame (256 patches × 8,192 grid + 512 skirt triangles). No agent runs this (F2-R6). A neutral-or-negative measurement **halts the landing pipeline**; land/park is the user's call, and the cheap lever is `EARTH_SURFACE_TILE_MESH_RESOLUTION` (a constant, not a re-bake — 32 quarters the triangles). **Waived by the user** ("ok for now") so production (broken on main) could ship; the `docs/BACKLOG.md` "Terrain mesh resolution 128" index line carries the deferred perf gate forward.

---

## Definition of Done

**Deliverable inventory**

- `EARTH_SURFACE_TILE_MESH_RESOLUTION = 64`, `SURFACE_TILE_SKIRT_DEPTH_FRACTION`, and a template of `(n+1)² + 4(n+1)` vertices with `6n² + 24n` indices from `surfacePatchIndices`.
- `PatchInstance` at 80 B with `heightSlotOrigin` (64), `edgeCoarser` (72) and `heightCells` (76), parity-tested against `io.wesl`; the height atlas bound at binding 2 as `unfilterable-float`, visible to both stages.
- `SurfaceCutTile.edgeCoarser` carrying one bit per HEIGHT-level step of exactly one (R15), nothing at all past that; `lattice.wesl`'s `latticeHeightM`/`latticeCellM` the one statement of post addressing for both stages, stride clamped to the leaf's `cells`.
- `latticeHeightSample`, `surfaceNormalFromHeightCell` + `patchVertexOffsetM`'s height parameter — the TS statements of the shader's contracts, each tested against a hand-computed or independently-derived expectation.
- `normalTexture` gone from the tile pipeline (binding, layout entry, draw arg, import); Earth's `reliefM` real; the base globe drawn at the inner bound, always — the descent fade and its `baseGlobeAlpha` uniform slot deleted.

**Observable behaviours (manual smoke)**

- Terrain is displaced at all four poses, and no hairline crack appears along any LOD boundary while tiles stream in.
- No LOD boundary or band seam shows a gap — the skirt, on every edge, closes it — and no visible wall at a grazing angle.
- Below-datum terrain (an ocean trench, the Dead Sea) is never clipped by the base globe, at any altitude.
- Shading relief rotates with the sun and comes from the height field alone — no double-shading against the whole-globe normal map, which the base globe still uses.
- Debug panel's `height n/256` still climbs on approach, unchanged from F1.

**Deferral boundary** — out of scope here, explicitly: `SurfaceHeightField`, `ceilingHeightM`, `raycast` picking, the terrain-aware horizon cap, the compiled 64×32 min/max grid (and `reliefM` derived from it), cloud clearance (all F3); Mars rows, imagery and rover sites (F4); the `geometricResidualM` refinement term (§6, deferred); renaming the draw side (F1's R6); any re-bake, manifest or `public/data` change.

---

## Amendment R14 (F2 half) — sample the inherited lattice; base globe always drawn

Ruled 2026-09-15 with F1's R14 (see the F1 plan's `## Amendment R14`): a leaf's height is the deepest resident tile in its ancestor chain, flattened into the leaf's sub-rect (`SurfaceCutTile.height = { slot, levelDelta, originPosts }`, `cells = 128 >> levelDelta`), and balance/edge codes work on the height level. R1's strict decimation makes the sub-rect exactly the lattice the ancestor draws, so the collapse rule generalises to "sample at doubled stride" and no new crack appears. Code 2 (band seam) is now simply "the neighbour's height level is two or more coarser after balance" — balance leaves such a step only under R12's band-ceiling exemption.

**Contract (`PatchInstance`, still 80 B):** `heightSlotOrigin: vec2u @64` becomes the leaf's sub-rect origin in ATLAS posts (slot origin + `originPosts`); `edgeCoarser: u32 @72` unchanged; `heightCells: u32 @76` (was padding) = `128 >> levelDelta`. Parity-tested in the existing layout test.

**Lattice sampler (`vertex.wesl` + `fragment.wesl`, one shared function in the tile shader's lib):** `latticeHeightM(origin: vec2u, p: vec2f, stride: f32) -> f32` — `q = stride * floor(p / stride)`, `f = fract(p / stride)`, four `textureLoad`s at `origin + q + {0, stride}²`, bilinear. A vertex at patch uv `(s, t)` samples `p = uv * cells` at `stride = 1` (own tile: `cells = 128`, `n = 64`, so `p` lands on even posts and the load is exact, as today). A vertex on an edge whose code is 1 samples at `stride = 2` — that IS the coarse neighbour's lattice along that edge (its posts are our even posts), so the edge is crack-free by construction; `collapseTemplateIndex` and its TS twin go. The fragment normal takes forward differences of the same sampler at `stride = 1` around `floor(p)`, with post spacing `patchExtent / cells` in metres — the cell of the lattice actually sampled, not a fixed 1/128.

### Task B1: PatchInstance `heightCells`, lattice sampler, generalised collapse

**Files:** `src/services/gpu/shaders/bodies/earthSurfaceTile/{io,vertex,fragment}.wesl`, `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts` (`writePatchInstance`), `src/utils/gpu/surfacePatchPostIndex.ts` → replaced by `src/utils/gpu/latticeHeightSample.ts` (TS twin of the sampler, f64 reference), delete `src/utils/gpu/collapseTemplateIndex.ts` + test, `src/utils/gpu/surfaceNormalFromHeightCell.ts` gains `cells`; tests mirror.

- [x] Layout test: `heightCells` at 76, record 80 B.
- [x] TS twin tests: own tile stride 1 at even posts returns the post exactly; a `levelDelta = 2` leaf (`cells = 32`) at `n = 64` returns the bilinear midpoint between two ancestor posts, hand-computed; stride 2 on an edge returns the average of the two even posts around an odd post (the old collapse result, bit-for-bit).
- [x] WGSL validated with `wesl link` + `naga` (no tint on this machine); `npm run build`.
- [x] Commit `feat(terrain): sample the inherited height lattice; edge collapse as a doubled-stride sample`.

### Task B2: base globe always drawn

**Files:** delete `src/utils/scene/baseGlobeFadeAlpha.ts` + test, `EARTH_BASE_GLOBE_FADE_*` in `earthTileParams.ts`, the `baseGlobeAlpha` uniform path in `earthRenderer.ts`/`earth/fragment.wesl`/`earthPass` (grep `baseGlobeAlpha`, `baseGlobeFadeAlpha`); `atmosphereParams`/cloud shells if they read the constants (grep).

- [x] The globe sits at `innerBoundRadiusM` (T7), so the depth fight the fade was for is gone; alpha is 1 always. A leaf with no resident ancestor (one round trip for a brand-new root child) now shows the base globe, not stars.
- [x] Commit `feat(terrain): base globe always drawn — the inner-bound globe fills what no tile covers yet`.

### Task B3: docs

- [x] Spec §7.3 (crack accounting: collapse = doubled-stride sample; code 2 = post-balance step ≥ 2), §7.4 (fade gone), F2-R1/R2/R7 notes; `docs/RENDERER.md`; this plan's DoD (`heightCells`, twins list, no fade). Commit `docs(terrain): R14 F2 half`.

### Task B4: frustum-cull headroom for displaced patches (from the F1 R14 review)

F1's `probe` culls with a sphere of radius 1.5× the corner chord about the patch centre — vertical headroom ≈ 1.1× the half-diagonal (≈ 3.9 km at z13, ≈ 60 m at z19). Once F2 displaces geometry, a summit near a side plane can be on screen while its datum patch is culled. A CONSTANT relief margin is wrong (it turns every tile within that many metres of the camera on the eye-plane line into a screen-filling straddler at ground level — the inflation R14 just removed). Use the per-tile `subtreeMinM/MaxM` the bake already writes in every height tile header: `residentSlot` for height returns the resident ancestor's range, which bounds every descendant by construction, and `probe` adds `max(|min|, |max|) / radiusM` to the sphere radius for that node (0 when nothing is resident — the datum, as F1). Test: a z13 patch whose subtree max is 8 km, centred 5 km outside a side plane's datum footprint, is NOT culled; with a 0 m range it is.

---

## Amendment R15 — skirts on every edge; the edge code is the lattice step only

**Ruled by the controller 2026-09-15 after the final review of the R14 half (user to confirm at the eye-check).** R14 balances HEIGHT levels and never removes a leaf, so the cut's MESH levels are no longer 2:1: a z13 leaf on its own tile beside a z12 leaf on its own tile has 64 vertices where the neighbour has 32, and the doubled-stride sample (which is exact for a lattice step) does nothing for that T-junction — the z13 vertex at post 4m+2 keeps its own height where the neighbour draws the chord. The old `collapseTemplateIndex` handled a one-level mesh step only because the old balance bounded it; re-bounding the mesh (refine-to-balance in the walk) would put residency-blind refinement back under a neighbour's control. Cesium and Google Earth do not balance at all: every tile carries a skirt and every seam is hidden by it.

**Rules:**

- Every patch draws its skirt ring on all four edges, unconditionally (F2-R3's "band seams only" struck; depth stays `SURFACE_TILE_SKIRT_DEPTH_FRACTION` of the patch's N–S extent). A skirt hides a gap where the finer mesh dips below the coarser chord; where it rises above, it overlaps. No code is needed to trigger it.
- `edgeCoarser` returns to one bit per edge (`0 | 1`), meaning exactly R14's rule: the neighbour's HEIGHT level is one coarser, so this edge samples at doubled stride — the coarse neighbour's own lattice — and the two lattices agree bit-for-bit (R1). `balanceSurfaceCut`'s code-2 emission and the 3-valued type (F2-R1) go; `PatchInstance.edgeCoarser` packs four bits.
- The doubled stride is clamped to the leaf's `cells` (`stride = min(2, cells)`), so a `levelDelta = 7` leaf never reads outside its one-cell sub-rect; the seam that remains there is skirted like any other.
- Frustum headroom (B4) is clamped to the patch's own corner chord: `headroom = min(subtreeRangeM / radiusM, chord)`. Before deep tiles land the resident ancestor is the base level, whose subtree range is the Earth-wide relief, and an unclamped 8.8 km margin on every z19 node at ground level is exactly the eye-plane inflation R14's sphere removed. The B4 test pins one specific node that a known range flips from culled to kept, and asserts the unit-sphere division (a range passed in metres, undivided, must cull nothing extra).
- `surfaceNormalFromHeightCell` keeps its two-spacing signature (the twin mirrors the WGSL expression for expression; the `/ cells` lives at both call sites).

### Task B5: R15

**Files:** `src/services/gpu/shaders/bodies/earthSurfaceTile/{vertex,io}.wesl` (skirt ring unconditional; `collapseStride` for mesh steps deleted; stride clamp), `src/@types/scene/SurfaceCutTile.d.ts`, `src/utils/scene/balanceSurfaceCut.ts` + test (code 2 gone), `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts` (bit packing) + layout test, `src/utils/scene/cutSurfaceTiles.ts` (`reliefHeadroom` clamp) + test, `src/utils/scene/latticeHeightSample.ts` + test (a `cells = 128` stride-2 case at an even post is a no-op — that is the correct answer, since the neighbour's coarser lattice already sits on the even posts; and the clamp at `cells = 1`), `surfaceNormalFromHeightCell.ts` + test + `fragment.wesl`, spec §7.3 (the "same vertex count per edge" premise is false across a cut-level step; skirts own those seams) / §7.4 / F2-R1 / F2-R3, `docs/RENDERER.md`, this plan's DoD.

- [x] Commit `feat(terrain): R15 — skirts on every edge; edge code is the lattice step only`.

---

## Amendment — eye-check fixes and landing decision (2026-09-15, post-R15)

Ruled/landed during the T9 eye-check, after B5. Task 6's own contract text above
("spec §7.2's forward difference, not a central one") is left as written for history;
this amendment is the current truth and is what spec §7.2 now says.

- **Normals: per-post central-difference spike, `b95d565ac`, KEPT.** Task 6's
  bilinear-cell-gradient normal drew visible quilting at Everest. Replaced with
  per-post central differences (`lattice.wesl`'s `latticePostGradient`, 16
  `textureLoad`s per fragment) interpolated across the cell — spec §7.2 (amended).
  `surfaceNormalFromHeightCell`'s TS twin was re-signed to match.
- **Night lights, `ad7ab0f69`.** The emissive gate used the terrain-shaded normal's
  `NoL`, so any slope facing away from the sun at noon read as night (Søndermarken
  went cream-white). Fixed: gate on the datum normal `Ng`, never the displaced `n` —
  spec §7.2 (amended).
- **Horizon cull, `d8636f2f1`** (landed on `terrain-f1-height-products`, carried into
  this branch by the pre-landing merge). The walk's horizon cap ignored a node's
  `reliefHeadroom` and a camera below the datum planned nothing; both fixed. Did not
  resolve the grey-rectangle symptom below — its root cause is elsewhere — but is
  correct on its own and load-bearing for the under-datum-camera test.
- **Known limitations shipped, not fixed here** — investigated at length during the
  eye-check; each is its own backlog item rather than re-described:
  - Grey rectangles at screen edges under high tilt (a leaf absent from the cut with
    zero misses) — `docs/backlog/2026-09-15-terrain-grey-holes-high-tilt.md`.
  - Relief LOD reads coarser than expected near nadir at low tilt, worse as tilt
    rises — `docs/backlog/2026-09-15-terrain-relief-coarsens-under-tilt.md`.
  - A height-LOD debug overlay is a prerequisite for debugging the above — its own
    `docs/BACKLOG.md` index line.
  - `EARTH_SURFACE_TILE_MESH_RESOLUTION` 64 → 128 (to match the 129-post height
    tiles) is deferred, perf-A/B gated — its own `docs/BACKLOG.md` index line.
  - The atmosphere shows a hard seam over Everest's summit (the analytic ground
    sphere's horizon vs. the now-displaced terrain) — a pre-existing external
    dependency (spec §2, depth-blind inside-atmosphere composite), not introduced by
    F2; the Bruneton-tables effort parked "until the terrain mesh lands" is the
    follow-on.
- **Landing decision.** `npm run perf` was waived by the user ("ok for now") and
  F1+F2 landed together via #719 directly onto `main` — the F1 worktree was
  unreachable from this session's guard — because production was broken with F1's
  tile format already deployed. The final whole-branch review and a deletion-audit
  pass were both explicitly skipped at landing time to ship the fix; this
  `/feature-done` pass (branch `terrain-feature-done-docs`) is that skipped
  bookkeeping, run after the fact.
