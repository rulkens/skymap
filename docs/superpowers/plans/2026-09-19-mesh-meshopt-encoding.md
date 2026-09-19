# Mesh bodies: meshopt-encoded `.mesh` + one triangle budget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Petunias joins the generic prebake pipeline, every triangle count collapses to one 600k budget, and `.mesh` becomes a quantised meshopt-encoded v3, unpacked to today's float32 arrays on load.

**Architecture:** Three commits on PR #761, in task order. The format keeps its one writer (`tools/meshes/writeMeshBinary.ts`) and one reader (`decodeMesh` in `src/data/mesh/meshBinaryFormat.ts`). `MeshAsset`, `MESH_VERTEX_SLOTS`, the GPU layout and the shaders are untouched.

**Tech stack:** TypeScript, `meshoptimizer` 1.2.0 (already a devDependency), Blender 5.2 LTS for the Python prebake.

**Spec:** `docs/superpowers/specs/2026-09-19-mesh-meshopt-encoding-design.md`

**Worktree:** `.claude/worktrees/mesh-meshopt-format`, branch `mesh-meshopt-format`. Every implementer works here.

## Global constraints

- `MESH_TRIANGLE_BUDGET = 600_000`, defined once. No other triangle count may survive anywhere in `tools/` or `.claude/skills/`.
- Normals and tangents use the octahedral filter at **10 bits**, in i16×4 storage (8 bytes). The stream order is fixed. There is no per-stream descriptor table.
- Clean break: `decodeMesh` accepts v3 only.
- Blender output (`data/raw/meshes/**`, `public/data/meshes/**`) is gitignored and is never committed.
- Comments follow `docs/superpowers/conventions/comments.md` (module header ≤ 5 lines, comment lines ≤ half the code lines). `type` aliases, never `interface`.

---

### Task 1: Petunias through the generic pipeline

**Files:**
`tools/meshes/prebake/importMesh.py` (modify), `tools/meshes/prebake/meshPrebake.py` (modify: `SOURCES` row only),
`tools/meshes/prebake/petuniasPrebake.py` (delete), `package.json` (delete the `prebake-petunias` script),
`tools/utils/io/rawDataRegistry.ts` (modify `meshes.petunias*` rows at ~1247–1275), `data/raw/meshes/petunias/README.md` (rewrite; gitignored? check `git check-ignore`, commit only if tracked)

**Contract:**

- `importMesh.py`: `source()` gains `weld=None`. When set, it gives the merge distance in metres, and each surface mesh gets `remove_doubles(threshold=weld)` after `unify_source_uvs`. The docstring reason, carried from `petuniasPrebake.py:98-102`: SketchUp exports every face as its own island of loose vertices. Unwelded, `smart_project` yields ~150k one-triangle islands, and COLLAPSE decimation has no edges to collapse along.
- The new row: `"petunias": source("petunias.glb", weld=0.0002, drop_materials=…)`.
- **The duplicate pot shell.** `petuniasPrebake.py:44-66` deletes the faces on material `"material"`: an untextured white twin coincident with `MarianneStonePot2`, which wins the flattened bake if kept. First inspect the source (`npx --yes @gltf-transform/cli inspect data/raw/meshes/petunias/petunias.glb`, or Blender):
  - If every `"material"` face sits on objects whose ONLY material is `"material"`, then `drop_materials=("material",)` handles it through the existing `markers()` and needs no new code.
  - If the twin shares objects with other materials, **STOP and report**. Face-level dropping is a design change to `markers()`, which the rovers also use.
- Face-less LINES primitives need nothing new: `meshPrebake.py` `keepers()` already leaves face-less meshes behind.
- `meshPrebake.py`: add `source("petunias")` to `SOURCES` (`meshPrebake.py:117`).
- Registry:
  - Add a `meshes.petuniasBlend` row, copied in shape from `meshes.voyagerBlend`, with `fetcher: 'tools/meshes/prebake/importMesh.py'`.
  - Re-point `meshes.petunias` to `fetcher: 'tools/meshes/prebake/meshPrebake.py'`, and rewrite its description (it currently says `npm run prebake-petunias`).
