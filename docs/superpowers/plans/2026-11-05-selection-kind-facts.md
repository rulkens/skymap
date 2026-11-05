# A selection kind's facts live in its Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Skymap runs it under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`.

**Goal:** Every per-kind fact core reads (framing, halo, focusability, label wake, focus target, name,
identity, picking defaults, the kind list and unions) moves from core tables onto each Layer's static
`selection.kinds`, so a new selectable kind is one Layer folder plus its line in `app.ts`.

**Architecture:** `Layer.selection` becomes `{ kinds: SelectionKindFacts[]; rows(runtime) }`. The root
derives a call-time lookup `selectionKindOf(type)` from `APP_COMPOSITION.layers`; core reads it instead of
its tables. Framing and halo become one generic function each over pure data (`focus`) and uniform row
placement (`positionMpc`, `radiusMpc`). Core and the store type against a base ref; no closed union.

**Tech Stack:** TypeScript, Redux Toolkit + Redux-Saga, WebGPU passes, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-selection-kind-facts-design.md` §4 (all), §5, §6.
**Depends on:** the prep PR, `docs/superpowers/plans/completed/2026-11-05-pick-codes-runtime.md`, merged as #1057.

## Global Constraints

- Contract changes are exactly: `Layer.selection` → `{ kinds, rows }` with `SelectionKindFacts` (yes, ask
  JvM6) and `PickingSettings.kinds` → `off`. Nothing else in the Layer contract, `ReconcileEffects` or
  `SagaContext` grows.
- Facts are data. The only function-valued facts are `mayHaveLabel(ref)`, `toFocusable(row)` and
  `displayName(target)` (ruled). No `followsClock`, no `pickedByDefault` (dropped, ruled).
- `selectionKindOf` is read at call time, never at module evaluation (import-cycle rule, spec §4.0).
- No store or engine type may be derived from the Layer types (spec §4.1). `tsc` is the gate for this, not
  tsgo: run `npm run typecheck` (not `:fast`) in Tasks 1 and 8.
- Arrival framing at the default 60° FOV (`DEFAULT_FOV_DEG`, `src/data/defaults.ts:120`) must not change for
  any kind; at other FOVs, galaxy, Milky Way and black-hole arrivals now scale with the FOV (ruled).
- Moves via `npm run move-files -- <from> <to>`; renames via `npm run refactor -- rename …`; deletions of
  whole symbols via `npm run refactor -- delete …`. No ad-hoc ts-morph scripts.

## Review Focus

1. **A focus at a non-default FOV** (dome, lens shift): galaxy and Sgr A\* arrivals now scale with FOV; a
   structure focus must still cap at 800 Mpc. Pinned by Task 3's FOV test.
2. **A structure with an infinite or degenerate radius** (`+∞` → 800 Mpc; `≤ 0`/NaN → 0.1 Mpc). Pinned in
   Task 3.
3. **Hovering across survey stars and galaxies** must not wake frames; hovering a famous galaxy or a seeded
   star must. Pinned in Task 4.
4. **The InfoCard's Focus button on a target of every kind** focuses that object (`refOf` is gone). Pinned in
   Task 5.
5. **An exhibit's pick restriction** (zone-of-avoidance stop: only galaxies and the shell pickable) must
   survive the `off` rewrite. Pinned in Task 7.

---

### Task 1: `Layer.selection` becomes `{ kinds, rows }`; the derived lookup

**review: yes** (import-cycle and type-cycle rule)

**Files:**
- Create: `src/@types/engine/layer/SelectionKindFacts.d.ts`, `src/@types/engine/layer/LayerSelection.d.ts`,
  `src/@types/engine/selection/SelectionRefBase.d.ts`, `src/compositions/selectionKindOf.ts`
- Modify: `src/@types/engine/layer/Layer.d.ts:103`, the ten `src/layers/*/layer.ts` (`selection:` lines 29–100),
  `src/services/engine/phases/createLayers.ts` (where it reads `layer.selection`), `src/compositions/README.md`
- Test: `tests/compositions/selectionKindOf.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SelectionRefBase = { readonly type: string };

  // Task 1 lands `type` only; Tasks 3, 4 and 5 add the rest, each with its values. Final shape:
  export type SelectionKindFacts<Ref extends SelectionRefBase = SelectionRefBase, Row = unknown, Target = unknown> = {
    readonly type: Ref['type'];
    readonly focus: SelectionFocus | null;            // Task 3
    mayHaveLabel(ref: Ref): boolean;                  // Task 4
    toFocusable(row: Row): Target;                    // Task 5
    displayName(target: Target): string;              // Task 5
  };

  export type LayerSelection<Runtime> = {
    /** Static: one entry per kind this Layer owns. Readable before `create`. */
    readonly kinds: readonly SelectionKindFacts[];
    rows(runtime: Runtime): readonly SelectionKindRow[];
  };
  // Layer.d.ts:103 — `selection?(runtime)` becomes:
  readonly selection?: LayerSelection<Runtime>;

  // src/compositions/selectionKindOf.ts
  /** Memoised on first call from APP_COMPOSITION.layers. Throws on an unknown type. */
  export function selectionKindOf(type: string): SelectionKindFacts;
  /** Every composed kind, in composition order; same memo. */
  export function selectionKinds(): readonly SelectionKindFacts[];
  /** Boot check: every runtime row's type has facts; no type declared twice. */
  export function assertSelectionKindsComplete(rowTypes: readonly string[]): void;
  ```
- Each Layer's `kinds` entry lives in a new `src/layers/<layer>/selection/kinds.ts`
  (or beside its row file where the Layer has no `selection/` folder), exporting `<layer>SelectionKinds`.
- `createLayers` calls `layer.selection?.rows(runtime)` and then `assertSelectionKindsComplete`.

- [x] Test `selectionKindOf returns each composed kind's facts` (one assertion per kind type of today).
- [x] Test `selectionKindOf does not read APP_COMPOSITION at import`: import the module under a
      `vi.doMock` of `./app` that throws on property access; the import succeeds, the first call throws.
