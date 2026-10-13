# Heliosphere prep: a derived settings snapshot

A prep PR for the heliosphere shell Layer: the tour's `SettingsSnapshot`
captures every Layer settings cluster automatically, so a new Layer lands
without a hand edit to the snapshot. The shared Fresnel rim (the other half
of the original prep) ships as its own PR, `heliosphere-prep-fresnel-rim`.
Layer-declared `visibility` rows replacing the seven fade tables are a later
prep PR with their own spec, after a grill session.

## Goal

The takeover's `SettingsSnapshot` captures every Layer settings cluster
automatically, so a tour can never leave a new Layer's state changed after
it restores.

Behaviour is unchanged except where noted under "Behaviour changes".

## Why

`SettingsSnapshot` is a hand-written `Pick<>` of 17 cluster names, mirrored by
a hand-written destructure in `captureSettings`. A new Layer must remember to
join both, and nothing fails if it doesn't: Local Bubble and constellations
were missed until #793, and a tour that hid either left it hidden after
restore. This picks up `docs/backlog/2026-09-21-derive-settings-snapshot.md`
(its index line in `docs/BACKLOG.md` and the detail file are deleted in this
PR).

## Facts this rests on (verified 2026-10-13 on main `93137c27a`)

- 26 clusters: 9 core (`CORE_SETTINGS_SLICES`), 17 Layer
  (`APP_SETTINGS_SLICES`). Each slice's `reducerPath` is a literal equal to
  its cluster key, and each slice's `name` is `settings/<reducerPath>`
  (pinned by `tests/compositions/appSettingsSlices.test.ts` and
  `coreSettingsSlices.test.ts`).
- Captured today: 13 Layer clusters and 4 core ones (`camera`, `labels`,
  `orbitTrails`, `picking`).
- Layer clusters not captured: `earth`, `bias`, `thumbnails`,
  `blackHoleLensingTuning`. No saga, clip, cue, exhibit or keyboard shortcut
  writes them; only their own panels do (`thumbnails` has no writer at all).

## Contract

```ts
// src/@types/settings/LayerSettingsClusterKey.d.ts
export type LayerSettingsClusterKey = (typeof APP_SETTINGS_SLICES)[number]['reducerPath'];

// src/data/settings/coreSnapshotClusters.ts
export const CORE_SNAPSHOT_CLUSTERS = ['camera', 'labels', 'orbitTrails', 'picking'] as const;

// src/@types/engine/settings/SettingsSnapshot.d.ts
export type SettingsSnapshot = Readonly<
  Pick<EngineSettingsState, LayerSettingsClusterKey | (typeof CORE_SNAPSHOT_CLUSTERS)[number]>
>;

// src/state/scene/captureSettings.ts — same signature as today
export function captureSettings(state: Pick<RootState, 'settings'>): SettingsSnapshot;
// picks APP_SETTINGS_SLICES' reducerPaths + CORE_SNAPSHOT_CLUSTERS, then structuredClone
```

- Every Layer cluster is captured, with no opt-out (ruled 2026-10-12).
- Core clusters stay an explicit list: the reasons each core cluster is in or
  out (`orientation` above all) stay in `SettingsSnapshot`'s header, rewritten
  to describe the rule rather than list the Layer clusters.
- `mergeSnapshot` and `restoreSceneSaga` need no change: the merge spreads
  whatever keys the snapshot has, and its type follows `SettingsSnapshot`.
- Import direction: `captureSettings` (in `src/state/`) imports
  `src/compositions/appSettingsSlices`, not a Layer, so
  `tests/conventions/layerImportBoundary.test.ts` (direct imports only) still
  passes. The settings root is already typed off `APP_SETTINGS_SLICES`, so the
  new type adds no cycle.

## Behaviour changes

- A tour or exhibit now also restores `earth`, `bias`, `thumbnails` and
  `blackHoleLensingTuning`, at every beat entry (`tourBodySaga`) and at the end.
  The only way to change them during a takeover is a viewer reaching the hidden
  but still mounted settings or debug panel; such a change is now reverted.
  Accepted (ruled 2026-10-12).

## Tests

- `captureSettings.test.ts` and `captureScene.test.ts` stop pinning a literal
  list of 17 keys. They assert behaviour instead:
  - `captures a Layer cluster it was never told about` (e.g. `earth`).
  - `never captures orientation` and `never captures tonemap` (kept).
  - `capture is detached from the live state` (kept).
- `restoreSceneSaga.test.ts`: its `SceneSnapshot`-typed literal gains the four
  clusters (the compiler demands it).
- One guard, because core clusters are still a hand list: `every visibility
  cue writes only captured clusters`: for each `VISIBILITY_ACTION_ROW` key,
  the actions from `actions(true, settings)` all target a cluster in the
  snapshot (action type `settings/<cluster>/…`). Mutation-verified by dropping
  `orbitTrails` from `CORE_SNAPSHOT_CLUSTERS`.
- Stale counts fixed in passing where the change touches them: "ten clusters"
  (`restoreSceneSaga.ts:10`, `captureScene.ts:2,13`, `SceneSnapshot.d.ts:7`),
  "twenty-two slices" (`settingsReducer.ts:4`).

## Ground preparation

None needed: this spec is itself ground preparation for the heliosphere
shell Layer (refactor-ground checkpoint 2026-10-11). The seam it builds on
exists: the `as const` slice tuples with literal `reducerPath`s.

## Out of scope

- The seven fade tables and `VisibilityLayerKey` (the later prep PR).
- The shared Fresnel rim (its own PR).
- The debug panel staying clickable while hidden during a takeover (seen in
  the survey; not part of this prep).