- `data/raw/meshes/petunias/README.md`: rewrite in the shape of `data/raw/meshes/voyager/README.md` ("the `.blend`" and "what the pre-bake does" sections).

**Data:** the worktree owns its own `data/`. Before running anything, copy `data/raw/meshes/petunias/` from the main checkout (`/Users/rulkens/Development/js/skymap/data/raw/meshes/petunias/`) into the worktree's `data/raw/meshes/petunias/`.

No new automated test: this is Blender-only code, and CI never runs it.

- [ ] Inspect the source for the duplicate-shell question above; STOP if it is face-level.
- [ ] Implement the contract.
- [ ] `npm run import-mesh -- petunias`: the log shows the welded vertex count and the marker drop.
- [ ] `npm run prebake-mesh -- petunias`: the log shows joined tris, the decimated count (≤ 150k for now; Task 2 changes the budget), and all five atlases written. Nothing raises.
- [ ] `git grep -n petuniasPrebake` returns only `docs/superpowers/**` history.
- [ ] Commit: `refactor(meshes): petunias through importMesh + meshPrebake`.

---

### Task 2: One triangle budget

**Files:**
`src/data/mesh/meshTriangleBudget.ts` (create), `tools/meshes/prebakeMesh.ts` (modify), `tools/meshes/prebake/meshPrebake.py` (modify),
`tools/meshes/buildMeshes.ts` (modify: lines 36–41 and 478–495), `.claude/skills/add-mission/SKILL.md` (modify: line 144 and the Procedure step 4 text)

**Contract:**

```ts
// src/data/mesh/meshTriangleBudget.ts
export const MESH_TRIANGLE_BUDGET = 600_000;
```

The header comment says why the constant lives in `src/data`: it describes what the renderer affords, and both the prebake driver and the build read it.

- `prebakeMesh.ts`: always passes `--triangles <MESH_TRIANGLE_BUDGET>` after the key.
- `meshPrebake.py`:
  - `parse_args` gets a required `--triangles` int.
  - `source()` loses its `triangles` parameter, and the `perseverance` row drops `triangles=100_000`.
  - `main()` calls `decimate(obj, args.triangles)`.
- `buildMeshes.ts`:
  - Delete `TRIANGLE_BUDGET` and the dynamic-import `simplify` block.
  - If `countTriangles(doc) > MESH_TRIANGLE_BUDGET`, throw `buildMeshes: ${key} has ${n} tris, over MESH_TRIANGLE_BUDGET (${MESH_TRIANGLE_BUDGET}); re-run npm run prebake-mesh -- ${key}`.
  - Update the budget docblock: `TEXTURE_SIZE_BUDGET` stays local, and the triangle half now points at the shared constant.
- `SKILL.md`: step 4 says the prebake decimates to the one `MESH_TRIANGLE_BUDGET` (`src/data/mesh/meshTriangleBudget.ts`), with no per-row `triangles=`.

No new test: the guard is a three-line comparison against a constant, and a fixture over 600k triangles would cost more than the bug it could catch (`docs/superpowers/conventions/testing.md`).

- [ ] Implement the contract.
- [ ] `git grep -nE "150_000|TRIANGLE_TARGET|TRIANGLE_BUDGET\b|triangles=" -- tools .claude/skills` returns nothing budget-related.
- [ ] `npm run prebake-mesh -- perseverance` (copy `data/raw/meshes/perseverance/` from main first): the log shows no decimation (the source is ~200k tris, under 600k).
- [ ] `npm test -- tests/tools/meshes` is green.
- [ ] Commit: `refactor(meshes): one MESH_TRIANGLE_BUDGET (600k)`.

---

### Task 3: `.mesh` v3 — quantised, meshopt-encoded

`review: yes` (binary format and parser)

