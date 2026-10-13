# Derived settings snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tour's `SettingsSnapshot` captures every Layer settings cluster, derived from `APP_SETTINGS_SLICES`, so a new Layer never needs a hand edit to the snapshot.

**Architecture:** The Layer half of the snapshot's key set becomes a type derived from the slice tuple's literal `reducerPath`s, and `captureSettings` picks the same keys at runtime from the same tuple. The core half stays a short explicit list in `src/data/`. One guard test pins that every visibility cue writes only captured clusters, the one invariant the hand-kept core list can still break.

**Tech Stack:** TypeScript, Redux Toolkit (`combineSlices`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-derived-settings-snapshot-design.md`

## Global Constraints

- Every Layer cluster is captured, with no opt-out.
- `CORE_SNAPSHOT_CLUSTERS = ['camera', 'labels', 'orbitTrails', 'picking'] as const`, exactly these four.
- `orientation`, `tonemap`, `bloom`, `hdr`, `debug` stay out of the snapshot.
- `captureSettings` keeps its signature `(state: Pick<RootState, 'settings'>) => SettingsSnapshot` and still returns a `structuredClone`d, detached copy.
- One symbol per file in `@types/` and `data/`; `type` aliases, never `interface`; comments explain why, module header ≤ 10 lines.
- `npx prettier --write <files>`, never `npm run format`. Stage files by name, never `git add -A`. No Co-Authored-By line in any commit.

## Review Focus

1. **Restore by reference.** `mergeSnapshot` hands every captured cluster back as a fresh object at each beat entry and at the end. Every consumer of `earth`, `bias`, `thumbnails`, `blackHoleLensingTuning` that reacts to a reference change rather than a value change (a saga diffing `prev !== next`, a memoized selector feeding a reload, a renderer re-uploading on identity) now fires at every beat. Expected: an equal-valued restore reloads no tiles, refetches no thumbnails, rebuilds no cubemap. Task 1 audits this.
2. **A Layer slice whose `reducerPath` widens to `string`.** The derived `Pick` would stop compiling, which is the desired failure; nothing must cast around it.
3. **Saved settings and deep links.** The snapshot is a takeover-time value; nothing persists it. Expected: no change to localStorage or URL shapes. Task 1 confirms no persister reads `SettingsSnapshot`.
4. **A visibility cue writing a core cluster outside the four.** Expected: a test fails. Task 2's guard pins it.
5. **Detachment of the four newly captured clusters.** Nested objects in `earth` and `thumbnails` must not alias the live state. The existing detachment test covers this only if it reads a nested field; Task 1 extends it to one new cluster.

---

### Task 1: Derive the snapshot key set and the capture

review: yes (Redux state and sagas: the restore path)

**Files:**
- Create: `src/@types/settings/LayerSettingsClusterKey.d.ts`
- Create: `src/data/settings/coreSnapshotClusters.ts`
- Modify: `src/@types/engine/settings/SettingsSnapshot.d.ts`
- Modify: `src/state/scene/captureSettings.ts`
- Modify: `tests/state/scene/captureSettings.test.ts`
- Modify: `tests/state/scene/captureScene.test.ts`
- Modify: `tests/state/scene/restoreSceneSaga.test.ts`
- Modify (comment counts only): `src/state/scene/restoreSceneSaga.ts:10`, `src/state/scene/captureScene.ts` header, `src/@types/engine/settings/SceneSnapshot.d.ts` header, `src/state/settings/settingsReducer.ts:4`

**Interfaces:**
- Produces:
  ```ts
  export type LayerSettingsClusterKey = (typeof APP_SETTINGS_SLICES)[number]['reducerPath'];
  export const CORE_SNAPSHOT_CLUSTERS = ['camera', 'labels', 'orbitTrails', 'picking'] as const;
  export type SettingsSnapshot = Readonly<
    Pick<EngineSettingsState, LayerSettingsClusterKey | (typeof CORE_SNAPSHOT_CLUSTERS)[number]>
  >;
  export function captureSettings(state: Pick<RootState, 'settings'>): SettingsSnapshot;
  ```

- [x] Audit first (Review Focus 1 and 3). For each of `earth`, `bias`, `thumbnails`, `blackHoleLensingTuning`, list every reader (`git grep` the cluster name and its selectors under `src/`) and decide whether a fresh-but-equal object triggers work. Also confirm no persister (localStorage, URL hash) reads `SettingsSnapshot`. If any reader reacts to identity with real cost, STOP and report it with file:line; do not work around it.
- [x] Create the two new files per the contract above. `CORE_SNAPSHOT_CLUSTERS`'s header says why each of the four is in (lift the reasons for `camera`, `labels`, `orbitTrails`, `picking` from today's `SettingsSnapshot.d.ts` header), in ≤ 10 lines.
- [x] Rewrite `SettingsSnapshot.d.ts`: the type per the contract; the header describes the rule (every Layer cluster, plus the core list in `coreSnapshotClusters.ts`) instead of listing Layer clusters. Keep the `orientation` paragraph and the `Readonly` paragraph. Keep the excluded-core-clusters reasoning (`tonemap`, `bloom`, `hdr`, `debug`), dropping the Layer clusters from that list.
- [x] Rewrite `captureSettings`'s body: pick the keys of `APP_SETTINGS_SLICES.map((s) => s.reducerPath)` plus `CORE_SNAPSHOT_CLUSTERS` off `state.settings`, then `structuredClone`. Hoist the key list to module scope. If the result needs a cast to `SettingsSnapshot`, keep it to one cast on the built object, with a one-line why. Update its header: drop any wording that implies a hand list.
- [x] Tests in `captureSettings.test.ts`: delete the literal `SNAPSHOT_KEYS` list and whatever asserts against it. Add `captures a Layer cluster it was never told about`, asserting `earth` (absent from today's hand list) is in the snapshot and deep-equals the input. Add `captures every Layer cluster and the four core ones`, asserting the snapshot's keys equal `APP_SETTINGS_SLICES` reducerPaths ∪ `CORE_SNAPSHOT_CLUSTERS` (built from the imports, not a literal). Keep `never captures orientation`, `never captures tonemap` and the detachment test; extend detachment to mutate one nested field of `earth` after capture and assert the snapshot is unchanged. The `makeState` fixture probably needs to switch to `makeSettingsFixture()` so all 17 Layer clusters exist; do that if so. Update the file header's "exactly the seventeen" wording.
- [x] `captureScene.test.ts`: same treatment for any literal key list it pins.
- [x] `restoreSceneSaga.test.ts`: its `SceneSnapshot`-typed literal gains `earth`, `bias`, `thumbnails`, `blackHoleLensingTuning` (the compiler demands it; take values from the slices' `initialState` or `makeSettingsFixture()`).
- [x] Fix stale counts in the comment-only files listed above (e.g. "the ten clusters", "twenty-two slices"): reword so they state no count where a count would rot again, otherwise the current one.
- [x] Mutation check: temporarily drop the `earth` slice from the capture's key list (not the type) and confirm `captures a Layer cluster it was never told about` fails; restore.
- [x] `npm run typecheck:fast` and `npm test -- tests/state` pass; then `npx prettier --write` the touched files; commit `refactor(scene): derive SettingsSnapshot from the Layer settings slices`.

### Task 2: Guard: every visibility cue writes only captured clusters

**Files:**
- Create: `tests/state/scene/visibilityCuesWriteCapturedClusters.test.ts`

**Interfaces:**
- Consumes: `VISIBILITY_ACTION_ROW` (`src/services/animation/visibilityActionRow.ts`), `captureSettings`, `makeSettingsFixture()` (`tests/state/settings/makeSettingsFixture.ts`).

**Behaviour:** for each key of `VISIBILITY_ACTION_ROW`, both `actions(true, settings)` and `actions(false, settings)` (with `settings = makeSettingsFixture()`, so per-item rows enumerate real ids) return actions whose `type` is `settings/<cluster>/<…>` with `<cluster>` a key of `captureSettings({ settings })`. Slice names are pinned to `settings/<reducerPath>` by `tests/compositions/appSettingsSlices.test.ts`, so parsing the cluster out of the type is sound; a `type` not matching `settings/<cluster>/…` fails the test too.

- [ ] Write the test `every visibility cue writes only captured clusters`, one `it.each` row per key so a failure names the cue. Header (≤ 5 lines): why it exists (a cue writes visibility intent into settings; a cluster outside the snapshot stays changed after the tour restores; the core list is still hand-kept).
- [ ] Run it: passes.
- [ ] Mutation check: temporarily drop `orbitTrails` from `CORE_SNAPSHOT_CLUSTERS`, confirm the `orbitTrails` row fails; restore.
- [ ] `npx prettier --write`; commit `test(scene): visibility cues write only captured clusters`.

### Task 3: Docs and backlog

**Files:**
- Create: `docs/superpowers/specs/2026-10-12-derived-settings-snapshot-design.md` (copy of the spec supplied with the brief)
- Create: `docs/superpowers/plans/2026-10-13-derived-settings-snapshot.md` (this plan)
- Modify: `docs/BACKLOG.md` (delete the "Derive `SettingsSnapshot` from the Layer registry" index line)
- Delete: `docs/backlog/2026-09-21-derive-settings-snapshot.md`

No test: docs only.

- [x] Before deleting, read the backlog detail file and confirm nothing in it is left undone by this plan beyond what the spec rules out (it names `orientation` staying out and pricing `earth`/`blackHoleLensingTuning`; the audit in Task 1 is that pricing). Report anything else.
- [ ] Tick this plan's checkboxes as tasks finish.
- [x] Commit `docs: derived settings snapshot spec + plan; drop its backlog item`. This commit goes FIRST on the branch (before Task 1), so the draft PR opens with the spec and plan.

## Definition of Done

- **Deliverables:** `LayerSettingsClusterKey` type, `CORE_SNAPSHOT_CLUSTERS` constant, derived `SettingsSnapshot`, `captureSettings` with no hand-written cluster list, the guard test, the backlog item and detail file gone.
- **Observable behaviours:** a tour that hides the Local Bubble, constellations or orbit trails leaves them in their pre-tour state after it ends (unchanged); a Layer cluster added to `APP_SETTINGS_SLICES` appears in the snapshot with no other edit; at beat entries no Earth tile reload, thumbnail refetch or lensing cubemap rebuild fires from the equal-valued restore (Task 1 audit).
- **Deferral boundary:** the seven fade tables and `VisibilityLayerKey` (later prep PR); the shared Fresnel rim (its own PR); the debug panel being clickable while hidden during a takeover.
