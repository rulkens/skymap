# Milky Way structures — PR 1 ground preparation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the nine joints in-Galaxy structure categories need (P1–P9), all behaviour-neutral: the four existing categories load, draw, fade, pick, focus and count exactly as before.

**Architecture:**

- Category lists and the seed's units stop being hand-maintained (P8, P9).
- A structure registry row states `galaxyMembers` and `slab`; a style row states `visibleBand`.
- Focus distance follows radius alone; the near-object guards follow radius.
- Marker instances are uploaded camera-relative.
- A second marker pass and a second label registration exist on the NEAR0 slab and draw nothing yet.

**Tech stack:** TS, Vitest, WESL, raw WebGPU.

**Spec:** [`docs/superpowers/specs/2026-10-05-milky-way-structures-design.md`](../specs/2026-10-05-milky-way-structures-design.md), §3 (Ground preparation).

## Global constraints

- Behaviour-neutral. No existing test changes its expected values, except tests that assert a renamed seed field or a moved function argument, which change shape only.
- No new structure category, source code, fade band or seed row lands in this PR.
- `type` aliases, never `interface`. One type per `@types/` file, one function per `utils/` file, filename = symbol. No barrels.
- Frame files (`src/services/engine/frame/**`) export only their named symbol; constants go to `src/data/`, helpers to `src/utils/`.
- File moves use `npm run move-files -- <from> <to>`, never `git mv`.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. When a task changes what a comment describes, rewrite the comment; do not narrate the refactor.
- Each task is its own commit. Format with `npx prettier --write <files>`, never `npm run format`. Stage files by path, never `git add -A`.
- No `Co-Authored-By` lines in commits.
- Read `docs/RENDERER.md` before Tasks 5–9, and `docs/DATA.md` before Task 2.

## Review focus

1. **Draw and pick stay aligned (Tasks 7, 8).** The ring a user sees and the ring that answers a click come from the same instance buffer and the same view-projection. A mismatch shows only as clicks landing beside rings.
2. **Per-category pick index (Task 8).** A pick decodes as `structures.byCategory(id)[localIdx]`. Splitting descriptors across two renderers must keep each category's instances in `structures.all()` order within its bucket.
3. **Band multiplication is the same number (Task 5).** Moving the fade from one pass-level scalar to a per-category factor must leave ring, halo and label alpha identical at every camera distance, including the zero-alpha skip.
4. **Camera-relative precision (Task 7).** The subtraction `worldPos − camPos` happens in f64 before narrowing; the view-projection handed to the shader has its eye translation folded out the same way. Doing either in f32 reintroduces the jitter the task removes.
5. **Seed migration is value-exact (Task 2).** Every existing row's world position and radii are bit-identical before and after.

---

### Task 1 (P8): Derive the hand-listed category sets

**Files:** `src/services/engine/wiring/wireStructureProjection.ts`, `tools/parsers/parseStructureSeed.ts`, `src/data/structure/buildStaticAnchorStructures.ts`, `tests/tools/parsers/parseStructureSeed.test.ts`

- [ ] `emitCounts` (`wireStructureProjection.ts:58-65`) builds its payload by iterating `STRUCTURE_IDS` (`src/data/structure/structureIds.ts`) instead of naming four keys.
- [ ] `VALID_CATEGORIES` (`parseStructureSeed.ts:22`) becomes `STRUCTURE_IDS`; the error message lists them from the array. Confirm the tools tsconfig can import from `src/data/` (other tools already do); if it cannot, stop and report.
- [ ] `SeedEntry.category` (`buildStaticAnchorStructures.ts:64`) is typed `StructureId`.
- [ ] No new test: these are type and plumbing changes the compiler and the existing suites cover. Update `parseStructureSeed.test.ts:30` only if it asserts the error string.
- [ ] Commit.

### Task 2 (P9): Unit-tagged seed lengths — `review: yes`

**Files:** `src/@types/data/Length.d.ts` (new), `src/utils/math/lengthToMpc.ts` (new), `tests/utils/math/lengthToMpc.test.ts` (new), `data/seeds/structure_anchors.seed.json`, `tools/parsers/parseStructureSeed.ts`, `src/data/structure/buildStaticAnchorStructures.ts`, `tools/structures/buildStructures.ts`, `src/data/animation/tours/demoTour.ts`, `src/@types/data/SkyCoord.d.ts` (only if it documents the seed fields), `docs/DATA.md`, and the tests `tests/tools/parsers/parseStructureSeed.test.ts`, `tests/data/structureAnchors.test.ts`, `tests/data/structure/buildStaticAnchorStructures.test.ts`, `tests/tools/structures/buildStructures.test.ts`

