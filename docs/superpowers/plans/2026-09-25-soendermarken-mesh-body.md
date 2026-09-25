# Søndermarken mesh body — implementation plan

> **For agentic workers:** executed via `superpowers:subagent-driven-development` under `docs/superpowers/conventions/sdd-execution.md`. Steps use `- [ ]`.

**Goal:** the Søndermarken 2019 photogrammetry crop draws on Earth's terrain as a mesh body at its true georeferenced position and DVR90 height, with the terrain cut away underneath.

**Spec:** `docs/superpowers/specs/2026-09-25-soendermarken-mesh-body-design.md`

**Architecture:** three prep commits (seat kind, computed normals, tier spec objects), then build-side growth (simplify, georeferenced shift, hole mask, anchored site heights, rows + bake), then runtime (hole mask fetch, a terrain-hole bind group on the surface-tile pipeline, anchored bodies skip picking).

## Global constraints

- Conventions in `CLAUDE.md`: one symbol per `utils/`/`@types/` file, `type` never `interface`, comment budget (module header ≤ 10 lines, comment lines ≤ half the code lines), no barrels.
- `data/raw/` paths only through `tools/utils/io/rawDataRegistry.ts`.
- Worktree `public/data` is a real APFS clone, not a symlink: bakes write here, never into main's.
- Do not run `npm run format`; use `npx prettier --write <files>`.
- Source scan facts: 470,046 tris, one primitive, `POSITION` + `TEXCOORD_0`, one 8192² JPEG; ENU metres +X east +Y north +Z up; anchor (55.67, 12.53, 18.53 m DVR90); x ∈ [−428, −212], y ∈ [−145, 106], z ∈ [7.4, 44.1].

## Review focus

1. Scan winding: computed normals must point up on the lawn (mean normal z > 0); an inverted winding renders the park black.
2. Simplification seams: UV seams must not tear the atlas at the small tier (texture lookups across a collapsed seam smear).
3. Hole mask orientation: lon/lat rect vs texture rows (north-up vs south-up) — a flipped mask cuts the hole mirrored.
4. The hole binding on hosts with no holed mesh (Mars, Moon) must be a no-op, not a validation error.
5. Rovers unchanged: seat, contact decal, AO gate and positions byte-identical after the prep commits.

---

### Task 1: `MeshSeatKind` + required `seat` on `SurfaceFixedSite` (prep)

**Files:** create `src/@types/scene/MeshSeatKind.d.ts`; modify `src/@types/scene/SurfaceFixedSite.d.ts`, `src/data/bodies/surfaceFixedSites.ts`, `tools/utils/meshes/meshGroundUpSource.ts`, `tests/tools/utils/meshes/meshGroundUpSource.test.ts`.

```ts
export type MeshSeatKind = 'resting' | 'anchored';
// SurfaceFixedSite: + readonly seat: MeshSeatKind  (doc both arms in the type file, see spec §Data)
```
- [x] Add the type (doc comment: resting = seated on the highest ground in the footprint, AO/contact prebake required; anchored = georeferenced source placed by the build, height from its anchor, no prebake, not pickable).
- [x] All 4 rover rows `seat: 'resting'`. Fix `latDeg` doc: "Latitude, degrees — planetocentric on Mars; geodetic (WGS84) on Earth, which the Earth tiles map straight onto the sphere."
- [x] `meshGroundUpSource`: "seated" = the body's site exists AND `seat === 'resting'`. An anchored site's key returns `undefined` (not seated).
- [x] Test: `meshGroundUpSource` returns undefined for a key whose only body sits on an `anchored` site (use `vi.mock` of the site table, as the existing test does or equivalent).
- [x] Commit `refactor(bodies): MeshSeatKind on surface sites`.

### Task 2: computed smooth normals (prep)

**Files:** create `tools/utils/meshes/computeSmoothNormals.ts`, `tests/tools/utils/meshes/computeSmoothNormals.test.ts`; modify `tools/meshes/buildMeshes.ts` (~line 330, the `[0,0,1]` fallback).