- [x] Test `assertSelectionKindsComplete throws on a row type with no facts` and `… on a kind declared twice`.
- [x] Implement; reshape the ten Layers' `selection`.
- [x] `npm run typecheck` (tsc, both projects) → clean; targeted tests → pass.
- [x] Commit `Layer.selection holds the kinds' static facts beside the runtime rows`.

### Task 2: Every placed row carries `positionMpc` and `radiusMpc`; the golden capture

**Files:**
- Modify: the `SelectionRow` arms and `extractRow` of galaxyCatalog (`galaxyCatalogSelectionRow.ts`),
  structure (`structureSelectionRow.ts`), milkyWay (`milkyWaySelectionRow.ts`); the driven arms
  (body, craft, earthScene, starCatalog, blackHole, satellite) add `radiusMpc` from their driver;
  `src/@types/engine/SelectionRow.d.ts:22-49`
- Test: `tests/services/engine/camera/framing/arrivalGolden.test.ts` (create)

**Interfaces:**
- Produces, per kind (`positionMpc: Vec3`, `radiusMpc: number`, Mpc):

  | kind | `positionMpc` | `radiusMpc` |
  |---|---|---|
  | galaxyCatalog | `[x, y, z]` | `diameterKpc / 2 / 1000`, diameter 30 kpc when not finite or ≤ 0 |
  | structure | `worldPos` | `apparentRadiusMpc ?? physicalRadiusMpc` |
  | milkyWay | `MILKY_WAY_CENTER_WORLD` | `MILKY_WAY_DISC_RADIUS_KPC / 1000` (0.0175) |
  | body, craft, earthScene, starCatalog, blackHole, satellite | existing `positionMpc` | `driver.footprintRadiusM × SCALE_UNITS.M_TO_MPC` |
  | zoneOfAvoidance | none | none |

  Existing fields (`x/y/z`, `worldPos`) stay; their own Layers read them.

- [x] Write `arrivalGolden.test.ts` against **today's** `focusFraming` and `selectionHalo`: one fixture row per
      kind (galaxy with 25 kpc diameter and one with no diameter; a structure with apparent radius, one with
      `+∞`, one with 0; the Milky Way; Earth; a craft; Søndermarken; a seeded star; Sgr A\*; a satellite), at
      `fovY = 60°` and at `fovY = 30°`. Assert target, distance and radius (`toBeCloseTo`, 1e-9 relative),
      and the halo's ring radius, position and slab. Record today's numbers as literals in the test.