**Contract:**

```ts
// src/@types/data/Length.d.ts
export type Length = { readonly value: number; readonly unit: 'pc' | 'kpc' | 'Mpc' };
// src/utils/math/lengthToMpc.ts
export function lengthToMpc(length: Length): number;
```

Seed rows change three fields; nothing else:

```json
"distance": { "value": 16.5, "unit": "Mpc" },
"physicalRadius": { "value": 2.2, "unit": "Mpc" },
"apparentRadius": { "value": 6, "unit": "Mpc" }
```

- [ ] Before editing, capture a snapshot for the value-exact check: run `buildStaticAnchorStructures()` and save each record's `id`, `worldPos`, `physicalRadiusMpc`, `apparentRadiusMpc` to a scratch file.
- [ ] Add tests `lengthToMpc converts pc, kpc and Mpc to the same value for the same physical length` (1e6 pc, 1e3 kpc, 1 Mpc → 1) and `lengthToMpc returns Mpc values unchanged` (16.5 Mpc → exactly 16.5, no arithmetic).
- [ ] Migrate all 42 rows with a script, all to unit `"Mpc"` with their existing numbers. Do not hand-edit.
- [ ] Parser: `StructureSeedEntry` carries `distance`, `physicalRadius`, `apparentRadius` as `Length`; validation requires `value > 0` and a known unit. Add the test `parseStructureSeed rejects an unknown length unit`.
- [ ] `buildStaticAnchorStructures` and `buildStructures` convert with `lengthToMpc` at the point they read the seed. Runtime records, `SkyCoord`, shaders and uniforms keep their Mpc fields.
- [ ] Update `demoTour.ts` and any other reader found by searching for `distMpc`, `physicalRadiusMpc` and `apparentRadiusMpc` on a seed row. Readers of the runtime `StructureInfo` fields are not touched.
- [ ] Re-run the snapshot and diff it against the scratch file: every number identical. Report the diff result.
- [ ] `docs/DATA.md`: describe the unit-tagged fields where the seed schema is documented.
- [ ] Commit.

### Task 3 (P6): `galaxyMembers` on the structure registry row

**Files:** `src/@types/data/structure/StructureSourceEntry.d.ts`, `src/data/sources/cluster.ts` and the three sibling structure rows, `src/services/engine/subsystems/structureFocusSubsystem.ts`, `src/layers/galaxyCatalog/frame.ts`, `tests/services/engine/subsystems/structureFocusSubsystem.test.ts` (or the existing focus test that covers the predicate)

**Contract:** `StructureSourceEntry` gains `readonly galaxyMembers: boolean`. All four existing rows say `true`.

- [ ] The four-way `||` at `structureFocusSubsystem.ts:80-86` becomes a registry read: a focused structure produces `ActiveFocus` when its category's row has `galaxyMembers`.
- [ ] The member-count publisher (`galaxyCatalog/frame.ts:56-76`) publishes a count only for a category with `galaxyMembers`.
- [ ] Add one test, `a structure whose category has no galaxy members produces no ActiveFocus`, using a stubbed registry lookup or an injected predicate, whichever the subsystem's existing tests already use. If neither seam exists, pass the predicate in as a dependency; do not add a fake category to the real registry.
- [ ] Commit.

### Task 4 (P5): Focus distance from radius

**Files:** `src/services/engine/camera/structureFocusDistance.ts`, its test under `tests/services/engine/camera/`

- [ ] Before editing, list every structure whose `FOCUS_FILL × apparentRadiusMpc` is under 0.1 Mpc, across the seed and the bulk `.ccat` catalogs loaded from `public/data/`. The seed's smallest apparent radius is 0.2 Mpc, so none are expected there. If any bulk row is under, stop and report the count and ids: removing the minimum would change its framing.
- [ ] Remove `MIN_FRAMING_DISTANCE_MPC` (`structureFocusDistance.ts:59`) and its docblock paragraph (`:44-47`). Keep the maximum.
- [ ] Add the test `a 4 pc radius frames within tens of parsecs` (radius 4e-6 Mpc → distance below 1e-4 Mpc), and keep the existing tests' expected values unchanged.
- [ ] Commit.

### Task 5 (P3): Visibility band on the style row — `review: yes`

**Files:** `src/services/engine/presentation/structureMarkerStyles.ts`, `src/services/engine/presentation/produceStructureMarkers.ts`, `src/services/engine/presentation/produceStructureLabels.ts`, `src/services/engine/frame/passes/structureMarkersPass.ts`, `src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts`, a new helper under `src/utils/structure/` if the "any category visible" check needs one, and the matching tests