**Files:**
`src/data/mesh/meshBinaryFormat.ts` (modify), `tools/meshes/writeMeshBinary.ts` (modify), `src/services/loading/fetchers/meshFetcher.ts` (modify: line 40),
`src/data/mesh/meshVertexSlots.ts` (docblock line 5 only: "48-byte interleaved stride" → the v3 streams), `package.json` (`meshoptimizer` from devDependencies to dependencies, same pinned version),
`tests/data/mesh/meshBinaryFormat.test.ts`, `tests/tools/meshes/writeMeshBinary.test.ts`, `tests/tools/meshes/buildMeshes.test.ts` (modify)

**Byte layout (v3).** Little-endian throughout. Magic stays `SKMH`.

| offset | field                                                   | type  |
| ------ | ------------------------------------------------------- | ----- |
| 0      | magic                                                   | u8×4  |
| 4      | version = 3                                             | u32   |
| 8      | vertexCount                                             | u32   |
| 12     | indexCount                                              | u32   |
| 16     | boundingRadiusM                                         | f32   |
| 20     | posMin                                                  | f32×3 |
| 32     | posScale                                                | f32   |
| 36     | byteLength of each stream                               | u32×5 |
| 56     | streams, back to back, each padded to a 4-byte boundary |       |

| #   | stream    | element before encoding                                              | encode call                                       |
| --- | --------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| 0   | positions | u16×4, 8 B: `round((p − posMin) / posScale)`, w = 0                  | `encodeGltfBuffer(…, count, 8, 'ATTRIBUTES')`     |
| 1   | normals   | i16×4, 8 B, from `encodeFilterOct(n4, count, 8, 10)` with w = 0      | `encodeGltfBuffer(…, count, 8, 'ATTRIBUTES')`     |
| 2   | tangents  | i16×4, 8 B, from `encodeFilterOct(t4, count, 8, 10)`, w = handedness | `encodeGltfBuffer(…, count, 8, 'ATTRIBUTES')`     |
| 3   | uvs       | u16×2, 4 B: `round(uv × 65535)`                                      | `encodeGltfBuffer(…, count, 4, 'ATTRIBUTES')`     |
| 4   | indices   | u32                                                                  | `encodeGltfBuffer(…, indexCount, 4, 'TRIANGLES')` |

`posScale = (largest bbox extent) / 65535`, one isotropic scale. For a degenerate zero extent, use `posScale = 1`.

**Writer (`writeMeshBinary`):**

- The signature becomes `async function writeMeshBinary(geometry: …same input…): Promise<ArrayBuffer>`. It awaits `MeshoptEncoder.ready` itself; update the one call site at `buildMeshes.ts:498`.
- It first calls `MeshoptEncoder.reorderMesh(indices, true, false)` and applies the remap to every attribute. The remap leaves the vertex count unchanged, except that unreferenced vertices drop; `vertexCount` in the header is the post-remap count.
- It throws on any UV outside [0, 1].

**Reader:**

```ts
export async function decodeMesh(buf: ArrayBuffer): Promise<DecodedMeshGeometry>;
```

- Awaits `MeshoptDecoder.ready`, then decodes the five streams with `MeshoptDecoder.decodeGltfBuffer`, using the octahedral filter for streams 1 and 2.
- Unpacks to the same float32 arrays v2 returned:
  - positions: `posMin + q × posScale`;
  - normals: the filter output is i16 snorm, so xyz / 32767, renormalised;
  - tangents: the same, with w snapped to ±1 by sign;
  - uvs: `q / 65535`.
- Errors are kept verbatim: bad magic throws `/magic/`; any version other than 3 throws the existing `/version/` + `build-meshes` message.
- `meshFetcher.ts:40` becomes `await decodeMesh(buf)`.

**Tests (these names are the acceptance criteria):**