- [x] Add the fields; the golden test passes unchanged.
- [x] Commit `Placed selection rows carry positionMpc and radiusMpc; golden arrival capture`.

### Task 3: `focus` facts; one generic framing and one generic halo

**review: yes** (camera maths)

**Files:**
- Create: `src/@types/engine/layer/SelectionFocus.d.ts`, `src/services/engine/camera/framing/arrivalFraming.ts`,
  `src/services/engine/helpers/selectionHaloOf.ts`
- Modify: the ten Layers' `kinds` (add `focus`), `framing/framingPose.ts:13`, `framing/bodyHomePose.ts:79`,
  `src/state/camera/watchFlyToLonLatSaga.ts:73`, `src/services/engine/animation/resolveClipFoci.ts:340`,
  `frame/passes/selectionRingPass.ts:54,64`, `frame/passes/near0SelectionRingPass.ts:99,105`,
  `src/state/selection/watchFocusTweenSaga.ts:86`, `src/state/navigation/navigateSaga.ts:84`,
  `src/@types/engine/camera/DriverGeometry.d.ts:25`, `src/layers/blackHoles/@types/BlackHoleRow.d.ts:23`,
  `src/layers/blackHoles/markers/data/blackHoles.ts:17`, `blackHoleSelectionRow.ts:59`
- Delete (with `npm run refactor -- delete` once unreferenced): `framing/focusFraming.ts`,
  `framing/galaxyFocusDistance.ts`, `framing/structureFocusDistance.ts`, `framing/bodyFocusDistance.ts`,
  `framing/bodyLikeFraming.ts`, `helpers/selectionHaloTable.ts`, `helpers/rowFocusable.ts`,
  `MILKY_WAY_VIEW_DISTANCE_MPC` (`src/data/milkyWay/galacticCenter.ts:60`), and their tests
  (`focusFraming.test.ts`, `selectionHaloTable.test.ts`)
- Test: `arrivalGolden.test.ts` (repoint), `tests/services/engine/camera/framing/arrivalFraming.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  export type SelectionFocus = {
    /** Share of the screen height the object's diameter fills on arrival, at any FOV. */
    readonly arrivalSize: number;
    readonly minDistanceMpc?: number;
    readonly maxDistanceMpc?: number;
    /** A volume the camera flies into rather than past (flyPath skips its pass-by offset). */
    readonly flyInto: boolean;
    readonly ring: { readonly radii: number; readonly slab: 'near0' | 'cosmo' } | null;
  };
  /** target = positionMpc; distance = radiusMpc / (arrivalSize · tan(fovY/2)) clamped to [min, max];
   *  radius = flyInto ? 0 : radiusMpc. Non-finite or ≤ 0 radius → 0.1 Mpc; +∞ → maxDistanceMpc. */
  export function arrivalFraming(row: PlacedRow, focus: SelectionFocus, fovYRad: number): FocusFraming;
  /** A ring of radii × radiusMpc at positionMpc in the named slab; null when focus or ring is null. */
  export function selectionHaloOf(row: PlacedRow | null): SelectionHalo | null;
  ```
  `FocusFraming` keeps its shape (`focusFraming.ts:23-26`; move the type to `@types/` with `move-files`
  before deleting the file). `PlacedRow = { type: string; positionMpc: Vec3; radiusMpc: number }`.
- Per-kind values (exact; constants derived so 60° reproduces today):

  | kind | arrivalSize | min / max Mpc | flyInto | ring |
  |---|---|---|---|---|
  | galaxyCatalog | `1 / (16 * Math.tan(Math.PI / 6))` | 0.15 / — | false | `{ radii: 4, slab: 'cosmo' }` |
  | structure | 2.2 | — / 800 | true | null |
  | milkyWay | `0.0175 / (0.15 * Math.tan(Math.PI / 6))` | — | true | `{ radii: 1, slab: 'cosmo' }` |
  | body, craft, earthScene, starCatalog, satellite | 0.4 | — | false | `{ radii: 1, slab: 'near0' }` |
  | blackHole | `1 / (30.4 * Math.tan(Math.PI / 6))` | — | false | `{ radii: 1, slab: 'near0' }` |
  | zoneOfAvoidance | `focus: null` | | | |

  Each constant carries a one-line comment naming the rule it reproduces (e.g. "8 × diameter at 60°").
