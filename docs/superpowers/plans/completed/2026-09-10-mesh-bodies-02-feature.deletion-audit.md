# Deletion audit — mesh bodies feature (69eede86f..82fa5ab8a)

Stance: the diff is read as five-year-old legacy by an absent, less capable author;
surplus is presumed until proved load-bearing. Reachability was verified by grep,
by reading every added `src/` and `tools/` file, and (where noted) by executing the
code. Scope-fenced rows from the task brief were not re-litigated.

**Headline: this branch is lean for its size.** Of +8053 lines, ~2600 are plan +
spec + package-lock + rawDataRegistry + docs, and most of the remaining tool and
test code is load-bearing. Realistic removable total is **~270 LOC (≈3%)**, split
roughly 100 src/tools and 170 tests. There is no dead module, no unreachable pass,
no orphaned renderer, and no debug surface without a story. The findings below are
mostly *stale-premise test scaffolding* and *unread generated data*.

---

## SAFE-NOW (pure deletion, no behaviour change)

### 1. `extractSelectionRow.test.ts:25-77` — 53 lines of mock apparatus built on a premise the same branch invalidated
`tests/services/engine/helpers/extractSelectionRow.test.ts:25-77`

Two `vi.mock` factories plus a `vi.hoisted` block fabricate a `mesh-body-fixture`
row in `SCENE_BODIES` *and* a matching `ORBITAL_ELEMENTS` row. The in-file comment
states the reason: *"MeshBody-SHAPED, not MeshBody-typed: SceneBody hasn't been
widened to include it yet."* That widening landed in this very branch
(`src/@types/scene/SceneBody.d.ts`), and `whale` / `petunias` are now real
`SCENE_BODIES` rows with real `ORBITAL_ELEMENTS` rows and real `description`s.

Verified by execution (tsx, unmocked):
`extractSelectionRow({type:'body', id:'whale'}, deps, CONST_J2000)` returns
`{… radiusM: 7.2368…, standoffRadii: 2, description: "Ah … ! What's happening?…"}`.

**Delete** lines 25-77 and point the description test at `'whale'`, asserting
against `SCENE_MESH_BODIES[0]!.description`. Net **−48 LOC (tests)**.
Risk: low. Nothing else in the file reads the fixture id; the mocks are the only
`vi` usage, so the `vi` import goes too.

### 2. `sceneBodyLabels.test.ts:136-165` — same stale premise, `vi.resetModules` edition
`tests/services/engine/presentation/sceneBodyLabels.test.ts:131-166`

Comment: *"`SCENE_MESH_BODIES` is empty until the whale/petunias assets land, so a
stood-up row is the only way to prove the mesh arm reaches the caption pipeline."*
It is not empty any more — it has two rows, and `tests/fixtures/bodyStatesJ2000.json`
gained `whale` + `petunias` states in this same branch precisely so the real table
resolves. The `resetModules` / `doMock` / dynamic-import / `doUnmock` dance plus the
hand-built `states` map can collapse to: take `SCENE_MESH_BODIES[0]`, find its label
in `sceneBodyLabels(J2000_STATES)`, assert `kind`, `text`, and
`scaleToUnitMax(body.albedo)`.
Net **−25 LOC (tests)**. Risk: low.

### 3. `extractSelectionRow.test.ts:253-259` — an assertion that cannot fail
```
it('extractSelectionRow omits description when absent', () => {
  const row = extractSelectionRow({ type: 'body', id: 'earth' }, deps, SIM_DAYS);
  expect(row !== null && row.type === 'body' && row.description).toBeUndefined();
});
```
Verified by execution: Earth's row **does not omit** the key — `'description' in row`
is `true` with value `undefined`, because the extractor always writes
`description: 'description' in body ? … : undefined`. So the test's stated subject
(the `in`-narrowing guard) is not what it observes, and `toBeUndefined()` is
satisfied by both the present-undefined and the absent spelling. It can only fail if
Earth grows a description — which would be correct behaviour, not a bug.
Net **−7 LOC (tests)**. Risk: none.

