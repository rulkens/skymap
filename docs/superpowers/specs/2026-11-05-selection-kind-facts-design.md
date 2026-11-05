# A selection kind's facts live in its Layer — design

**Status:** design, awaiting approval. Written against `main` at `7d5b9a2fe`.

**Ground preparation:** produced by `refactor-ground` at a 2026-11-05 checkpoint; signed off in ask T6Jp
(§3). Prep ships as its own PR, before the feature PR.

**Consumes these backlog items** (deleted in the spec's commit, per backlog hygiene):
`docs/backlog/2026-10-28-selection-kind-facts-in-the-layer.md` and its `BACKLOG.md` line. That item already
carries J2 of `docs/backlog/2026-10-29-layer-migration-leftovers.md` and the "Narrow `PickingSettings.kinds`"
item.

---

## 1. Purpose

A selectable kind is anything you can hover, click and focus: a galaxy, a star, a planet, a structure, the
Milky Way, a black hole, a satellite, a spacecraft, an Earth scene, the zone of avoidance. Each kind already
belongs to one Layer, and each Layer already contributes a `SelectionKindRow`
(`src/@types/engine/layer/SelectionKindRow.d.ts`) that resolves picks, extracts the row and encodes the URL
focus id.

Every other per-kind fact still lives in a core table keyed by kind. Adding `satellite` took a row or a case
in 14 core files besides its type unions (the inventory is in the consumed backlog item). A new kind should
instead cost **one Layer folder plus one entry in the composition root**. Globular clusters (Harris catalog)
are the plausible next kind and the test of this design.

## 2. Goals, non-goals, anti-goals

**Goals.**
- Every per-kind fact core reads is data the kind's Layer declares (§4.0); core reads it generically by
  looking the kind up by `ref.type` / `row.type`.
- The closed selection unions are composed from arm files each Layer owns; core is typed on a base shape.
- Pick codes are a runtime detail: the root assigns them at boot, nothing persists them.
- Framing and halo are core mechanisms driven by pure data, not per-kind functions.

**Non-goals.**
- Durable ids for galaxy and survey-star refs. They stay positional `{ source, index }`; that is J8 (ruled
  in T6Jp).
- Deleting the `Source` table and `SourceEntry` registry. That is its own stream, after this one; until then
  `Source` values remain catalog identities (in refs, in `galaxyType`, in loaders). Only their role as **pick
  codes** ends here.
- Moving the helpers behind the per-kind arms (`buildGalaxyInfo` and the galaxy math J2 counts, ~1,480 LOC)
  into their Layers. After this design only the Layer's row calls them; relocating them is a move-only
  follow-up.
- Structure focus mode (the `runFrame` structure check feeding `structureFocusSubsystem`). It is one kind's
  behaviour hosted in core, not a per-kind table; a new kind never edits it. It stays J6.
- A 64-bit pick target, which would lift the 62-source limit (backlogged, §3.6).

**Anti-goals.** It would be a failure, even if it works, if:
- a new kind still edits any core file outside `src/compositions/` for its selection facts. (A kind that
  also wants a loading/counts row in the source registry, as satellites and craft have, still edits
  `source.ts`, `SourceEntry.d.ts` and `galaxyType.ts` until the `Source` deletion stream lands; a pickable
  kind with no source row edits none of them. That is the ruled order, not a gap.);
- a fact becomes a function where data would do (the user's ruling: "the layer supplies the info, but it is
  not a function but pure data");
- any pick code ends up in the URL, a saved state, a `.bin`, or a test fixture as a literal;
- arrival framing changes at the default 60° FOV for any kind.

## 3. Ground preparation

### 3.1 Ideal diff for a new kind (after prep and feature)

`src/layers/globularClusters/` with: its ref and row arm types in `@types/`, its facts in the Layer's
`selection.kinds` (§4.0), one runtime `SelectionKindRow`, a renderer that stamps `pickCode('clusters')`, its
detail card; plus its entry in `src/compositions/app.ts`. No core edit, and no second list.

### 3.2 Verdicts at checkpoint (ground-check page, 2026-11-05)

Today every one of the 20 forced core sites is a bolt-on (a new arm in a kind-keyed table, switch or union).
The missing joints:

| Bolt-on | Joint | Where it lands |
|---|---|---|
| fixed `Source` pick codes at 17 stamp sites + a WESL constant | `LayerCoreDeps.pickCode` | prep (§3.4) |
| `resolvePick(entry, pick)` indexes the source registry by code | `resolvePick(pick)` | prep |
| framing switch, halo table | `focus` data + generic math | feature (§4.3) |
| `ROW_FOCUSABLE` | `focus !== null` | feature |
| `mayHaveLabel`, `targetName`, `targetIdentityKey`, `refOf`, `buildFocusable`, `liveFocusRow` | row facts / generic | feature (§4.4–4.6) |
| `PickingSettings.kinds` record, 3 exhibit snapshots | `off` list | feature (§4.7) |
| `SelectionRef` / `SelectionRow` / `FocusableTarget` / `SELECTION_KINDS` | Layer arm files, root-inferred union | feature (§4.1) |

### 3.3 Greenfield cross-check

A fresh subagent derived the shapes from the requirements alone. Divergences and their resolution:
- **Durable ids for every ref** instead of positional galaxy/star refs: real constraint (the tier re-anchor,
  J8). Ruled: keep positional, J8 stays its own item.
- **64-bit pick target**, no 62-source limit: out of scope; backlogged. The ≤ 62 assert guards it.
- **One generic card row with a facts list**: rejected. Cards already render through each Layer's
  `detailCard` slot, so core never reads card content.

### 3.4 Prep refactors (own PR, before the feature)

**Prep 1 — every stamp site takes its code from `pickCode`.** No visible change.
- `LayerCoreDeps` (`src/@types/engine/layer/LayerCoreDeps.d.ts:29`) gains, after `requestRender`:
  ```ts
  /** This app's pick code for one of the Layer's pick sources; stable for the session, never persisted. */
  readonly pickCode: (pickSourceId: string) => number;
  ```
  (Layer-contract widening: explicit yes in T6Jp.)
- The root binds one `pickCode` per Layer, so ids are Layer-local (`'planet'`, `'earth'`) and scoped by the
  Layer's id internally: two Layers can never collide, and no declared id list is needed. The same id always
  returns the same code, so a Layer may call it at create, in `pickSources` and in `encodePick` alike. In
  prep 1 the allocator answers from a fixed `(layer, id) → Source value` map, so every code equals today's.
- Every stamp site reads its code from `pickCode` via the Layer's `create`. Sites that are module-level
  constants or pure helpers today take the code as a parameter. The sites (from the `packSelection(` and
  pick-id-producer trace, completed by the builder check):
  - galaxyCatalog: `pointSprites/render/catalogStore.ts:159` (`CODE_OF_ID`),
    `disks/procedural/render/proceduralDiskRenderer.ts:275`, `famousGalaxies/present/produceFamousGalaxyLabels.ts:227`;
  - starCatalog: `seededStars/passes/starPointsPass.ts:242`, `resolvedStars/passes/starSpheresPass.ts:130`,
    `resolvedStars/passes/fieldStarSpherePass.ts:178`, and `SOURCE_GAIA_STARS = 24u` in
    `src/services/gpu/shaders/lib/selectionEncoding.wesl:46`, which becomes a uniform;
  - body: `spheres/passes/planetsPass.ts:105`, `earth/passes/earthPass.ts:99`,
    `glints/passes/bodyGlintsPass.ts:139,174`, `meshes/passes/bodyMeshesPass.ts:10`;
  - missions `craft/passes/missionMeshesPass.ts:10`; earthScenes `scenes/passes/earthSceneMeshesPass.ts:10`
    (these three mesh passes are module-level today and become factories that receive the code);
  - structure `src/data/structure/structureIds.ts:21` (`STRUCTURE_ID_CODES`); milkyWay
    `picking/render/milkyWayPickRenderer.ts:175`; blackHoles `markers/passes/blackHoleMarkerPass.ts:93`;
    satellites `points/render/satellitePointRenderer.ts:122`; zoneOfAvoidance
    `shell/render/zoneOfAvoidanceRenderer.ts:128`;
  - pick ids built outside a pass: core `src/utils/picking/sceneBodyPickId.ts:19` (reads the registry's
    `entry.code`) and its core caller `src/utils/labels/bodyCaption.ts:42`;
    `milkyWay/picking/present/milkyWayPickId.ts:5` (a module constant, three readers);
    `missions/craft/present/craftPickId.ts:14`; `blackHoles/markers/present/produceBlackHoleCaptions.ts:44`;
    `starCatalog/captions/present/produceStarCaptions.ts:52`; `structure/picking/utils/structurePickId.ts:13`;
    `structure/markers/render/structureMarkerRenderer.ts:395`;
    `galaxyCatalog/structureMembership/utils/structureMembership.ts:41` (packs `record.source`);
    `galaxyCatalog/pointSprites/passes/galaxyPointSpritesPass.ts:36` (packs the ref's catalog `source` as the
    selected-highlight word: it must go through the row's `encodePick`);
  - every row's `encodePick` that packs a catalog value, e.g. `galaxyCatalogSelectionRow.ts:38` and
    `starCatalogSelectionRow.ts:76` (`ref.source` → the catalog's pick code).
- `pickSources` is filled from the same `pickCode` calls, inside `Layer.selection(runtime)`.
- `SelectionKindRow.resolvePick(entry, pick)` becomes `resolvePick(pick)`: each row maps its own codes to its
  own catalogs (e.g. starCatalog's seeded-vs-survey branch at `starCatalogSelectionRow.ts:67`). The caller
  `composeSelectionRows.ts:36` stops indexing `APP_SOURCE_REGISTRY` by code.

**Prep 2 — codes are dense and runtime-only.**
- The allocator numbers `(layer, id)` pairs from 1 in the order first asked and throws past 62 (the 6-bit
  field minus sentinel 63; `src/data/selectionEncoding.ts:23-35`).
- A test pins that no persisted state holds a code: the URL hash, the selection slice (refs carry catalog
  `source` values, which are not pick codes), and saved settings.

The pick word's role split is the load-bearing distinction: **a pick code** lives only in the pick word, the
GPU per-draw uniforms and `pickSources`; **a catalog `Source` value** lives in refs, loaders and
`galaxyType`. After prep 2 they are different numbers, so every reader of `PickResult.sourceCode` must go
through the row that owns it. The audit is the site list above plus the 46 files that name `sourceCode`
(`grep -rln sourceCode src`); the list above exists because that grep misses sites that never use the word.
The pick debug overlay colours by code (colours shift, acceptable for a debug view) and dims the Gaia stars
by comparing against `SOURCE_GAIA_STARS` (`pickDebugOverlay/fragment.wesl:79`): the root, which holds every
code, fills that comparison as a uniform.

### 3.5 Packaging

Prep (both commits) as its own PR first; the feature PR follows (ruled in T6Jp). Prep, feature and any
adjacent cleanup stay three separate diffs.

### 3.6 Adjacent findings (to the backlog in this spec's commit)

- 64-bit pick target (lifts the 62 cap).
- Stale claims in `src/data/source.ts`'s header ("in every .bin and saved selection URL", "Sgr A\* is never
  stamped": `blackHoleMarkerPass.ts:93` stamps it).
- `GlobularCluster: 34` is a structure category, which clashes with a future globular-cluster selection kind.
- Core branches on one kind that a new kind does not edit, but that keep a Layer's behaviour in core:
  `logCameraState.ts:35-40` (body-like kind list), `watchFocusTweenSaga.ts:57` (structure bulk wait),
  `captureGalaxyFocusIds.ts:45` (J8), `hashParamSources.ts:157`, `watchFlyToLonLatSaga.ts:66` and
  `orbitTrailsPass.ts:76-77` (body checks).

## 4. The design (post-prep architecture)

### 4.0 Where the facts live: `Layer.selection.kinds`, derived at the root

The facts' readers are sagas (`SagaContext.selection` has no lookup by kind), memoised Redux selectors, and
`detailCardTable`, which runs when `InfoCard.tsx` loads, before any Layer has run `create`. So the facts are
static data on the Layer, not fields of the runtime `SelectionKindRow` (ruled in JvM6):

- `Layer.selection?(runtime)` (`Layer.d.ts:103`) becomes a key holding both halves:
  ```ts
  readonly selection?: {
    /** Static: one entry per kind this Layer owns. Readable before `create`. */
    readonly kinds: readonly SelectionKindFacts[];
    rows(runtime: Runtime): readonly SelectionKindRow[];
  };
  ```
  `SelectionKindFacts` carries `type`, `focus` (§4.3), `mayHaveLabel` (§4.4), `toFocusable` and
  `displayName` (§4.5). It imports no runtime.
- `src/compositions/appSelectionKinds.ts` derives the lookup from `APP_COMPOSITION.layers`; there is no
  hand-kept list. It is read at **call time**, never at import, because core modules that a Layer's own
  imports reach will import it, and a module-level fold would close an import cycle (the warning at
  `src/compositions/appSources.ts:3-4`):
  ```ts
  export function selectionKindOf(type: string): SelectionKindFacts  // memoised on first call
  ```
- Core reads `selectionKindOf(row.type)`. No `SagaContext` growth.
- A boot check: every runtime row's `type` has facts, every kind has a `detailCard`, and no two Layers
  declare the same kind.
- The runtime `SelectionKindRow` keeps only what needs the runtime: `pickSources`, `resolvePick`,
  `encodePick`, `extractRow`, `focusId`.

### 4.1 Types: Layer-owned arms on a base, no closed union in core

- Each Layer owns its ref and row arm types in its `@types/` folder (`SatelliteRef`, `SatelliteRow`, …). No
  interface merging.
- Core and the store type against a base: `SelectionRefBase = { readonly type: string }` (plus flat primitive
  fields) and a row base that carries the uniform placement fields (§4.2). The core `SelectionRef`,
  `SelectionRow`, `FocusableTarget` unions, `SelectionKind`, `SELECTION_KINDS` and the core per-kind `*Info`
  types for Layer-owned kinds go.
- No closed union is derived from the Layer list for the store. A store type derived from the Layer types
  can close the circular alias `src/compositions/appVisibility.ts:3-6` describes (`ContentPass` →
  `PassState`); `EngineSliceState.d.ts:16` shows a derivation that does not, so the rule is: nothing the
  Layer types reach may depend on a Layer-derived selection type. The plan's first task proves it with `tsc`
  (tsgo does not see this cycle).
- The boot check in §4.0 replaces the core switches' compile-time exhaustiveness. Each Layer's detail card
  and facts are typed against its own arms.
- The Redux selection slice shape does not change (refs stay flat primitives).

### 4.2 Placement on every placed row

Every row of a kind with a non-null `focus` carries `positionMpc: Vec3` and `radiusMpc: number`. The type
makes a non-null `focus` require them. Values reproduce what the core tables read today:

| kind | `positionMpc` | `radiusMpc` |
|---|---|---|
| galaxyCatalog | `[x, y, z]` | `diameterKpc / 2 / 1000`, 30 kpc diameter fallback (as today) |
| structure | `worldPos` | `apparentRadiusMpc ?? physicalRadiusMpc` |
| milkyWay | `MILKY_WAY_CENTER_WORLD` | `MILKY_WAY_DISC_RADIUS_KPC / 1000` |
| body, craft, earthScene, starCatalog, blackHole, satellite | `positionMpc` (already) | `driver.footprintRadiusM × M_TO_MPC` |
| zoneOfAvoidance | — (`focus: null`) | — |

The galaxy and structure rows keep their existing fields (`x/y/z`, `worldPos`), which their own Layers read;
`positionMpc` is filled from them once, in `extractRow`.

### 4.3 Focus: arrival framing and halo as data

```ts
readonly focus: {
  /** Share of the screen height the object's diameter fills on arrival, at any FOV. */
  readonly arrivalSize: number;
  readonly minDistanceMpc?: number;
  readonly maxDistanceMpc?: number;
  /** A volume the camera flies into rather than past (`flyPath` skips its pass-by offset). */
  readonly flyInto: boolean;
  readonly ring: { readonly radii: number; readonly slab: 'near0' | 'cosmo' } | null;
} | null;
```

One core function replaces `focusFraming`'s switch: target `positionMpc`, distance
`radiusMpc / (arrivalSize × tan(fovY / 2))` clamped to `[minDistanceMpc, maxDistanceMpc]`, pass-by radius
`flyInto ? 0 : radiusMpc`. A non-finite or non-positive radius frames at 0.1 Mpc (today's structure guard,
now for every kind); `+∞` clamps to `maxDistanceMpc`. One core function replaces `selectionHaloTable`: a ring
of `radii × radiusMpc` at `positionMpc` in the named slab. The NEAR0 ring keeps reading the live body position
(`near0SelectionRingPass.ts:113`).

Per-kind values. `arrivalSize` constants that replace a fixed distance are derived so the distance at the
default 60° FOV (`DEFAULT_FOV_DEG`, `src/data/defaults.ts:120`) is today's:

| kind | arrivalSize | min / max Mpc | flyInto | ring | today's rule it reproduces |
|---|---|---|---|---|---|
| galaxyCatalog | `1 / (16 tan 30°)` ≈ 0.1083 | 0.15 / — | no | 4 radii, cosmo | 8 × diameter, ≥ 0.15 Mpc; ring = 2 × diameter |
| structure | 2.2 | — / 800 | yes | null | `structureFocusDistance` |
| milkyWay | `0.0175 / (0.15 tan 30°)` ≈ 0.2021 | — | yes | 1 radius, cosmo | fixed 0.15 Mpc; ring = disc radius |
| body, craft, earthScene, starCatalog, satellite | 0.4 | — | no | 1 radius, near0 | `bodyFocusDistance` |
| blackHole | `1 / (30.4 tan 30°)` ≈ 0.0570 | — | no | 1 radius, near0 | Sgr A\* `focusDistanceRadii` 30.4 |
| zoneOfAvoidance | `focus: null` | | | | not focusable |

**Ruled behaviour change:** arrival size is the same at every FOV, so galaxy, Milky Way and black-hole arrivals
now move with the FOV like the body and structure ones already do. At 60° nothing changes. `focusDistanceRadii`
leaves `DriverGeometry`, `BlackHoleRow` and `blackHoles.ts`; `galaxyFocusDistance`, `structureFocusDistance`,
`bodyFocusDistance`, `bodyLikeFraming` and `MILKY_WAY_VIEW_DISTANCE_MPC` go (check each for other readers
first). `focusFraming`'s four callers move to the generic function: `framingPose.ts:13` (tween, navigate,
follow distance), `bodyHomePose.ts:79`, `watchFlyToLonLatSaga.ts:73` and `resolveClipFoci.ts:340` (tour
clips).

`ROW_FOCUSABLE` becomes `focus !== null` at its two callers (`watchFocusTweenSaga.ts:86`,
`navigateSaga.ts:84`).

### 4.4 Label wake: `mayHaveLabel`

`watchSelectionWakeSaga.ts:48` skips a render on a hover change when neither ref can carry a caption, so a
pointer sweeping survey stars and galaxies draws no frames. The answer is per ref for two kinds today:
galaxyCatalog (famous galaxies only) and starCatalog (seeded catalogs only). So the fact is a predicate,
`mayHaveLabel(ref): boolean` (ruled in LbT4): structure, body, craft, blackHole and milkyWay return `true`;
zoneOfAvoidance, earthScene and satellite `false`; galaxyCatalog and starCatalog test the ref as
`mayHaveLabel.ts:17-20` does today.

### 4.5 Focus target, name and identity

- `buildFocusable`'s per-kind arms become the kind's `toFocusable(row)` (J2's named joint; yes in JvM6).
  The target it returns carries its `ref`, so `refOf` goes and `InfoCardContainer.tsx:23` reads `target.ref`.
- `displayName(target)` replaces `TARGET_NAME`; its one caller is `selectDomeStatus.ts:45`.
- `targetIdentityKey` becomes one generic key over the ref's flat fields (`type` plus its values in a fixed
  order). Today craft and earthScene share the `body:` key; a seed id is only ever one kind's ref, so a
  per-type key changes no comparison (`targetEq.ts:14`, `PhoneHudContainer.tsx:39`).

### 4.6 Live focus row for the debug log

`liveFocusRow`'s three-kind list goes: the reconcile log (`makeReconcileEffects.ts:28`) re-extracts the focused
ref through its own row's `extractRow(ref, simDays)` at the live `simDays`. Every `extractRow` already takes
`simDays`. So there is no `followsClock` fact, and no `pickedByDefault` either: every kind is pickable by
default, which the empty default off list says (both dropped in JvM6).

### 4.7 Picking settings

`PickingSettings.kinds: Record<SelectionKind, boolean>` (`src/@types/settings/PickingSettings.d.ts:10`)
becomes `off: readonly string[]`, the kinds a view turns off; the default is `[]`. `composeSelectionRows`
gates `resolvePick` with `off().includes(row.type)`. The dead `earthScene` key goes. Exhibits list what they
turn off:
- `compositions/exhibits/zoneOfAvoidance.ts:34`: everything but galaxyCatalog and zoneOfAvoidance;
- `layers/body/exhibits/solarSystem.ts:42` and `layers/missions/exhibits/voyagerMissions.ts:92`:
  galaxyCatalog, structure, milkyWay, zoneOfAvoidance, satellite.

A new kind is pickable in every exhibit, including the zone-of-avoidance one, unless that exhibit names it.
That is the accepted cost of an off list (the other forms have the same cost in a different exhibit).

## 5. Constraints

- Contract changes are exactly: `LayerCoreDeps.pickCode` (yes in T6Jp), `resolvePick`'s signature,
  `Layer.selection` becoming `{ kinds, rows }` with the `SelectionKindFacts` type (yes in JvM6), and
  `PickingSettings`. Nothing else in the Layer contract, `ReconcileEffects` or `SagaContext` grows.
- Moves go through `npm run move-files`, renames through `npm run refactor -- rename`; no ad-hoc ts-morph
  scripts.
- The pick word layout (6-bit code, 26-bit index, sentinel 63) does not change.

## 6. Testing

- One golden test: for every kind, the new framing at 60° equals today's distance, target and pass-by radius,
  and the new halo equals today's ring (captured from the current functions before they are deleted). This
  is the test that fails if a derived constant is wrong.
- The allocator: dense from 1, the same `(layer, id)` returns the same code, two Layers' equal ids get
  different codes, throws past 62.
- The no-persisted-code test (prep 2).
- Existing table tests (`focusFraming.test.ts`, `selectionHaloTable.test.ts`, `mayHaveLabel.test.ts`,
  `buildFocusable.test.ts`, `liveFocusRow.test.ts`) are rewritten against the generic functions or deleted
  with their table; `tests/support/allKindsEnabled.ts` becomes an empty off list.
- Visual check: before/after pairs at a galaxy, a planet, Sgr A\* and a structure focus link, at the default
  FOV.

## 7. Open

None. Rulings: T6Jp (identity stays positional, `pickCode`, row shape, prep PR first), JvM6 (derived
`selection.kinds`, `toFocusable`, drop `followsClock`/`pickedByDefault`), LbT4 (`mayHaveLabel(ref)`).

## 8. Left to the builder

The allocator's home in `src/compositions/` and the pick-source id strings; how the type makes `focus`
require placement; the WESL uniforms' bindings; the commit order inside the feature PR; and which test
fixtures switch to `off`.

## 9. Calls made in writing (check these)

- Pick ids are Layer-local and the root scopes them per Layer, so the allocator needs no declared id list and
  cannot see a duplicate (§3.4).
- `flyInto` added to `focus`: structures and the Milky Way are flown into, not past, today (§4.3).
- A degenerate radius frames at 0.1 Mpc for every kind, not just structures (§4.3).
- The identity key is per ref type; craft and Earth scenes stop sharing the `body:` key (§4.5).
- The pick debug overlay keeps its Gaia dimming through a root-filled uniform (§3.4).
- A new kind is pickable in the zone-of-avoidance exhibit unless it is named there (§4.7).
- The helpers behind the arms (`buildGalaxyInfo` and J2's ~1,480 LOC) stay where they are; moving them is a
  move-only follow-up (§2).