**Contract:** the style row type gains `visibleBand`, typed as the element type of `SCALE_FADE_BANDS`. All four rows say `SCALE_FADE_BANDS.surveyDeepZoom`.

- [ ] `produceStructureMarkers` multiplies each descriptor's alpha by `fadeBand(style.visibleBand, camDistFromOrigin)`. `produceStructureLabels` replaces its hoisted global read (`:75-77`) with the same per-category factor, and still returns early when every category is at zero.
- [ ] `structureMarkersPass` stops reading `SCALE_FADE_BANDS.surveyDeepZoom` directly in `enabled`, `pickEnabled`, `draw` and `drawPick`. Its gate becomes "at least one category this pass draws has a band above zero at this camera distance".
- [ ] Trace where the pass-level `surveyFade` scalar goes inside `structureMarkerRenderer.draw` (ring and halo). The per-descriptor factor must reach exactly the same terms. If the halo reads the scalar through a path the descriptor alpha does not feed, stop and report before changing the renderer signature. Once equivalent, remove the scalar parameter.
- [ ] Add the test `marker alpha at a camera distance equals the band value times the unbanded alpha` at three distances: above `fullAt`, mid-band, and below `goneAt` (zero).
- [ ] Commit.

### Task 6 (P4): Radius-relative near guard

**Files:** `src/services/engine/presentation/produceStructureMarkers.ts`, `src/services/engine/presentation/produceStructureLabels.ts`, their tests

- [ ] `produceStructureMarkers.ts:92` (`distanceMpc < 0.001`) becomes "camera inside the drawn radius" (`distanceMpc <= radiusMpc`). The descriptor is still emitted at alpha 0, to keep index alignment.
- [ ] `produceStructureLabels.ts:145` (`distanceMpc > 0.001`) becomes `distanceMpc > 0`, so only the division is guarded.
- [ ] Every existing structure has a radius far above 1 kpc and its ring is already at alpha 0 inside its own radius (the max-apparent-radius fade), so no expected value changes. Add the test `a 4 pc structure seen from 100 pc is not faded by the near guard`.
- [ ] Commit.

### Task 7 (P7): Camera-relative marker instances — `review: yes`

**Files:** `src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts`, `src/services/gpu/shaders/structureMarker/ring.wesl`, `ringPick.wesl` and the halo shader beside them, `src/services/engine/frame/passes/structureMarkersPass.ts`, `tests/services/gpu/renderers/structureMarker/` tests

Load the `wesl-shaders` skill before editing the shaders.

- [ ] `setMarkers(descriptors, camPos)` packs `positionAndRadius.xyz = worldPos − camPos`, subtracted in f64 before the write into the `Float32Array`.
- [ ] The pass hands the renderer a rebased view-projection: `narrowMat4(rebaseViewProj(view.slab.vp, view.camPos))`, the pattern at `src/layers/constellations/passes/constellationsPass.ts:36-43`. `draw` and `pickRing` take that matrix.
- [ ] The shaders use the instance position as eye-relative. Remove the `camPosMpc` uniform tail (`MARKER_UNIFORM_BYTES`, `CAM_POS_FLOAT_OFFSET` at `structureMarkerRenderer.ts:93-100`) if nothing else reads it; if a shader still needs the eye-to-marker distance, it is now `length(position)`.
- [ ] `pickEnabled` reads "the instances the last drawn frame uploaded" (`structureMarkersPass.ts:31-33`). Those are now relative to the drawn frame's camera. Confirm the pick draw uses the same view's rebased matrix, so the pair stays consistent, and say so in the report.
- [ ] Add the test `setMarkers packs positions relative to the camera`: a marker at `[100, 0, 0]` with the camera at `[99.5, 0, 0]` packs `[0.5, 0, 0]`.
- [ ] Run `npm run build` (not only typecheck): shader specifiers are invisible to `tsc`.
- [ ] Commit.

### Task 8 (P1): `slab` on the registry row; a second marker pass — `review: yes`

**Files:** `src/@types/data/structure/StructureSourceEntry.d.ts`, the four structure rows under `src/data/sources/`, `src/data/structure/structureIdsBySlab.ts` (new), `src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts`, `src/services/engine/frame/passes/structureMarkersPass.ts`, `src/services/engine/frame/passes/structureMarkersNearPass.ts` (new), `src/data/rendering/frameSections.ts`, `src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts`, `src/services/engine/engine.ts`, `src/services/engine/helpers/resolveStructureFromPick.ts` (read; change only if it names the renderer), and tests