- `ROW_FOCUSABLE[row.type]` at its two callers becomes `selectionKindOf(row.type).focus !== null`.
- The NEAR0 ring keeps reading the live body position (`near0SelectionRingPass.ts:113`).

- [x] Repoint `arrivalGolden.test.ts` to `arrivalFraming` + `selectionHaloOf`: every 60° expectation passes
      unchanged. Update only the 30° expectations of galaxy, Milky Way and Sgr A\* (they now scale with FOV),
      each with a comment citing the ruling.
- [x] Test `arrivalFraming clamps to maxDistanceMpc for an infinite radius` and
      `… frames a degenerate radius at 0.1 Mpc`.
- [x] Test `arrivalFraming keeps the same screen fill at any FOV` (60° and 30°, a body: fill =
      `radiusMpc / (distance · tan(fovY/2))` equals `arrivalSize`).
- [x] Implement; migrate the callers; delete the old files and `focusDistanceRadii`.
- [x] `typecheck:fast`, `npx vitest run tests/services/engine/camera tests/services/engine/animation tests/services/engine/frame tests/state` → pass.
- [x] Dev server, default FOV: focus a galaxy, a planet, Sgr A\*, a structure and the Milky Way; each arrives
      as on main (shot before/after pairs per `dev` skill).
- [x] Commit `Arrival framing and the selection halo are generic over each kind's focus facts`.

### Task 4: `mayHaveLabel(ref)` on the kind

**Files:**
- Modify: the ten Layers' `kinds`, `src/state/selection/watchSelectionWakeSaga.ts:48`
- Delete: `src/utils/selection/mayHaveLabel.ts`, `tests/utils/selection/mayHaveLabel.test.ts`
- Test: `tests/layers/galaxyCatalog/selection/kinds.test.ts`, `tests/layers/starCatalog/selection/kinds.test.ts`
  (create, mirroring where Task 1 put the kinds files)

**Interfaces:**
- Values (copied from `mayHaveLabel.ts:16-30`): structure, body, craft, blackHole, milkyWay → `() => true`;
  zoneOfAvoidance, earthScene, satellite → `() => false`; galaxyCatalog →
  `(ref) => ref.source === Source.FamousGalaxy`; starCatalog →
  `(ref) => SEEDED_STAR_CATALOGS_BY_SOURCE.has(ref.source)`.
- The saga reads `selectionKindOf(ref.type).mayHaveLabel(ref)`; a null ref is `false` as today.

- [ ] Test `a famous galaxy may carry a label, a survey galaxy may not`.
- [ ] Test `a seeded star may carry a label, a Gaia star may not`.
- [ ] Implement; delete the util and its test.
- [ ] Targeted tests and `typecheck:fast` → pass.
- [ ] Commit `Each kind says whether its hover may carry a label`.

### Task 5: `toFocusable`, `displayName`, the generic identity key; `refOf` goes

**review: yes** (Redux selectors)

**Files:**
- Modify: the ten Layers' `kinds`; `src/state/selection/selectors.ts:108,118,128`;
  `src/state/remote/selectDomeStatus.ts:45`; `src/services/engine/helpers/targetEq.ts:14`;
  `src/components/containers/PhoneHudContainer.tsx:39`; `src/components/containers/InfoCardContainer.tsx:23`;
  the `*Info` types that become targets (add `ref`)
- Create: `src/utils/selection/refKey.ts`
- Delete: `src/services/engine/helpers/buildFocusable.ts`, `refOf.ts`, `targetName.ts`, `targetIdentityKey.ts`,
  `tests/services/engine/helpers/buildFocusable.test.ts`
- Test: `tests/utils/selection/refKey.test.ts`, `tests/state/selection/selectors.test.ts` (modify),
  `tests/state/remote/selectDomeStatus.test.ts` (existing, must pass)