- `writeMeshBinary.test.ts` › `round-trips a quad with tangents within quantisation bounds`. On the existing fixture, assert:
  - counts are equal;
  - the set of triangles, each as its sorted-rotation position triple, equals the input set (the codec may rotate a triangle's vertices, but winding is kept);
  - every position is within `posScale / 2 + 1e-6`;
  - normal and tangent angular error is ≤ 0.3°, and each is unit length within 1e-5;
  - the tangent w sign is exact;
  - UV error is ≤ 0.5 / 65535 + 1e-7;
  - `boundingRadiusM` is exact.
- `writeMeshBinary.test.ts` › `throws on a uv outside [0, 1]`.
- `writeMeshBinary.test.ts` › `encodes a 10k-vertex grid to under a third of the v2 size`. The layout's sole guard against a stream silently shipping unquantised: compare against `20 + 48·V + 4·I`.
- `meshBinaryFormat.test.ts`: keep the magic and version rejection tests. The v2 fixture builder becomes a v2-header fixture used only by the version test. The v2-layout decode test is replaced by the round trip above; delete it.
- `buildMeshes.test.ts`: every `decodeMesh(readMesh())` becomes `await`.
  - Exact `toEqual` on positions, normals or tangents becomes the same tolerances as above.
  - The exact index-order assertion at ~line 365 (`[0, 2, 1]`) becomes a winding assertion on the triangle's position triple: its intent is the winding flip, so assert the face normal's sign, not the index order.

- [ ] Write the new writer tests (and adjust the reader tests); run them; they fail.
- [ ] Implement the writer and reader, and move the dependency.
- [ ] `npm test -- tests/tools/meshes tests/data/mesh` is green, and `npm run typecheck:fast` is clean.
- [ ] Commit: `perf(meshes): .mesh v3 — quantised + meshopt-encoded, unpacked on load`.

---

### Task 4 (controller, not dispatched): bake and eye-check in the worktree

- [ ] Copy every other key's `data/raw/meshes/<key>/` (downloads, `.blend`, prebaked GLB + atlases) from main into the worktree. Otherwise `build-meshes` deletes their generated rows.
- [ ] `npm run build-meshes`. Check that `meshAssets.generated.ts` changes only where expected: the petunias row picks up PBR/AO slots, and the perseverance row changes. Total `public/data/meshes/*.mesh` size is ≈ 5–6 MB gzipped.
- [ ] Start `/dev` in the worktree, **without** `/link-data` for meshes, so that the worktree's own bake is what renders.
- [ ] Ask the user to eye-check:
  - petunias against its old look (the new `_mr`/`_normal`/AO, no confetti atlas, no white pot);
  - perseverance at full resolution;
  - Hubble's foil highlights, to catch any banding from the 10-bit normals.

## Definition of Done

**Deliverable inventory**

- `src/data/mesh/meshTriangleBudget.ts` exports `MESH_TRIANGLE_BUDGET = 600_000`.
- `.mesh` v3 writer and reader.
- `meshoptimizer` sits in `dependencies`.
- `petuniasPrebake.py` and `prebake-petunias` are gone; petunias goes through `importMesh` + `meshPrebake`.
- `docs/backlog/2026-09-19-jwst-mesh-body.md` exists, with its BACKLOG index line.

**Observable behaviours, for the manual smoke**

- All eight mesh bodies load and render in the worktree dev server: Voyager 1/2, Hubble, the three rovers' sites, the lunar module, the whale, the petunias.
- The petunias show textured pots and flowers: no flat white pot, no speckled confetti.
- Perseverance has visibly finer geometry than before.
- There's no highlight banding on Hubble's foil at close range.
- The dev server's network panel shows each `.mesh` at roughly the sizes in the spec's table.

**Deferred (out of scope)**

- Feeding quantised attributes to the GPU directly (VRAM saving; this touches shaders).
- A worker-thread decoder.
- JWST itself (backlog, blocked on the L2 driver).

**Post-merge, from the main checkout, back to back** (production mesh bodies are down from merge until the sync finishes):
copy `data/raw/meshes/petunias/petunias.blend` over, or re-run `npm run import-mesh -- petunias` → `npm run prebake-mesh -- petunias` → `npm run prebake-mesh -- perseverance` → `npm run build-meshes` → `npm run sync-r2-secure`.