**Contract:**

```ts
// StructureSourceEntry
readonly slab: 'cosmo' | 'near0';            // all four existing rows: 'cosmo'
// src/data/structure/structureIdsBySlab.ts
export const STRUCTURE_IDS_BY_SLAB: Readonly<Record<'cosmo' | 'near0', readonly StructureId[]>>;
// renderer factory takes the categories it buckets
createStructureMarkerRenderer(…, categories: readonly StructureId[])
```

- [ ] `createStructureMarkerRenderer` buckets only the categories it is given, in the order given. `setMarkers` ignores descriptors of other categories.
- [ ] Two renderer instances: `structureMarkerRenderer` (cosmo categories) and `structureMarkerNearRenderer` (near0 categories), each with its own uniform and instance buffers. They must not share buffers: both passes record into one command encoder with one submit, so a shared uniform buffer would give both draws the last-written matrix (`near0SelectionRingPass.ts` header, "writeBuffer/submit race").
- [ ] `structureMarkersNearPass`, named `structure-markers-near`, mirrors `structureMarkersPass` against the near renderer and the NEAR0 view. It is disabled whenever the near renderer has no categories or no planned markers, which is always in this PR. No far-plane clamp yet.
- [ ] Both passes read the one existing `structureMarkersPlanner` result; each renderer filters by its categories.
- [ ] `frameSections.ts`: add `'structure-markers-near'` to the `(hdr, NEAR0)` roster immediately before `'constellations'`, so the comment that `constellations` is the last row the lens line samples stays true. `checkFrameOrder` must pass at boot.
- [ ] Add the test `every structure category is drawn by exactly one marker pass`: the union of `STRUCTURE_IDS_BY_SLAB` values equals `STRUCTURE_IDS` with no overlap.
- [ ] Add the test `a renderer ignores descriptors outside its categories`: `markerCount()` counts only its own.
- [ ] Commit.

### Task 9 (P2): Labels follow the slab — `review: yes`

**Files:** `src/services/engine/presentation/produceStructureLabels.ts`, `src/services/engine/engine.ts`, tests under `tests/services/engine/presentation/`

- [ ] `produceStructureLabels` takes the slab it produces for and emits only that slab's categories. The cosmo registration (`engine.ts:326-329`) passes `'cosmo'`.
- [ ] A second registration on `foregroundLabelDirector` passes `'near0'`. For that slab the anchors are camera-relative, as in `src/layers/constellations/present/produceConstellationCaptions.ts:63-74`. With no near0 category it returns `[]`.
- [ ] Pick ids are unchanged: `packSelection(STRUCTURE_ID_CODES[cat], categoryIndex + 1)`.
- [ ] Add the test `structure labels for a slab contain only that slab's categories`, and `the near0 producer returns nothing when no category is near0`.
- [ ] Commit.

### Task 10: Perf gate and smoke

**Files:** none (report only)

- [ ] Read `.claude/skills/perf/SKILL.md`. Run `npm run perf` against this worktree's dev server (`--url` from its own `Local:` line) at this branch's head and at `origin/main`, and report the structure-marker and total frame times side by side. Task 7 moves a subtraction to the CPU per marker per frame; a regression above noise halts the landing.
- [ ] `npm run build` passes.

## Definition of Done

**Deliverables**

- `Length` type and `lengthToMpc`; the seed file with unit-tagged lengths on all 42 rows.
- `StructureSourceEntry.galaxyMembers` and `.slab`; `visibleBand` on the marker style row; `STRUCTURE_IDS_BY_SLAB`.
- `structureMarkerNearRenderer` handle and the `structure-markers-near` pass on the NEAR0 hdr roster.
- A `'near0'` structure-label registration on `foregroundLabelDirector`.

**Observable behaviours for the smoke pass (all unchanged from main)**

- `#focus=cluster-virgo-m87`: ring and label where they were, same framing distance, member galaxies stay lit while the rest dim, the card shows a galaxy count.
- Zooming from intergalactic space into the Milky Way: structure rings and labels fade out over the same range as before.
- Clicking a ring selects that structure; clicking beside it does not.
- Settings shows a count beside each of the four categories.
- A supercluster, a void and a group each focus and frame as before.

**Out of scope**

- Any new category, source code, seed row or fade band (PR 2).
- The NEAR0 far-plane clamp for the near marker pass (PR 2).
- The adjacent findings in spec §3.4.
- A deletion audit (runs once, at PR 2's `/feature-done`).