**Interfaces:**
- Produces:
  - Every focus target carries `readonly ref: <its Layer's ref type>`; `toFocusable(row)` sets it.
  - `refKey(ref: SelectionRefBase): string` — `type` then the ref's own fields in key-sorted order, joined
    with `:`. Craft and Earth scenes no longer share the `body:` key (a seed id is only ever one kind's ref).
  - Per-kind `toFocusable` = today's `BUILD_FOCUSABLE` arm (`buildFocusable.ts:56-80`): galaxy
    `buildGalaxyInfo(row)`, star the `StarInfo` build (`:29-48,63-78`, moves with it into the starCatalog
    Layer), Milky Way `MILKY_WAY_INFO`, zone of avoidance `ZONE_OF_AVOIDANCE_INFO`, structure the row
    itself, the driven kinds the row minus `driver`.
  - Per-kind `displayName` = today's `TARGET_NAME` arm (`targetName.ts:10-19`): `displayName` for galaxy,
    Milky Way, zone of avoidance and star; `name` for structure; `label` for the rest.
- `InfoCardContainer.tsx:23` dispatches `updateSelectionFocus(target.ref)`.

- [ ] Test `refKey separates kinds that share an id` and `refKey is independent of field order`.
- [ ] Extend `selectors.test.ts`: `the focused target of every kind carries its ref` (one fixture per kind).
- [ ] Implement; delete the four helpers and the old test.
- [ ] `npx vitest run tests/state tests/components tests/utils/selection` → pass; `typecheck:fast` → clean.
- [ ] Commit `Each kind builds its own focus target and name; refs key generically`.

### Task 6: The debug log's live focus row is generic

**Files:**
- Modify: `src/services/engine/wiring/makeReconcileEffects.ts:28`
- Delete: `src/services/engine/helpers/liveFocusRow.ts`, `tests/services/engine/helpers/liveFocusRow.test.ts`
- Test: `tests/services/engine/wiring/makeReconcileEffects.test.ts` (modify)

**Interfaces:**
- The reconcile log re-extracts the focused ref through the resolver's `extractRow(ref, simDays)` at the
  live `simDays`, for every kind. No kind list.

- [ ] Modify the existing test: `the logged focus row is re-extracted at the live simDays` (a body whose
      position differs between two `simDays`).
- [ ] Implement; delete `liveFocusRow`.
- [ ] Targeted test → pass.
- [ ] Commit `The camera log re-extracts the focus row at the live clock`.

### Task 7: `PickingSettings` names the kinds a view turns off

**review: yes** (Redux state)

**Files:**
- Modify: `src/@types/settings/PickingSettings.d.ts:10`, `src/state/settings/core/pickingSlice.ts`,
  `src/services/engine/selection/composeSelectionRows.ts:25,35`, `src/services/engine/engine.ts:279-282`,
  `src/compositions/exhibits/zoneOfAvoidance.ts:23-34`, `src/layers/body/exhibits/solarSystem.ts:31-44`,
  `src/layers/missions/exhibits/voyagerMissions.ts:81-94`, `tests/state/settings/makeSettingsFixture.ts`,
  frame-test fixtures that pass `picking:`
- Rename: `npm run refactor -- rename tests/support/allKindsEnabled.ts#allKindsEnabled noKindsOff`
- Test: `tests/services/engine/selection/composeSelectionRows.test.ts` (modify)

**Interfaces:**
- Produces: `PickingSettings = { readonly off: readonly string[] }`, default `[]`;
  `composeSelectionRows(rowsOf, pickingOff: () => readonly string[])`, gating `resolvePick` only, with
  `pickingOff().includes(row.type)`.
- Exhibit `off` lists (from today's snapshots):
  - zone of avoidance: `['structure', 'milkyWay', 'body', 'craft', 'starCatalog', 'blackHole', 'satellite']`;
  - solar system and Voyager: `['galaxyCatalog', 'structure', 'milkyWay', 'zoneOfAvoidance', 'satellite']`.
  The dead `earthScene` key goes.

- [ ] Modify `composeSelectionRows.test.ts`: `a kind in the off list resolves no pick but still extracts
      its row and decodes its focus id`.
- [ ] Test `the zone-of-avoidance exhibit leaves only galaxies and the shell pickable`: apply the exhibit's
      settings and resolve one pick per kind.
- [ ] Implement; rename the helper; sweep fixtures.
- [ ] `npx vitest run tests/state tests/services/engine` → pass; `typecheck:fast` → clean.
- [ ] Commit `Picking settings list the kinds a view turns off`.

### Task 8: The core unions and kind list go; the boot checks take over

**review: yes** (type-cycle rule)

**Files:**
- Delete: `src/@types/engine/SelectionRef.d.ts`, `src/@types/engine/SelectionRow.d.ts` (its arms move to the
  owning Layers' `@types/`), `src/@types/engine/FocusableTarget.d.ts`, `src/@types/engine/SelectionKind.d.ts`,
  `src/@types/engine/FocusableTargetType.d.ts`, `src/data/selection/selectionKinds.ts`
- Modify: `src/@types/engine/layer/SelectionKindRow.d.ts` (generic over `SelectionRefBase`), every importer
  of the deleted types (`npm run refactor -- refs` on each first, for the worklist),
  `src/components/InfoCard/detailCardTable.ts:24-27` (iterate `selectionKinds()` (Task 1), not
  `SELECTION_KINDS`), the detail-card types (`DetailCardTable`,
  `DetailCardEntry`, `DetailCardProps`, `CompactCardProps`, `LayerDetailCard`) typed on each Layer's own
  target, `src/compositions/README.md` (the `selection-kind-facts` TODO rows at `:24`, `:39` become done)
- Test: `tests/components/InfoCard/detailCardTable.test.ts` (modify)

**Interfaces:**
- Arm types move to their Layer with `npm run move-files -- <from> <to>` when only that Layer and leaf
  consumers use them; a type a core helper still needs (e.g. `BodyInfo`, shared by body, missions and
  earthScenes) stays in `src/@types/`.
- The store and engine reference refs and rows only as `SelectionRefBase` / the placed-row base.

- [ ] Modify `detailCardTable.test.ts`: `throws naming a composed kind with no detail card`.
- [ ] Implement.
- [ ] `npm run typecheck` (tsc) → clean, no circular-alias error; `npm run build` → clean.
- [ ] `grep -rn "SelectionKind\b\|SELECTION_KINDS\|FocusableTarget\b" src tests` → only intended hits.
- [ ] Commit `Selection unions and the kind list leave core; boot checks replace them`.

## Definition of Done

**Deliverables**
- `SelectionKindFacts`, `SelectionFocus`, `LayerSelection`, `SelectionRefBase`; `selectionKindOf` and
  `assertSelectionKindsComplete`; `arrivalFraming`, `selectionHaloOf`, `refKey`.
- Each of the ten Layers declares its kinds in `selection.kinds`.
- Gone: `focusFraming`, `galaxyFocusDistance`, `structureFocusDistance`, `bodyFocusDistance`,
  `bodyLikeFraming`, `selectionHaloTable`, `rowFocusable`, `mayHaveLabel` (util), `buildFocusable`, `refOf`,
  `targetName`, `targetIdentityKey`, `liveFocusRow`, `SELECTION_KINDS`, `SelectionKind`, the core
  `SelectionRef`/`SelectionRow`/`FocusableTarget` unions, `focusDistanceRadii`, `MILKY_WAY_VIEW_DISTANCE_MPC`.
- `compositions/README.md` shows the selection rows as derived, not hand-written.

**Smoke (dev server, default FOV; before/after pairs against main)**
- Focus a galaxy, a famous galaxy, a planet, a moon, a craft, Søndermarken, a named star, Sgr A\*, a
  structure, the Milky Way, a satellite: each arrives as on main, with its ring.
- The zone of avoidance cannot be focused; its InfoCard has no Focus button.
- Sweep the pointer over the Gaia field and the SDSS cloud: no frames drawn while idle (render-wake
  counter); hover a famous galaxy: its label whitens.
- InfoCard Focus button on a planet and a galaxy focuses each.
- Zone-of-avoidance exhibit: only galaxies and the shell pick. Solar-system exhibit: no galaxy picks.
- Dome status shows the focused name.

**Deferred:** durable ids for galaxy/star refs (J8); deleting `Source` (own stream); moving
`buildGalaxyInfo` and J2's helpers into their Layers (move-only follow-up); structure focus mode (J6); the
core one-kind branches and the 64-bit pick target (`docs/backlog/2026-11-05-selection-kind-facts-followups.md`).