### 4. Comment budget — restating headers on trivial new files
Worst offenders among files this branch *created* (comment lines / code lines,
budget is ≤ ½):

| file | cmt/code | what to cut |
| --- | --- | --- |
| `src/@types/loading/MeshReq.d.ts` | 4 / 1 | 4-line header on a one-field type; "not tiered or per-source" restates the absence of fields |
| `src/@types/rendering/MeshBodyRenderer.d.ts` | 29 / 8 | per-method docblocks restate signatures (`clearMesh` "A no-op if the id holds nothing"); keep the no-placeholder posture + the linear-format landmine, drop the rest |
| `src/utils/scene/isMeshBodyKey.ts` | 7 / 4 | header explains why it needs no registry check — a fact the one-line body shows |
| `src/utils/scene/meshBodySlotKey.ts` | 5 / 4 | header narrates the prefix already stated in `AssetKey.d.ts` |
| `src/utils/orbit/periodDaysFromSemiMajorKm.ts` | 9 / 6 | keep the GM provenance line; the T = 2π√(a³/GM) line restates the expression |
| `src/utils/color/scaleToUnitMax.ts` | 8 / 6 | keep the black-input landmine; drop the hue-preservation restatement |
| `src/services/engine/frame/meshBodyLoadRadius.ts` | 10 / 8 | keep the 1e5-vs-1e4 derivation; drop the "mirrors bodyTextureLoadRadius" narration |
| `src/@types/scene/MeshBody.d.ts` | 12 / 10 | trim (`standoffRadii` wording is fenced — leave that field's comment alone) |

Net **≈ −40 LOC (src, prose only)**. Risk: none; no behaviour, no tests.

### 5. `src/data/bodies/bodySearchNames.ts:25-27` — a no-op alias row
`['whale', ['whale']]`. `rankPaletteMatches.ts:96` falls back to `[body.label]` when
a body has no entry, `scoreFamousMatch` lowercases both sides *and* also matches
`entry.id` — so `['whale']` scores identically to the default `['Whale']`, and
`paletteRows.tsx:111`'s `.slice(1)` shows no aliases either way. The `petunias` row
earns its place ("bowl of petunias", "oh no not again"); the whale row does not.
Net **−3 LOC (src)** incl. re-wording the shared comment. Risk: none.

**SAFE-NOW total: 5 candidates, ≈123 LOC (src 43 / tests 80).**

---

## NEEDS-RULING (behaviour, debug surface, or design)

### 6. `meshAssets.generated.ts` ships 7 fields nobody reads — biggest single item
`src/data/bodies/meshAssets.generated.ts:7-44`, `tools/meshes/buildMeshes.ts:41-48,483-561,568-612`

Only `boundingRadiusM` and `meanAlbedo` are ever read (`src/data/bodies/makers/meshBody.ts:33-34`).
Verified by grep over `src/`, `tools/`, `tests/`:

| field | claimed reader | actual |
| --- | --- | --- |
| `key` | — | duplicates the record's own key; never dereferenced |
| `path` | the fetcher | **false** — `meshFetcher.ts:37` builds `meshes/${req.meshKey}` itself |
| `triangleCount` | — | only `buildMeshes.ts:586`'s own log line, derivable there from `geometry.indices.length / 3` |
| `normalMapSubstituted` | — | duplicates the `console.warn` already emitted at `buildMeshes.ts:449` |
| `source` / `licence` / `attribution` | *"the generated `MeshAssetRow` that the credit surface reads"* (`tools/utils/io/meshSources.ts:4`) | **false** — the credit surface is hand-written: `Splash.tsx:230-258`, `ATTRIBUTIONS.md`, `README.md`, `data/raw/meshes/*/README.md`, `rawDataRegistry.ts`. Two ~200-char strings ship into the client bundle unread. |

Tier 1 (`key`, `path`, `triangleCount`, `normalMapSubstituted`): generated file −10,
serializer + type-string + `bake()` −~14, tests −~10 ⇒ **≈ −34**.
Tier 2 (also `source`/`licence`/`attribution`, and with them `quote()`, the
key-identifier regex, `MeshBuildTarget`'s three provenance fields, the pre-write
provenance `stderr` loop at `buildMeshes.ts:573-578`, and `meshSources.ts`'s
`licence`/`attribution`): a further **≈ −35**.

Ruling needed because (a) tier 2 removes the "provenance is printed before anything
is written" gate, which is a deliberate licence-hygiene mechanism even though its
output is unread data, and (b) `meshAssets.generated.ts` is banner-marked
DO-NOT-EDIT-BY-HAND, so shrinking it means either a re-bake — which needs the
gitignored source GLBs — or a hand edit that the next bake happens to reproduce.
Combined **≈ −69 LOC (src/tools 54, tests 15)**.

### 7. `BodyStore.meshBodies` is a second path to a compile-time constant
`src/@types/engine/data/BodyStore.d.ts:33-34,41-42`, `src/services/engine/data/createBodyStore.ts:25,35-37,47-49`, `src/services/engine/data/createEngineData.ts:37`, `src/services/engine/frame/sceneBodyPartition.ts:50`

`state.data.bodies.meshBodies` has exactly **one** consumer (`sceneBodyPartition`),
and it is seeded once from `SCENE_MESH_BODIES` and never mutated. Every other
consumer of the same table — `meshBodiesAttachedTo`, `orbitTrailsPass`,
`assetWiring`, `sceneBodyLabels`, `meshSlotRegistry`, `meshBodiesPass`,
`bodyPickRows` — imports `SCENE_MESH_BODIES` directly. The store arm also forces
`meshBodies: []` / `meshBodies: new Map()` into eight unrelated test fixtures
(bodyGlintsPass ×3, planetsPass ×3, demandTable, createSyntheticFallback,
engineSliceDispatches, bodyTextureSlotRegistry).

Delete the store arm; `sceneBodyPartition` imports the table directly.
**≈ −26 LOC (src 16, tests 10)** plus removal of future fixture churn.
Ruling needed: `planets`/`stars`/`earth` go through the store, so this trades
pattern consistency for one less parallel path. (Only
`near0SelectionRingPass.meshBody.test.ts:134` injects the list, and it injects the
real table.)

### 8. `sunVisibleFraction`'s annular-regime guard + the test that exercises it
`src/utils/scene/sunVisibleFraction.ts:30,33-35`, `tests/utils/scene/sunVisibleFraction.test.ts:76-90`

The code's own comment says the annular regime (Sun angularly larger than the host)
is *"accepted as unreachable at a 400 km orbit"*. Two constructs exist only for it:
the `&& host.angRad >= sun.angRad` conjunct on the umbra branch, and the
`Math.min(1, Math.max(0, ramp))` clamp. The 15-line test then *constructs* the
unreachable regime (5° host, 10° sun) and asserts the clamp holds — a clamp-boundary
test over a branch no caller can reach, which `testing.md` names as a non-test.
**≈ −21 LOC (src 6, tests 15).** Ruling needed because it is a behaviour change in
an (argued) unreachable regime. Keep the `acos` clamp at lines 22-26 — that one is a
real NaN guard on a reachable path.

### 9. `overflowFade.test.ts:21-33` — re-tests `fadeBand`
The 31-sample monotonic sweep exercises the ramp shape, which
`tests/utils/math/fadeBand.test.ts` already owns ("ramps monotonically down across
the band"). `overflowFade` contributes only the two band edges, which the first two
cases pin. **≈ −13 LOC (tests).** Ruling: leanness call, not correctness.

### 10. `formatRadiusM`'s mm branch
`src/utils/format/formatRadiusM.ts:19-22` + `tests/utils/format/formatRadiusM.test.ts:16-18`

The ladder's last rung fires below 1 cm. The smallest `radiusM` any `SelectionRow`
can carry is the pot's 0.4978 m (`meshAssets.generated.ts:35`); every other body is
≥ 1737 km. The mm rung and its test are a guard for a caller that does not exist.
**≈ −6 LOC.** Ruling: defensive-formatter-tail question; cheap to keep.

### 11. `buildMeshes.test.ts:317-330` overlaps `:332-359`
"recentres an off-origin authored pivot" is largely subsumed by "weights the
recentre by triangle area" — both prove the area-weighted centroid. The first
uniquely asserts `boundingRadiusM` *after* centring, which can move into the second.
**≈ −10 LOC (tests).** Ruling: low-confidence merge; the two read as different
failure stories.

**NEEDS-RULING total: 6 candidates, ≈145 LOC (src/tools 76, tests 69).**

---

## Ranked (LOC saved × confidence)

1. #6 generated-row field trim — ~69 LOC, high confidence on reachability, ruling on provenance policy + regeneration mechanics
2. #1 `extractSelectionRow.test.ts` mock apparatus — ~48 LOC, verified by execution
3. #7 `BodyStore.meshBodies` parallel path — ~26 LOC, high confidence, pattern ruling
4. #2 `sceneBodyLabels.test.ts` mock apparatus — ~25 LOC, verified premise is stale
5. #8 `sunVisibleFraction` annular guard + test — ~21 LOC, high confidence, behaviour ruling
6. #4 comment-budget trims — ~40 LOC, prose only, no risk
7. #9 `overflowFade` monotonic sweep — ~13 LOC
8. #11 buildMeshes recentre-test merge — ~10 LOC
9. #3 "omits description when absent" — ~7 LOC, cannot fail, verified
10. #10 `formatRadiusM` mm rung — ~6 LOC
11. #5 whale search alias — ~3 LOC

**Realistic net removable: ~268 LOC — src/tools ~119, tests ~149.**

---

## Do NOT remove (traps noticed)

1. **`slabs.ts`'s `attachedBodies` near-widening AND `near0SelectionRingPass`'s
   `pinInsideNearPlane` are not duplicates.** They fix the same symptom on
   *different slabs*: the first lowers the host's body-m row near plane so the mesh
   itself is not clipped; the second pushes the ring's centre inside NEAR0's
   `MIN_NEAR_MPC`-floored near plane. Deleting either loses one of the two.
2. **`meshBinaryFormat.test.ts`'s hand-built fixture vs `writeMeshBinary.test.ts`'s
   round-trip.** Looks like one test written twice; it is not. The round-trip alone
   passes if both sides share a *wrong* layout; the hand-built `DataView` fixture is
   the independent anchor. Keep both.
3. **`partitionBodiesByPresentation.test.ts` "routes a sub-pixel MeshBody to
   glints".** Reads as a copy of the planet glint case, but it is the only test that
   pins branch *order* — `!resolved` must be checked before `'meshKey' in body`, or
   a distant mesh body stops being a glint.
4. **`packMeshBodyUniforms.test.ts`.** Superficially a constant restatement; it is
   the uniform-layout keep-rule. The `mat3x3` column padding (indices 23/27/31) is
   exactly the mistake that renders a wrong frame with no GPU error.
5. **`MESH_VERTEX_STRIDE_BYTES`** is unused by `decodeMesh` itself (it walks fields),
   but is the single source for the stride in `writeMeshBinary` + both format tests.
6. **`MeshAsset.vertexCount` / `boundingRadiusM`** are unread at runtime (the body's
   radius comes from the generated table), but they are header fields of the wire
   format and cost 2 lines of self-description. Not worth the churn.
7. **`buildMeshes.ts:448-456`'s substitution `console.warn`s** stay even if
   `normalMapSubstituted` (#6) goes — the warning is the actual notice; the boolean
   was the copy.
8. **`tools/meshes/prebake/petuniasPrebake.py` (270 lines)** is the only
   reproducibility record for a gitignored *derived* GLB. Large, one-off, and not
   surplus.
9. **`sunVisibleFraction.ts:22-26` `acos` clamp** — reachable NaN guard, distinct
   from the annular clamp in #8.
10. **`orbitTrailsPass`'s `TRAIL_ELEMENTS` / `staging` resize** and everything else
    on the task brief's fence list were not re-examined.
