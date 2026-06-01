# wireSlots Refactor — Implementation Plan (Part 3: Orchestrator rewire & event triggers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thin `wireSlots` to the orchestrator end-state from the spec — build slots from the registry, install once, wire the extracted subsystems, run the initial `reevaluateDemand` — and rewire the event-driven triggers (visibility, volume-field, palette) to flip state + re-evaluate instead of calling `.load()` directly.
**Architecture:** `buildSlotsFromRegistry(ASSET_WIRING, deps)` returns a `Map<AssetKey, AssetSlot>`; `installSlots(state, slots)` is the single mutation site that populates `state.assetSlots.*` + `deps.allSlots`. The boot loop, the inline POI subscriptions, the inline fade/impostor blocks, and the synthetic gate are all gone — replaced by extracted calls + one `reevaluateDemand`. Public-handle setters become flip-then-reevaluate.
**Spec:** docs/superpowers/specs/2026-06-01-wireslots-refactor-design.md
**ADR:** docs/adrs/0005-engine-data-layer-and-asset-loading.md
**Index:** docs/superpowers/plans/2026-06-01-wireslots-refactor-INDEX.md

---

## Conventions (see INDEX — do not re-summarise)

Whole-file comment-cleanup pass per file-touching task. TDD. Contract code only,
cite line ranges. Commits use the user's identity + Co-Authored-By trailer;
stage specific paths.

**Dependency:** Parts 1 and 2 merged. Task 15 here is the install that Part 2
Task 12 deferred — land it immediately after Task 12 if you split commits, so
the tree is never red across unrelated work (Part 2 §"Sequencing note").

---

## Task 15: `buildSlotsFromRegistry` + `installSlots` + thinned orchestrator

**Files:**
- Create: `src/services/engine/wiring/buildSlotsFromRegistry.ts`
- Create: `src/services/engine/wiring/installSlots.ts`
- Create: `src/services/engine/wiring/installLoadProgress.ts`
- Create the matching tests under `tests/services/engine/wiring/`
- Modify: `src/services/engine/phases/wireSlots.ts` (the thinning)

**Signatures:**
```ts
function buildSlotsFromRegistry(
  rows: readonly AssetWiringRow[],
  deps: SlotDeps,
): Map<AssetKey, AssetSlot<unknown, unknown>>;

function installSlots(
  state: EngineState,
  slots: Map<AssetKey, AssetSlot<unknown, unknown>>,
): void;

function installLoadProgress(state: EngineState, deps: BootstrapDeps): void;
```

**`buildSlotsFromRegistry`:** map each row → `[row.key, row.factory(deps)]`.
Pure: no `state.assetSlots` write, no `.load()`. DEV-only rows (debug volumes)
are already absent from `ASSET_WIRING` in prod (Part 2 Task 10) so no extra
guard is needed here.

**`installSlots` (the single mutation site, ADR 0005 §4):** for each
`(key, slot)`, write it to the canonical home — numeric `SourceType` keys →
`state.assetSlots.points.set(key, slot)`; string keys → `state.assetSlots[key]
= slot`. This is the ONE place `state.assetSlots` is assigned. The point-source
slots minted earlier in `initGpu` (`wireSlots.ts:6-7` header note: the 5 point
slots are minted in `initGpu`) — reconcile: EITHER move their mint into
`ASSET_WIRING` too (cleaner, but touches `initGpu`), OR have `installSlots` skip
keys already present in `state.assetSlots.points`. Read `initGpu.ts` for where
`wireGalaxyCatalogSourceSlot` is called; the spec's orchestrator sketch
(`spec §"Construction purity & single install"`) builds "every slot from the
registry", implying the point slots join the registry. **Prefer moving the point
slots into `ASSET_WIRING`** so install is genuinely single-sourced; if that
balloons the diff, document the split and have `installSlots` own both sets.