```ts
export function computeSmoothNormals(positions: Float32Array, indices: Uint32Array): Float32Array; // area-weighted, unit length, per vertex
```
- [x] Tests: a flat CCW quad in the XY plane → all normals `[0,0,1]`; a vertex shared by two triangles at 90° → the normalized sum of the face normals weighted by area; a degenerate (zero-area) triangle contributes nothing and yields no NaN.
- [x] `buildMeshes`: a primitive without `NORMAL` gets `computeSmoothNormals` instead of `[0,0,1]`. Today's meshes all carry normals — no generated output changes (verify: `meshAssets.generated.ts` untouched is not required to be re-run; the typecheck + existing tests are the gate).
- [x] Commit `fix(meshes): compute smooth normals for a GLB without NORMAL`.

### Task 3: tier spec objects (prep)

**Files:** modify `tools/utils/io/meshSources.ts`, `tools/meshes/buildMeshes.ts`, `tests/tools/meshes/buildMeshes.test.ts`, `docs/DEPLOY.md`, `.claude/skills/add-mission/SKILL.md`; create `tools/meshes/@types/MeshTierSource.d.ts` (or `tools/@types/meshes/` if that is where the tier types sit — follow the `BakeTierResult` precedent: `tools/meshes/@types/`).

```ts
export type MeshTierSource = {
  readonly raw: RawDataKey;
  /** meshopt-simplify to this many triangles; absent = the full mesh. */
  readonly triangles?: number;
};
// MeshSourceEntry.tiers: Readonly<Partial<Record<Tier, MeshTierSource>>>
```
- [x] 7 rows become `tiers: { small: { raw: 'meshes.<key>' } }`. `buildMeshes` reads `.raw`. No behaviour change, no new test (type sweep); existing tests updated to the new shape.
- [x] Docs: DEPLOY.md and the add-mission skill show the new row shape. (DEPLOY.md never showed a row-shape literal — nothing there to update; add-mission's row example updated.)
- [x] Commit `refactor(meshes): per-tier source spec objects`.

### Task 4: simplify a tier to a triangle target

**Files:** create `tools/utils/meshes/simplifyToTriangles.ts`, `tests/tools/utils/meshes/simplifyToTriangles.test.ts`; modify `tools/meshes/buildMeshes.ts` (`bakeTier`).

```ts
export function simplifyToTriangles(
  positions: Float32Array, uvs: Float32Array, indices: Uint32Array, targetTriangles: number,
): { indices: Uint32Array; triangleCount: number }; // vertices unchanged (caller compacts or keeps)
```
- [x] Use `MeshoptSimplifier` from `meshoptimizer` 1.2.0 (`await MeshoptSimplifier.ready`), `simplifyWithAttributes` with the UVs as attributes (weight ~1 per UV channel) so seams hold; if seams stall the count above target, weld positions for the topology pass (meshopt's position remap) while keeping UV-split vertices for output. Target error large enough to reach the count.
- [x] Tests: a 64×64 grid (8192 tris) simplified to 2000 → count within ±5 % of 2000; a grid whose UVs split along a seam column keeps every output triangle's UVs from one side of the seam (no triangle spans UV u < 0.5 and u > 0.5 when the seam is at u = 0.5 with duplicated vertices).
- [x] `bakeTier`: when the tier's `triangles` is set, simplify after merge and before tangents; drop unreferenced vertices. Log kept/source counts. Refuse (throw) when the result misses the target by > 5 %.
- [x] Commit `feat(meshes): simplify a tier to a triangle target`.

### Task 5: georeferenced sources — anchored origin shift

**Files:** create `tools/utils/geo/enuOffsetM.ts` (+ test), `tools/meshes/@types/GeoreferencedMeshSource.d.ts` (or beside `MeshTierSource`), `src/@types/geo/GeodeticAnchor.d.ts` if no equivalent exists in `src/@types` (search first; `tools/scene-workbench/@types/GroupAnchor.d.ts` is tools-only and carries a heading — do not reuse it); modify `tools/utils/io/meshSources.ts`, `tools/utils/io/rawDataRegistry.ts`, `tools/meshes/buildMeshes.ts`, `tests/tools/meshes/buildMeshes.test.ts`; data: `data/raw/meshes/soendermarken/mesh.glb` (copy of `/Users/rulkens/Development/js/skymap/public/data/geo3d/groups/soendermarken-crop-2019/assets/mesh-cropped/mesh.glb`, gitignored), `data/raw/meshes/meshes.sha256` (add its line), `data/raw/meshes/soendermarken/README.md` (provenance: workbench group, crop outline, frame, licence).

```ts
export type GeodeticAnchor = { readonly latDeg: number; readonly lonDeg: number; /** metres on the host terrain's datum (DVR90 on Earth) */ readonly heightM: number };
export type GeoreferencedMeshSource = {
  readonly anchor: GeodeticAnchor;
  /** Repo path of the committed crop ring (`ringM`, source ENU metres). */
  readonly holeOutline: string;
};
// MeshSourceEntry: + readonly georeferenced?: GeoreferencedMeshSource
/** East/north metres of `to` from `from` on the local tangent plane at `from` (sphere radius R). */
export function enuOffsetM(from: {latDeg;lonDeg}, to: {latDeg;lonDeg}, radiusM: number): [number, number];
```
- [x] `enuOffsetM` tests: 0.001° of latitude at R = 6,371,008.8 m → north 111.19 m (±0.01), east 0; 0.001° of longitude at lat 55.67° → east 62.73 m (±0.02). Use the Earth mean radius constant the app uses for Earth's sphere (find it; do not add a new one).
- [x] Registry row `meshes.soendermarken` (file, gitignored, upstream = the workbench group id + Dataforsyningen skråfoto, readme row).
- [x] `buildMeshes`: for a georeferenced key, find its body's `SurfaceFixedSite` (join through `SCENE_MESH_BODIES`, like `meshGroundUpSource`); skip the centroid recentre; translate by `[−e, −n, 0]` with `[e, n] = enuOffsetM(anchor, site)`. `boundingRadiusM`, `minZ` measured from that origin.
- [x] Guards (throw, tested): georeferenced key whose site is not `anchored`; an `anchored` site whose key is not georeferenced; georeferenced key with no site.
- [x] Commit `feat(meshes): georeferenced sources keep their anchor, shifted onto the site`.

### Task 6: hole mask bake

**Files:** create `tools/utils/meshes/rasterizeHoleMask.ts` (+ test), maybe `tools/utils/geo/erodeMask.ts` (+ test) if erosion is not a few lines inside; modify `tools/meshes/buildMeshes.ts`, `tools/meshes/meshAssetRowFields.ts`, `src/@types/data/mesh/MeshAssetRow*` (wherever the generated row type lives), `tools/deploy/r2/allowDataFile.ts` if `_hole.webp` is not already allowed (add a test case in `tests/tools/deploy/r2/allowDataFile.test.ts`).

```ts
// generated row: + readonly hole?: { readonly lonMinDeg: number; readonly latMinDeg: number; readonly lonSpanDeg: number; readonly latSpanDeg: number }
export function rasterizeHoleMask(ringEnuM: readonly [number, number][], metresPerPx: number, erodeM: number):
  { mask: Uint8Array; width: number; height: number; minEnuM: [number, number]; sizeEnuM: [number, number] };
// row 0 = NORTH edge (texture v = 0 at the rect's max latitude); 255 = hole, 0 = keep terrain
```
- [x] Tests: a 100 × 100 m square ring at 1 m/px, erode 0 → a 100×100 mask of all 255 inside (border px ±1); erode 2 → the 2 m band along every edge is 0; an L-shaped ring leaves its notch 0; row 0 is the north edge (ring asymmetric in y, assert which rows are filled).
- [x] `buildMeshes` for a georeferenced key: read `holeOutline` (`ringM`), shift it by the same `[−e, −n]`, rasterise at 0.5 m/px with erode 2 m, write `public/data/meshes/<key>_hole.webp` (lossless, single channel via sharp), convert the ENU rect to lat/lon (inverse of `enuOffsetM` around the site) and emit `hole` on the row.
- [x] Commit `feat(meshes): bake a terrain-hole mask for georeferenced meshes`.

### Task 7: anchored site heights

**Files:** modify `tools/textures/buildSiteGroundHeights.ts` (+ its test if one exists; else add `tests/tools/textures/buildSiteGroundHeights.test.ts` only for the anchored arm).

- [x] One dispatch on `site.seat`: `resting` → unchanged; `anchored` → height = the key's `georeferenced.anchor.heightM`; up = `normalize([−e/R, −n/R, 1])` with `[e, n] = enuOffsetM(anchor, site, R)`. No tile manifest read for anchored rows.
- [x] Test: the anchored arm returns 18.53 and an up tilted by e/R ≈ −5.0e-5 in east for a site 320 m east of its anchor (factor the per-site computation out so it is testable without manifests).
- [x] Commit `feat(bodies): anchored sites take their source anchor's height`.

### Task 8: rows + bake

**Files:** modify `tools/utils/io/meshSources.ts`, `src/data/bodies/surfaceFixedSites.ts`, `src/data/bodies/sceneMeshBodies.ts`, `src/data/bodies/rotationElements.ts`; regenerate `src/data/bodies/meshAssets.generated.ts`, `src/data/bodies/siteGroundHeights.generated.ts`; bake outputs into the worktree's `public/data/meshes/` + manifest.

- [x] `MESH_SOURCES.soendermarken`: `tiers: { small: { raw: 'meshes.soendermarken', triangles: 150_000 }, medium: { raw: 'meshes.soendermarken' } }`, `licence: 'CC BY 4.0'`, `attribution: 'Contains skråfoto © Klimadatastyrelsen (CC BY 4.0); photogrammetry by Alexander Rulkens'`, `georeferenced: { anchor: { latDeg: 55.67, lonDeg: 12.53, heightM: 18.53 }, holeOutline: 'data/geo3d/soendermarken-crop-2019/mesh.outline.json' }`. No `bodyFromSource` (source frame = body frame: +X east, +Z up).
- [x] Site `{ id: 'soendermarken', hostId: 'earth', latDeg: 55.670015, lonDeg: 12.524611, altitudeM: 0, seat: 'anchored' }` (crop-bounds centre); seed `{ id: 'soendermarken', label: 'Søndermarken', meshKey: 'soendermarken', standoffRadii: 1.5 }`; rotation `{ kind: 'surfaceLocked', id: 'soendermarken', headingDeg: 90 }` (+X east).
- [x] Raw GLBs for the other 7 keys: `cp -c` each file from `/Users/rulkens/Development/js/skymap/data/raw/meshes/<key>/` into this worktree's `data/raw/meshes/<key>/` (APFS clone; never symlink). Run `npm run build-meshes`, then `npm run build-site-ground-heights`. Rover rows in both generated files must be unchanged (diff them); if a resting site's manifest is missing in the worktree, stop and report.
- [x] Sanity (report in reply): small tier tri count, medium tri count, bounding radius (~170 m expected), mean computed normal z > 0, mask px dims.
- [x] Commit `feat(bodies): Søndermarken scan as an Earth mesh body` (generated TS + rows; `public/data` is gitignored).

### Task 9: fetch the hole mask — `review: yes`

**Files:** modify `src/services/loading/fetchers/meshFetcher.ts`, `src/@types/data/mesh/MeshAsset*.d.ts`, `tests/services/loading/fetchers/meshFetcher.test.ts`.

- [x] When the row has `hole`, fetch `meshes/<key>_hole.webp` (untiered, via the manifest like `_contact`) and decode to an `ImageBitmap` (or whatever form `_contact` takes); `MeshAsset.holeMask?`. Test: a row with `hole` fetches the `_hole` URL; without `hole`, no request.
- [x] Commit `feat(meshes): load the terrain-hole mask with the mesh`.

### Task 10: terrain-hole bind group — `review: yes`

**Files:** modify `src/services/gpu/renderers/bodies/surfaceTileRenderer.ts`, `src/services/gpu/renderers/bodies/surfaceTileLayout.ts` (if uniforms written there), `src/services/engine/frame/passes/surfaceTilesPass.ts`, `src/services/gpu/shaders/bodies/surfaceTile/{io,vertex,fragmentEarth,fragmentBare}.wesl` (+ any new `hole.wesl`); tests under `tests/services/gpu/renderers/bodies/` for the uniform packing.

Contract:
- One new bind group (next free group index) on every surface-tile pipeline variant: `@binding(0)` `texture_2d<f32>` hole mask, `@binding(1)` sampler (linear, clamp), `@binding(2)` uniform:

| offset | field | type |
|---|---|---|
| 0 | `lonLatMinRad` | vec2<f32> |
| 8 | `invSpanRad` | vec2<f32> (1/lonSpan, 1/latSpan; 0,0 = no hole) |
| total | 16 B | |

- Vertex: `holeUv = ((lon0 − holeLonMin) + du·dLon, (latMax − lat))·invSpan` computed from the tile's own lattice lat/lon terms (subtract the rect origin before scaling so f32 keeps precision); v = 0 at the rect's max latitude (matches mask row 0 = north). New `@location(11) holeUv: vec2<f32>`.
- Fragment (both variants): `if (all(holeUv >= 0) && all(holeUv <= 1) && textureSample(mask, s, holeUv).r > 0.5) { discard; }` — sample in uniform control flow (sample first, branch after).
- Host with no resident holed mesh: 1×1 zero mask + zero uniform, created once.
- `surfaceTilesPass`: the host's holed mesh = the body on this host whose site is `anchored` and whose `MeshAsset.holeMask` is loaded; > 1 holed mesh on a host → throw at module load (derive from `SURFACE_FIXED_SITES` + `MESH_ASSETS`).
- [ ] Test: the uniform packer writes `[lonMin, latMin, 1/lonSpan, 1/latSpan]` in radians for a row's `hole`, and zeros for none.
- [ ] Load the `wesl-shaders` skill guidance: read `.claude/skills/wesl-shaders/SKILL.md` before editing shaders.
- [ ] Commit `feat(terrain): cut a hole under a georeferenced mesh`.

### Task 11: anchored bodies skip picking

**Files:** modify `src/services/engine/frame/passes/meshBodiesPass.ts` (`drawPick`), maybe a tiny `src/utils/meshBodies/isAnchoredBody.ts` (+ test only if it can fail).

- [ ] `drawPick` skips bodies whose `SurfaceFixedSite.seat === 'anchored'`. Update the "Pick set = draw set" doc comment. No new test unless a helper is extracted.
- [ ] Commit `feat(meshes): anchored mesh bodies are not pickable`.

### Task 12: docs

**Files:** `docs/DATA.md` or `docs/DEPLOY.md` (the `_hole.webp` companion + georeferenced source), `docs/RENDERER.md` (terrain-hole group, one line in the surface-tile section), `.claude/skills/add-mission/SKILL.md` (the `seat` field on a site row).
- [ ] Commit `docs: georeferenced mesh bodies and the terrain hole`.

## Definition of Done

- [ ] Deliverables: `MeshSeatKind`, `computeSmoothNormals`, `simplifyToTriangles`, `enuOffsetM`, `rasterizeHoleMask`, `MeshTierSource`, `GeoreferencedMeshSource`; `meshes/soendermarken-{small,medium}.*`, `meshes/soendermarken_hole.webp` in the worktree manifest.
- [ ] Typecheck + suite green in CI.
- [ ] Rover generated rows unchanged.
- [ ] Smoke (user): fly to Søndermarken via search → the scan draws, textured and lit, seated on terrain with no gap at the rim; no terrain poking through the lawn; the hole is invisible (no blue/black pit) from above and at a low angle; tier switch small↔medium changes texture sharpness; clicking the park does not select it; Mars rovers unchanged.
- [ ] Deferred: R2 sync (after merge, from main, on the user's word); multi-hole hosts; de-lighting.
