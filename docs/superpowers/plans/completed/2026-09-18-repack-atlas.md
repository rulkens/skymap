# Mesh atlas re-pack

Spec: [`2026-09-17-repack-atlas-design.md`](../specs/2026-09-17-repack-atlas-design.md).
Branch `worktree-soendermarken-atlas-repack`, draft PR #754. One PR: Task 1 (prep P1) is its own
commit, first; every later task commits on top.

Authored with the whole feature authorized. Decisions the spec left open, or where this plan
departs from it, are recorded inline as `Ruling: <decision> — <why> — <cost if wrong>` and
collected in [Rulings](#rulings).

## Dispatch groups

Consecutive, by cognitive locality; one worktree, Sonnet implementers, CI as the gate, one
whole-branch review at the end, plus one mid-branch review per `review: yes` task
([`sdd-execution.md`](../conventions/sdd-execution.md)).

| Group | Tasks | Theme                                                             |
| ----- | ----- | ----------------------------------------------------------------- |
| A     | 1     | P1 — `readSourceMesh` / `publishDerivedMesh` out of `cropMesh.ts` |
| B     | 2–8   | `tools/scene-recon/atlas/` — pack, fit, placement, bake           |
| C     | 9–10  | `repack-atlas` CLI, integration test, README                      |

B depends on A only for the commit order (A must land first); C needs both.

**No perf gate.** Ruling: skip `npm run perf` — this is an offline bake CLI outside the harness and
nothing under `src/` is touched — cost if wrong: none measurable.

**Visual checks are not tasks.** Every eye-check is a DoD line marked "user, at review", never a
blocking step.

## Standing rules for every task

- `type` aliases, never `interface`; one symbol per file in `@types/` and one function per file
  under `atlas/` and `derive/` (the `crop/` precedent); deep relative imports, no barrels.
  `Vec2` comes from `src/@types/math/Vec2`, as `tools/scene-recon/@types/HalfPlane2.d.ts` does.
- Comments per [`comments.md`](../conventions/comments.md): why, not what; module header ≤ 5 lines;
  comment lines ≤ half the code lines.
- Tests mirror the source tree: `tools/scene-recon/atlas/X` → `tests/tools/scene-recon/atlas/X`.
  Only behaviour that can fail on a real bug ([`testing.md`](../conventions/testing.md)).
- **UV convention, everywhere:** glTF UV origin is top-left and image row 0 is `v = 0`. Source texel
  coordinates are `(u·S, v·S)`, destination UVs are `destPx / sizePx`. **No V flip anywhere** — one
  flip in one file and the atlas is upside down only for the charts that pass through it.
- **Landmine:** in a worktree `public/data` is a symlink into main, so a real CLI run writes main's
  data. No task runs the CLI against real data; the user does.

---

## Group A — derive extraction

### Task 1: P1 — `readSourceMesh` and `publishDerivedMesh` (no behaviour change)

**Files:** `tools/scene-recon/derive/readSourceMesh.ts` (new),
`tools/scene-recon/derive/publishDerivedMesh.ts` (new), `tools/scene-recon/cropMesh.ts`
**review:** no — a behaviour-preserving extraction already guarded by a committed integration test.

`cropMesh.ts:53-90` is the sequence a second derived-mesh CLI would copy. Lift it verbatim.

```ts
// derive/readSourceMesh.ts
export async function readSourceMesh(
  group: SceneGroupDefinition,
  assetId: string,
): Promise<{ source: TexturedMeshAsset; geometry: TexturedMeshGeometry }>;

// derive/publishDerivedMesh.ts
export async function publishDerivedMesh(
  group: SceneGroupDefinition,
  source: TexturedMeshAsset,
  derived: {
    idSuffix: string; // 'cropped' | '4k' | '2k' — the id becomes `${source.id}-${idSuffix}`
    labelSuffix: string; // the label becomes `${source.label} — ${labelSuffix}`
    step: PipelineStep;
    geometry: TexturedMeshGeometry;
  },
): Promise<TexturedMeshAsset>;
```

`readSourceMesh` keeps `cropMesh.ts:53-61`; `publishDerivedMesh` keeps `:64-90` and returns the
asset. `cropMesh.ts` keeps only the outline read, `normalizeRing`, the crop, the hash step and its
report.

Ruling: the two throw messages are re-prefixed to the new function names — a shared helper cannot
claim to be `cropMesh` — cost if wrong: none; no test asserts the text.

- [x] Extract both files; rewire `cropMesh.ts`.
- [x] No new test — `tests/tools/scene-recon/cropMesh.test.ts` is the guard and must pass unchanged.
- [x] `npm test -- scene-recon` and `npm run typecheck:fast` green.
- [x] Commit: `refactor(scene-recon): derived-mesh read and publish out of cropMesh (P1)`.

---

## Group B — atlas core

All under `tools/scene-recon/atlas/`, tests under `tests/tools/scene-recon/atlas/`.

### Task 2: foundations — dependency, types, claim codes

**Files:** `package.json`, `package-lock.json`,
`tools/scene-recon/@types/PackedVertex.d.ts`, `PackedAtlas.d.ts`, `ChartPlacement.d.ts`,
`AtlasImage.d.ts`, `RepackAtlasReport.d.ts` (all new),
`tools/scene-recon/atlas/atlasClaims.ts` (new)
**review:** no — types, a dependency and three constants.

- [x] `npm install --save-dev xatlas-wasm@0.1.3`. It ships `lib/xatlas.d.ts`; no `@types` package.

```ts
// @types/PackedVertex.d.ts — one output vertex of a pack
export type PackedVertex = {
  readonly xref: number; // index into the SOURCE mesh's vertices
  readonly uvPx: Vec2; // destination texels, not normalized
  readonly chartIndex: number; // -1 ⇔ orphan (see ChartPlacement)
  readonly atlasIndex: number; // -1 ⇔ orphan
};

// @types/PackedAtlas.d.ts
export type PackedAtlas = {
  readonly sizePx: number;
  readonly chartCount: number;
  readonly vertices: readonly PackedVertex[];
  readonly indices: Uint32Array; // 3 per triangle, into `vertices`
};

// @types/ChartPlacement.d.ts
/** Source texels → destination texels for one chart: `d = R(turns)·(s·scale) + offsetPx`,
 *  R a 90° multiple. Integer `offsetPx` keeps texel centres on texel centres under R. */
export type ChartPlacement = {
  readonly turns: 0 | 1 | 2 | 3;
  readonly scale: number; // 1 ⇔ the exact bake
  readonly offsetPx: Vec2; // integral
};

// @types/AtlasImage.d.ts
/** Interleaved RGB, row-major, `sizePx²` texels — sharp's `.raw()` layout at 3 channels. */
export type AtlasImage = { readonly sizePx: number; readonly rgb: Uint8Array };

// @types/RepackAtlasReport.d.ts
export type RepackAtlasReport = {
  readonly asset: TexturedMeshAsset;
  readonly sizePx: number;
  readonly scale: number;
  readonly chartCount: number;
  readonly orphanVertices: number;
  readonly orphanBlocks: number;
  readonly bytes: number;
  readonly sourceBytes: number;
};

// atlas/atlasClaims.ts — one Int32Array per destination texel: which chart owns it
export const ATLAS_CLAIM: { readonly free: -1; readonly orphan: -2; readonly dilated: -3 };
```

Ruling: one `Int32Array` of claims carries both "is this texel filled" and "which chart filled it",
with negative codes for the non-chart fills — the double-claim assertion needs the chart id, the
orphan search and the dilation need only free/filled, and two parallel masks would drift — cost if
wrong: a reader must know `!== free` means filled while `>= 0` means "a chart wrote it".

- [x] No tests (types, a dependency, three constants).
- [x] Commit.

### Task 3: `packCharts` — the xatlas wrapper

**Files:** `tools/scene-recon/atlas/packCharts.ts` (new),
`tests/tools/scene-recon/atlas/packCharts.test.ts` (new)
**review:** no — the option landmines below are assertions in the file, and Task 9's integration
test exercises the whole wrapper.

```ts
/** Keep in step with package.json — this string is stamped into asset provenance. */
export const XATLAS_WASM_VERSION = '0.1.3';

/** `null` ⇔ the charts overflowed into a second atlas: a failed scale attempt, not an error. */
export async function packCharts(
  uvs: Float32Array, // SOURCE uvs, 0..1, 2 per vertex
  indices: Uint32Array,
  sourceSizePx: number,
  destSizePx: number,
  scale: number,
): Promise<PackedAtlas | null>;
```

**API** (`xatlas-wasm@0.1.3`, `lib/xatlas.d.ts` is the authority):
`const X = await createXAtlas(); const atlas = X.createAtlas();` — `createAtlas()`, not a
constructor. Then `atlas.addUvMesh({ uvs: texelUvs, indices })` (returns an `AddMeshError`; 0 is
success, `X.addMeshErrorString(code)` names the rest), `atlas.computeCharts({})`,
`atlas.packCharts({ resolution: destSizePx, texelsPerUnit: scale, padding: 2, bilinear: true, rotateChartsToAxis: false, rotateCharts: true })`,
then `atlas.getMesh(0)` → `{ chartCount, vertices: { xref, uv, atlasIndex, chartIndex }[], indices }`
and `atlas.atlasCount`. `atlas.destroy()` in a `finally`.

**Landmines, each of them a throw or a guard in this file:**

- UVs go in as **source texel units** (`u·sourceSizePx`), never 0–1 — xatlas drops faces under its
  area epsilon at 0–1 scale and silently returns fewer triangles.
- `texelsPerUnit: 0` (its default) makes xatlas pick its own scale and ignore `resolution` — the
  spike got a 7000² atlas for `resolution: 4096`. Throw if `scale <= 0`.
- `atlasCount !== 1` → return `null`. It is silent otherwise, and half the charts land nowhere.
- `rotateChartsToAxis` defaults to **true** and rotates charts by arbitrary angles — that is the
  blur the user saw on the first spike preview. It must be `false`.
- Throw when `getMesh(0).indices.length !== indices.length`: a dropped face must never be quiet.

- [x] `XATLAS_WASM_VERSION matches the installed dependency` — read `package.json` through
      `new URL('../../../package.json', import.meta.url)`. Real bug: a dependency bump leaves every
      future asset's provenance claiming the old packer, and nothing else sees it.
- [x] No functional unit test: the wrapper is IO over a wasm module, and Task 9 packs end to end.
- [x] Commit.

### Task 4: `fitAtlasScale`

**Files:** `tools/scene-recon/atlas/fitAtlasScale.ts` (new),
`tests/tools/scene-recon/atlas/fitAtlasScale.test.ts` (new)
**review:** no — a pure search loop with three tests.

```ts
/** Largest scale whose charts fit ONE atlas. `attempt` returns the pack, or null on overflow. */
export async function fitAtlasScale(
  destSizePx: number,
  usedTexels: number, // uvCoverage × sourceSizePx², the texels the charts actually sample
  attempt: (scale: number) => Promise<PackedAtlas | null>,
): Promise<{ scale: number; packed: PackedAtlas }>;
```

**Behaviour:** try `scale = 1` first — if one atlas holds it the bake is exact, so exact-vs-resampled
is derived from the fit, never a flag. Otherwise start at
`min(1, Math.sqrt((destSizePx² × 0.6) / usedTexels))` (0.6 is the spike's fill ratio at 2K) and
multiply by 0.98 until a pack fits; throw, naming `destSizePx` and `usedTexels`, below
`MIN_TRIAL_SCALE = 0.1`. On `mesh-cropped` this lands 4096 at 1.0 and 2048 at ≈ 0.44.

Ruling: the trial is a callback rather than `packCharts` called directly — it is the seam that lets
the sequence be tested without loading wasm, and the sequence (not the pack) is where the bugs are
— cost if wrong: one more parameter at the single call site.

- [x] `fitAtlasScale takes scale 1 when it fits` — `attempt` always succeeds; asserts the returned
      scale is exactly 1 and that `attempt` was called once (a seed computed before trying 1 would
      resample a mesh that could have been exact).
- [x] `fitAtlasScale seeds from the used-texel estimate and steps down by 2%` — `attempt` succeeds
      only at `scale <= 0.44`; assert the first two trials are `1` and `0.632` (literal, from
      `destSizePx = 2048`, `usedTexels = 6_300_000`) and that the winner is the first
      `0.632 × 0.98^k` at or below 0.44.
- [x] `fitAtlasScale throws when nothing fits` — `attempt` always null; assert the message names the
      size. Guards against a loop that never terminates.
- [x] Commit.

### Task 5: `chartPlacements`

**Files:** `tools/scene-recon/atlas/chartPlacements.ts` (new),
`tests/tools/scene-recon/atlas/chartPlacements.test.ts` (new)
**review: yes** — the fit is what makes the 4K bake pixel-exact; a wrong turn or a half-texel offset
passes every green test and shows only as blur in the user's eye check.

```ts
/** One placement per chart index; xatlas chooses WHERE a chart goes, this snaps HOW it got there
 *  to a 90° turn plus an integer offset, so the bake can invert it exactly. */
export function chartPlacements(
  packed: PackedAtlas,
  sourceUvs: Float32Array, // 0..1
  sourceSizePx: number,
  scale: number,
): ChartPlacement[];
```

**Behaviour.** Per chart, over its output vertices (`chartIndex === c`; orphans, `chartIndex < 0`,
are Task 7's and get no placement): source texels `s = (u·S, v·S)` from `xref`, destination texels
`d = uvPx`. For each `turns ∈ {0,1,2,3}` compute the residuals `d − R(turns)·(s·scale)` and keep the
turn whose residual spread (max − min, both axes) is smallest — the true fit, and with
`rotateChartsToAxis: false` the winner's spread is ~0. `offsetPx` is the residual at the chart's
**xatlas bounding-box corner** (component-wise minimum of `d` minus the matching corner of the
turned, scaled source bbox), rounded to an integer; xatlas's `padding: 2` absorbs the ≤ 0.5 px shift,
so the chart stays inside its own footprint.

Why integers: a texel centre `(i + 0.5, j + 0.5)` turns into `(−j − 0.5, i + 0.5)`, which an integer
offset lands on a texel centre again. A fractional offset makes even the scale-1 bake resample.
New UVs are recomputed from the placement (Task 8), never taken from xatlas.

- [x] `chartPlacements recovers a 90° turn and an integer offset` — hand-built `PackedAtlas`
      (no xatlas): chart 0 a 4-vertex square placed unturned at an integer offset, chart 1 the same
      square turned once with a **fractional** xatlas offset (e.g. +0.3 px on both axes). Assert
      `turns` 0 and 1 and both `offsetPx` integral, with literal expected values.
- [x] `chartPlacements folds the scale into the placement` — same fixture at `scale = 0.5`; assert
      the returned `scale` and that the offset still lands at the packed bbox corner.
- [x] Commit.

### Task 6: `rasterizeCharts`, `blitChartsExact`, `resampleCharts`

**Files:** `tools/scene-recon/atlas/rasterizeCharts.ts`, `blitChartsExact.ts`,
`resampleCharts.ts` (all new), `tests/tools/scene-recon/atlas/rasterizeCharts.test.ts`,
`blitChartsExact.test.ts`, `resampleCharts.test.ts` (all new)
**review:** no — the exactness claim is asserted inside `blitChartsExact` and re-checked end to end
by Task 9.

```ts
// rasterizeCharts.ts — the raster both bakes share; `visit` gets SOURCE texel coordinates
export function rasterizeCharts(
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  destSizePx: number,
  visit: (destIndex: number, srcXPx: number, srcYPx: number) => void,
): Int32Array; // claims, ATLAS_CLAIM.free where nothing was written

// blitChartsExact.ts — placements at scale 1
export function blitChartsExact(
  source: AtlasImage,
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  destSizePx: number,
): { atlas: AtlasImage; claims: Int32Array };

// resampleCharts.ts — placements at scale < 1; `shrunk` is the source pre-shrunk by sharp
export function resampleCharts(
  shrunk: AtlasImage,
  sourceSizePx: number, // the UNSHRUNK size: `visit` speaks source texels
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  destSizePx: number,
): { atlas: AtlasImage; claims: Int32Array };
```

Ruling: the spec's two bake files stay, but the raster moves into `rasterizeCharts` and the two
differ only in their sampler — exact vs resampled is a sampling decision, not a second algorithm,
and duplicating a conservative rasterizer is how the two drift — cost if wrong: one more file than
the spec lists.

**`rasterizeCharts`:** per output triangle, walk its destination bbox and take a texel whose centre
is inside the triangle **or within `EDGE_MARGIN_PX = Math.SQRT1_2` (half a texel diagonal) of an
edge** — the conservative margin that keeps bilinear sampling off an unwritten texel at a chart
border. Source coordinates come from inverting that triangle's chart placement
(`s = R(−turns)·(d − offsetPx) / scale`), not from barycentric interpolation. Record the chart in
`claims`; **throw when two different charts claim one texel** (spec §5.6) — two triangles of one
chart sharing a texel is normal and must not throw. Skip triangles whose vertices are orphans.

**`blitChartsExact`:** nearest copy, clamped at the source edge, and **assert every visited source
coordinate is a texel centre** (`|frac(s) − 0.5| < 1e-6`) — the assertion that proves the 4K bake
lost nothing but the JPEG round trip. **`resampleCharts`:** bilinear sample of `shrunk` at
`s × (shrunk.sizePx / sourceSizePx)` — that ratio is the only place the two texel grids meet.

- [x] `rasterizeCharts fills the texels a triangle covers and the margin around its edge` — one
      unturned chart, a right triangle over a 16² destination; assert an interior texel, a texel
      just outside an edge (within 0.707) and a texel 2 px outside, by literal index.
- [x] `rasterizeCharts throws when two charts claim one texel` — two placements landing on the same
      destination square.
- [x] `blitChartsExact reproduces the source texels` — 8² source of distinct byte values, one chart
      placed with `turns: 1` and an integer offset; assert the destination bytes equal the turned
      source bytes exactly, and that a placement with a half-texel offset throws.
- [x] `resampleCharts samples the shrunk grid, not the source grid` — `sourceSizePx = 8`, a 4²
      `shrunk` image, one unturned chart at `scale = 0.5`; assert one destination texel equals the
      literal bilinear tap. Real bug: forgetting the `shrunk.sizePx / sourceSizePx` ratio, which
      halves or doubles the sampled position and shifts the whole 2K atlas — no other test sees it,
      since Task 9's integration run takes the exact path.
- [x] Commit.

### Task 7: `paintOrphanBlocks` and `dilateAtlas`

**Files:** `tools/scene-recon/atlas/paintOrphanBlocks.ts`, `dilateAtlas.ts` (new), matching tests
under `tests/tools/scene-recon/atlas/`
**review:** no — two local pixel loops, both directly tested.

```ts
/** Vertices xatlas placed nowhere (`atlasIndex === -1`) come from faces whose three UVs coincide —
 *  OpenMVS's "no camera saw this face" fallback (one point, 3,801 faces, on mesh-cropped). Each
 *  distinct source UV gets a flat block of its own colour so no face is ever dropped. */
export function paintOrphanBlocks(
  atlas: AtlasImage,
  claims: Int32Array, // mutated: blocks become ATLAS_CLAIM.orphan
  source: AtlasImage,
  packed: PackedAtlas,
  sourceUvs: Float32Array, // 0..1
): { uvPxByVertex: Map<number, Vec2>; blocks: number };

/** 16 passes of empty-takes-the-mean-of-its-filled-8-neighbours, then the atlas mean colour for
 *  whatever is still empty: a black texel bleeds into every chart at low mips. */
export function dilateAtlas(atlas: AtlasImage, claims: Int32Array): void;
```

**`paintOrphanBlocks`:** group orphan vertices by source UV point. Per point, scan the atlas on an
`ORPHAN_BLOCK_PX = 6` stride for a 6×6 block whose 10×10 neighbourhood (an
`ORPHAN_BLOCK_BORDER_PX = 2` border) is entirely `free`; fill it with the source's nearest texel at
that UV, claim it, and map every vertex of that point to the block centre `(x0 + 3, y0 + 3)` in
destination texels. Throw when no block is free.

**`dilateAtlas`:** each pass reads the claims of the previous pass (double-buffer, so one pass grows
exactly one ring — single-buffered, one pass floods the atlas), writes `ATLAS_CLAIM.dilated`.

- [x] `paintOrphanBlocks places a block clear of claimed texels and returns its centre` — 32²
      destination with a claimed region; one orphan point; assert the block's texels carry the
      source colour, that no claimed texel was overwritten, that the 2-texel border touched nothing
      claimed, and that both vertices of the point map to the same centre.
- [x] `paintOrphanBlocks throws when the atlas has no room` — a fully claimed atlas.
- [x] `dilateAtlas grows one ring per pass and leaves no empty texel` — 64² atlas, a single filled
      red texel: assert the 8 neighbours are red, a texel 17 rings out is the atlas mean (not red,
      not zero), and that no texel is left at the fill sentinel. Real bug it catches: the
      single-buffered pass that floods everything red, and black texels surviving to the encoder.
- [x] Commit.

### Task 8: `repackedGeometry`

**Files:** `tools/scene-recon/atlas/repackedGeometry.ts` (new),
`tests/tools/scene-recon/atlas/repackedGeometry.test.ts` (new)
**review: yes** — vertex/index buffer construction plus the UV convention; a transposed or flipped
UV survives a green suite and only shows on the mesh.

```ts
/** The source mesh re-indexed onto the packed atlas: xatlas splits vertices along chart seams, so
 *  positions are gathered through `xref` and UVs come from the placements, never from xatlas. */
export function repackedGeometry(
  source: TexturedMeshGeometry,
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  orphanUvPxByVertex: ReadonlyMap<number, Vec2>,
  destSizePx: number,
  image: TexturedMeshGeometry['image'],
): TexturedMeshGeometry;
```

**Behaviour:** one output vertex per `packed.vertices` entry —
`positions[3i..] = source.positions[3·xref..]`, `uvs[2i..] = destPx / destSizePx` where `destPx` is
the vertex's source texel mapped through its chart's placement (for `chartIndex < 0`,
`orphanUvPxByVertex.get(i)`, throwing if it is missing). `indices = packed.indices`. Throw when the
triangle count differs from the source's — no face is dropped (spec §3, §5.3).

- [x] `repackedGeometry gathers positions through xref and derives UVs from the placement` — a
      2-triangle source whose second chart is turned once; assert every output position equals its
      `xref`'s source position and the UVs equal the placement mapping over `destSizePx`, literal.
- [x] `repackedGeometry gives an orphan vertex its block centre`.
- [x] `repackedGeometry throws when a face was dropped` — a `packed` with one triangle missing.
- [x] Commit.

---

## Group C — CLI and docs

### Task 9: `repack-atlas` CLI

**Files:** `tools/scene-recon/repackAtlas.ts` (new), `package.json` (script),
`tests/tools/scene-recon/repackAtlas.test.ts` (new)
**review:** no — an orchestration file whose every step is tested above; the whole-branch review
sees it.

```ts
export async function repackAtlas(
  group: SceneGroupDefinition,
  assetId: string,
  sizePx: 2048 | 4096,
): Promise<RepackAtlasReport>;
```

`main()` reads `sceneGroupFromArgv(process.argv)`, `argValue(process.argv, '--asset')` (required)
and `argValue(process.argv, '--size')`, guarded by the `invokedDirectly` check at `cropMesh.ts:112`.
Script: `"repack-atlas": "tsx tools/scene-recon/repackAtlas.ts"`.

Ruling: `--size` accepts only 2048 and 4096 and throws otherwise — the sibling id suffix scheme
(`-2k` / `-4k`) names exactly those two, and a `-3k` asset nobody can load is worse than an error —
cost if wrong: a later tier needs one more literal.

**Flow:**

1. `readSourceMesh(group, assetId)` (Task 1).
2. `sharp(geometry.image.bytes).metadata()` for the source atlas size; throw unless it is square.
3. `usedTexels = uvCoverage(geometry.uvs, geometry.indices) × sourceSizePx²`
   (`tools/scene-recon/crop/uvCoverage.ts`).
4. `fitAtlasScale(sizePx, usedTexels, (scale) => packCharts(geometry.uvs, geometry.indices, sourceSizePx, sizePx, scale))`.
5. Decode: `sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true })` at `scale === 1`;
   otherwise `.resize(n, n, { fit: 'fill', kernel: 'lanczos3' })` **before** `.raw()`
   (`tools/textures/fitPlutoChroma.ts:222`), `n = Math.round(sourceSizePx × scale)`. `removeAlpha`
   pins 3 channels — `AtlasImage` is RGB.
6. `chartPlacements` → `blitChartsExact` (scale 1) or `resampleCharts` → `paintOrphanBlocks` →
   `dilateAtlas`.
7. `sharp(atlas.rgb, { raw: { width: sizePx, height: sizePx, channels: 3 } }).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()`
   with `JPEG_QUALITY = 90`.
8. `repackedGeometry` → `publishDerivedMesh`, `idSuffix` `4k` / `2k`, `labelSuffix` `4K atlas` /
   `2K atlas`, step `repackAtlas` versioned
   `<sizePx>@<scale, 3 decimals> xatlas-wasm@<XATLAS_WASM_VERSION> q<JPEG_QUALITY>` —
   e.g. `4096@1.000 xatlas-wasm@0.1.3 q90` (spec §3).
9. `main()` prints one stderr line (spec §6):
   `repackAtlas: mesh-cropped → mesh-cropped-4k 4096² scale 1.000 | 12,945 charts, 4,461 orphan verts (1 block) | 470,046 tris | 4.33 MB (source 9.30 MB)`

**Test** (`repackAtlas.test.ts`) — tmpdir cwd via `process.chdir` in `beforeAll`/`afterAll`, the
fixture shape of `tests/tools/scene-recon/cropMesh.test.ts:39-88` (vitest v4's `forks` pool is what
makes `chdir` safe). Build a 256² source JPEG of three flat-coloured 64×64 squares, a `mesh.glb`
whose charts are those three squares (two triangles each) plus one degenerate face whose three UVs
are the same point inside a fourth colour, and a manifest holding it. Run at `sizePx = 2048` — the
signature admits only the two shipped sizes, so a real one it is; a mostly-empty 2048² atlas costs
the dilation a second or two, which is the price of testing what ships.

- [x] `repackAtlas publishes a sibling whose charts carry the source colours` — decode the published
      GLB's JPEG with sharp, sample each output triangle's centroid through its new UVs, assert the
      colour is the source chart's within ±3 per channel (flat blocks survive q90), and that `scale`
      is exactly 1 (the exact path).
- [x] `repackAtlas keeps every triangle, including the degenerate one` — `asset.triangleCount`
      equals the source's; the degenerate face's three output UVs are equal and sample its source
      colour within ±3. Real bug: xatlas dropping the point-UV faces silently.
- [x] `repackAtlas records the pack in provenance` — the asset is `mesh-2k`, labelled
      `<source label> — 2K atlas`, its last pipeline step is `repackAtlas` with a version matching
      `/^2048@1\.000 xatlas-wasm@\d+\.\d+\.\d+ q90$/`, the source asset object is untouched, and the
      manifest holds both ids.
- [x] **Landmine:** if vitest's SSR transform cannot load the wasm module, add `xatlas-wasm` to
      `test.server.deps.external` in `vitest.config.ts` — do not delete or skip the test.
- [x] Commit.

### Task 10: README

**Files:** `tools/scene-workbench/README.md`
**review:** no — prose; the whole-branch review reads it.

- [x] Extend the "Mesh outline" section's closing paragraph (`README.md:256-262`), which today ends
      at "the atlas itself is carried over unchanged": add
      `npm run repack-atlas -- --group <id> --asset <assetId> --size 4096|2048`, the sibling
      `<assetId>-4k` / `-2k` assets, that 4096 re-packs the existing charts pixel-exactly (only the
      JPEG re-encode is lost) while 2048 resamples at the largest scale that fits one atlas, and
      that exact-vs-resampled follows from the fit rather than a flag.
- [x] Note what the printed line reports (charts, orphan blocks, triangles, both file sizes).
- [x] Commit.

---

## Rulings

1. No perf gate — an offline bake CLI, nothing under `src/`.
2. P1's throw messages are re-prefixed to the extracted function names (Task 1).
3. One `Int32Array` of claims carries filled-ness and ownership; negative codes for non-chart fills
   (Task 2).
4. `XATLAS_WASM_VERSION` is a hand-maintained constant guarded by a test against `package.json`,
   not a runtime read — `xatlas-wasm`'s `exports` map blocks importing its own `package.json`, and
   the CLI's cwd is not the repo root under test (Task 3).
5. `fitAtlasScale` takes the pack attempt as a callback and returns the winning pack (Task 4).
6. `chartPlacements` picks the turn by minimal residual spread, and anchors the rounded integer
   offset at the xatlas bbox corner (Task 5).
   **As built:** the source mesh has mixed UV winding, so xatlas MIRRORS 6,393 of its 12,945
   charts and no 90° turn fits them; the fit searches all 8 dihedral transforms, `ChartPlacement`
   carries `mirrorX` (applied before the turn), and the residual bound is xatlas's per-axis
   ceil-to-whole-texel (≤ 1 px + noise) rather than an epsilon. Found by the first real run.
7. The raster is one shared `rasterizeCharts`; the spec's two bake files differ only in their
   sampler (Task 6).
8. `repackedGeometry` is a named function the spec does not list — the vertex/UV rebuild is real
   work with a real bug class and is otherwise buried in the CLI (Task 8).
9. `--size` accepts only 2048 and 4096 (Task 9).
10. **As built:** `repackedGeometry` takes `sourceSizePx` (glTF UVs are normalized, the placement
    maths is in source texels), and the CLI derives the placement scale from
    `shrunkSizePx / sourceSizePx` so it matches the resample ratio exactly (Tasks 8–9).
11. Chroma stays at sharp's 4:2:0 default; 4:4:4 costs +17.7 % (4.58 → 5.39 MB at 4K) and the
    user's eye check found no fringing.

## Definition of Done

**Deliverables**

- [x] `tools/scene-recon/derive/`: `readSourceMesh`, `publishDerivedMesh`, with `cropMesh.ts`
      rewired and its test unchanged — as the first commit on the branch.
- [x] `tools/scene-recon/atlas/`: `packCharts`, `fitAtlasScale`, `chartPlacements`,
      `rasterizeCharts`, `blitChartsExact`, `resampleCharts`, `paintOrphanBlocks`, `dilateAtlas`,
      `repackedGeometry`, `atlasClaims`.
- [x] `@types/`: `PackedVertex`, `PackedAtlas`, `ChartPlacement`, `AtlasImage`, `RepackAtlasReport`.
- [x] `npm run repack-atlas -- --group <id> --asset <assetId> --size 4096|2048` publishing
      `<assetId>-4k` / `-2k` with a `repackAtlas` pipeline step; `xatlas-wasm` devDependency.
- [x] README paragraph covering the CLI and the exact-vs-resampled rule.

**Observable behaviours — user, at review** (not blocking execution)

- [x] `npm run repack-atlas -- --group soendermarken-crop-2019 --asset mesh-cropped --size 4096`
      prints one line reporting scale 1.000, one atlas, ~12,9xx charts, 470,046 triangles and a
      ~4.3 MB atlas against the 9.3 MB source.
- [x] The same at `--size 2048` reports a scale near 0.44 and a ~1.2 MB atlas.
- [x] In the workbench, `mesh-cropped-4k` is indistinguishable from `mesh-cropped` at close range —
      no blur, no chart seams, no black speckle.
- [x] `mesh-cropped-2k` is softer but has the same colours and no seams; neither mesh has a hole
      where the source's degenerate faces are.
- [x] Re-running the same command overwrites the same sibling asset rather than adding one.

**Deferred — do not chase**

- Getting either atlas into the main app: mesh bodies have no tiers today
  (`tools/meshes/buildMeshes.ts:40-41`, `meshFetcher.ts:51`), and that is part 2's own slice.
- Decimation, datum, placement on Earth, unlit shading, the ground seam (part 2 backlog,
  `docs/backlog/2026-09-17-soendermarken-2019-mesh-body-on-earth.md`).
- A structured provenance record — the parameters ride the version string until a reader needs more.
- Deleting the throwaway spike previews in main's `public/data` (`mesh-cropped-4k`, `-2k`,
  `-4k-exact`): the first real publish replaces them.
- Re-parameterising the charts, welding the crop's T-junctions, or any change to which triangles
  exist.