**`installLoadProgress`:** replaces `wireSlots.ts:265-295` — iterate the
installed slot map once (no more repeated `as unknown as AssetSlot` casts,
spec §"Construction purity": "replaced by iterating the registry-built slots map
once"), build the `loadProgressEmitter`, `attachSlot` each, assign
`state.subsystems.loadProgress`, and populate `deps.allSlots`.

**Thinned `wireSlots` end-state (spec §"Construction purity & single install" —
match this structure):**
```ts
export async function wireSlots(state, deps) {
  const slots = buildSlotsFromRegistry(ASSET_WIRING, slotDeps(state, deps));
  installSlots(state, slots);             // single mutation site
  wireImpostorSubsystems(state, deps);
  registerOverlayFades(state);
  wirePoiProjection(state);
  createSyntheticFallback(state);
  installLoadProgress(state, deps);
  deps.cb.lifecycle?.onStatusChange?.({ kind: 'loading' });
  reevaluateDemand(state);
}
```
The boot load loop (`wireSlots.ts:496-525`), the inline POI block, fade block,
impostor block, and synthetic gate are all DELETED — they live in the extracted
modules + the registry now.

- [ ] Add `buildSlotsFromRegistry` test `builds one slot per row without touching state`
  — frozen `state.assetSlots`; assert returned map size == rows length and no
  mutation.
- [ ] Add `installSlots` test `installs string-keyed and source-keyed slots into their homes`
  — assert `state.assetSlots.filaments` set and
  `state.assetSlots.points.get(Source.SDSS)` set.
- [ ] Add `installLoadProgress` test `attaches every installed slot to the emitter and populates allSlots`
  — assert `deps.allSlots.size` equals the installed count and
  `state.subsystems.loadProgress` is non-null.
- [ ] Rewrite `wireSlots.ts` to the thinned shape. Delete the boot loop, inline
  POI block, fade block, impostor block, synthetic gate, and the
  `GALAXY_CATALOG_SOURCE_REGISTRY` / `loadCompanionAssets` imports if now unused.
- [ ] `npm run typecheck` → clean. Full `npm test` → green (this is where the
  Part 2 Task 12 install-dependent bootstrap tests come back to green).
- [ ] **Whole-file comment pass** on all four touched/new files. The
  `wireSlots.ts` module header (`wireSlots.ts:1-43`) must be rewritten to
  describe the orchestrator (build → install → wire → reevaluate), dropping the
  obsolete "kicks off the parallel survey loads" / "boot loop" prose.
- [ ] Commit.

---

## Task 16: `setSourceVisible` flips state + re-evaluates

**Files:**
- Modify: the public-handle source-visibility setter (find via Grep
  `setSourceVisible` — likely `src/services/engine/handle/` or a settings-table
  entry; read `wireInput.ts` / the handle wiring).
- Modify: its test.

**Change (ADR 0005 §3; grill "Public-handle setters stop calling `.load()`"):**
`setSourceVisible(source, visible)` updates `state.sources.drawMask` (as today)
then calls `reevaluateDemand(state)` instead of calling
`slot.load(...)` + `loadCompanionAssets(...)` directly. The companion
(famousMeta) now loads because its `demand` predicate sees Famous's slot
non-idle — no explicit companion call.

- [x] Add test `toggling a hidden source visible loads its slot via re-evaluation`
  — covered by `demandTable.test.ts` "famous-only visible" + `setSourceVisibleFade.test.ts` ON case (thunk fires after drawMask set).
- [x] Add test `toggling Famous visible also loads famousMeta (companion via demand)`
  — `demandTable.test.ts` "famous-only visible: one pass loads Famous + famousMeta together".
- [x] Add test `toggling a source off does not unload it` (demand governs
  loading only — residency unchanged; ADR 0005 §3) — `setSourceVisibleFade.test.ts` OFF case (`reevaluate` not called; no unload path exists).
- [x] Implement: replace the direct `.load()` + companion call with the drawMask
  update + `reevaluateDemand(state)` (via `reevaluate` thunk param on the narrow impl).
- [x] `npm run typecheck` → clean. `npm test` (relevant suite + full) → green.
- [x] **Whole-file comment pass.**
- [x] Commit. (`3a7b9b1f`)

---

## Task 17: `setVolumeFieldEnabled` flips state + re-evaluates

**Files:**
- Modify: the volume-field-enabled setter (find via Grep `setVolumeFieldEnabled`).
- Modify: its test.

**Change:** `setVolumeFieldEnabled(handle, enabled)` mutates the field's
`enabled` setting (as today) then calls `reevaluateDemand(state)` instead of the
inline lazy-load. The cf4Density / mcpm / debug rows' `demand` predicates pick up
the new flag.

- [x] Add test `enabling cf4-density loads its slot via re-evaluation` —
  `demandTable.test.ts` "cf4Density field enabled" (flag→reevaluate→load).
- [x] Add test `enabling an already-loaded field does not double-fetch` —
  idle-guard (`reevaluateDemand.ts:69`); non-idle-skip pinned by demandTable cases.
- [x] Add test `disabling a field does not unload it` (residency unchanged) —
  disable branch has no unload path; `reevaluateDemand` is load-only (structural).
- [x] Implement (flag-first; cf4/mcpm via demand, 3 debug fixtures via `maybeLazyLoadDebugVolume`).
- [x] `npm run typecheck` → clean. `npm test` → green.
- [x] **Whole-file comment pass.**
- [x] Commit. (`3a7b9b1f`)

---

## Task 18: `loadPgcAliases` sets the request flag + re-evaluates

**Files:**
- Modify: the public-handle `loadPgcAliases()` shim (find via Grep
  `loadPgcAliases`; referenced at `wireSlots.ts:231-233` doc + the handle).
- Modify: its test.

**Change (spec §"Demand model" Palette aliases):** `loadPgcAliases()` sets the
`'paletteOpened'` request flag (`state.requests.add('paletteOpened')` or the
chosen request-flag home from Part 2 Task 9) then calls `reevaluateDemand(state)`.
The `pgcAlias` row's `demand` reads the flag.

- [x] Add test `loadPgcAliases sets the paletteOpened request and loads the alias slot`
  — `demandTable.test.ts` "palette opened: boot set + pgcAlias".
- [x] Add test `calling loadPgcAliases twice does not re-fetch` — idle-guard
  (flag stays set, slot non-idle on second pass).
- [x] Implement (`state.requests.add('paletteOpened')` + `reevaluateDemand`).
- [x] `npm run typecheck` → clean. `npm test` → green.
- [x] **Whole-file comment pass.** (+ review-fix `209c1ff3`: errored-load note.)
- [x] Commit. (`3a7b9b1f`)

---

## Task 19: Bootstrap parity tests

**Files:**
- Modify: `tests/services/engine/phases/wireSlots.test.ts`
- Modify: `tests/services/engine/phases/bootstrap.test.ts` (if it asserts on
  wireSlots internals)

**Goal (spec §Testing "Bootstrap integration"):** the existing bootstrap tests
stay green for behavior parity, updated for the new structure. Concretely the
post-refactor boot must still:
- publish static-anchor POIs on the first frame,
- register all overlay/volume/label fade handles,
- assign all five impostor subsystems,
- load the default-visible surveys + Famous + famousMeta + mcpm,
- NOT load filaments / clusterCatalog / cf4Density at default settings (the bug
  fixes — these are NEW parity assertions),
- fire `onStatusChange({ kind: 'loading' })` once.

- [ ] Update `wireSlots.test.ts` to drive the thinned orchestrator and assert the
  six parity points above. Replace any assertions that spied on the old inline
  structure (boot loop, `rebuildAllPois`) with assertions on the new seams
  (`reevaluateDemand` outcomes, `setGroup` calls, extracted-module effects).
- [ ] Add explicit parity test `does not load filaments at default settings` and
  `does not load clusterCatalog at default settings` (the two bug fixes, pinned
  at the bootstrap level in addition to the demand-table level).
- [ ] Add parity test `loads default-visible surveys + Famous + famousMeta + mcpm at boot`.
- [ ] `npm run typecheck` → clean. Full `npm test` → green.
- [ ] **Whole-file comment pass** on touched test files (test files get the same
  timeless-terse treatment).
- [ ] Commit.

---

## Task 20: Cleanup, dead-code sweep, and dev-server smoke

**Files:**
- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` (and its
  type files) — now largely superseded by `ASSET_WIRING`.
- Possibly delete: `SURVEY_POINT_SOURCES` / `TIER_FETCHED_POINT_SOURCES` /
  `loadCompanionAssets` if no longer referenced.

**Change:** `ASSET_WIRING` "replaces `GALAXY_CATALOG_SOURCE_REGISTRY`" (ADR 0005
§2). Audit remaining references to the old registry (Grep
`GALAXY_CATALOG_SOURCE_REGISTRY`, `loadCompanionAssets`,
`SURVEY_POINT_SOURCES`, `TIER_FETCHED_POINT_SOURCES`):
- `SURVEY_POINT_SOURCES` is still needed by `allSurveysSettledWithoutSuccess`
  (Part 2 Task 13) and the synthetic-fallback survey set — keep it (move it next
  to `assetWiring.ts` or re-export). Confirm before deleting.
- `wireGalaxyCatalogSourceSlot` may stay as the point-source factory referenced
  by `ASSET_WIRING` rows (Task 15's "move point slots into the registry"
  decision determines this) — do NOT delete a factory the registry calls.
- Delete only what is genuinely unreferenced; each deletion needs a passing
  full `npm test` after.

- [ ] Grep each old export; for each, either keep (cite the live consumer) or
  delete (confirm zero references, then remove).
- [ ] If `galaxyCatalogSourceRegistry.ts` is reduced to just the point-source
  factory + survey-set, update its module header to reflect its narrowed role
  (no longer "the" registry; `ASSET_WIRING` is).
- [ ] `npm run typecheck` → clean. Full `npm test` → green.
- [ ] **Whole-file comment pass** on every file touched by the sweep.
- [ ] Commit.

- [ ] **Dev-server smoke** (do not kill the running `npm run dev`): reload and
  confirm bootstrap parity by eye —
  - Milky Way appears on the first frame.
  - Default surveys fade in progressively.
  - Filaments OFF by default; toggling Filaments on in SettingsPanel loads +
    renders them (the bug fix: it now loads on enable, not at boot).
  - Structures (clusters) respect their toggle; enabling structures loads the
    cluster catalog (bug fix).
  - Volumes: mcpm visible by default; toggling cf4-density loads + renders it.
  - Cmd+K palette opens and resolves PGC aliases (lazy load fires).
  - No console errors related to slots / loading / POI.
  If any parity regression appears, STOP and report — do not "polish later".

---

## Definition of Done (whole plan — mirror of INDEX)

- [ ] `wireSlots.ts` is the thin orchestrator from the spec; no boot loop, no
  inline POI merge / fade / impostor blocks, no inline synthetic gate.
- [ ] No factory writes `state.assetSlots.X = slot` or calls `slot.load()` at
  construction.
- [ ] `reevaluateDemand` is the sole `slot.load(...)` caller for registry assets;
  the only remaining explicit triggers are the three event setters + the
  synthetic gate, each flip-then-reevaluate.
- [ ] Filaments + clusterCatalog do NOT load at default settings (bug fixes,
  pinned at both demand-table and bootstrap levels).
- [ ] `npm test` + `npm run typecheck` green; test count up by the new suites.
- [ ] No `TODO`/`FIXME` introduced; every touched file had its whole-file
  comment-cleanup pass.
- [ ] Dev-server smoke shows full bootstrap parity.
