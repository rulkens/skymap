# Derive `SettingsSnapshot` from the Layer registry

`needs-design` — the checkpoint below has to be answered before any code.
Written 2026-09-21, out of PR #793. Start with `/wt derive settings snapshot`;
the body of this file is the brief.

## The task

`SettingsSnapshot` (`src/@types/engine/settings/SettingsSnapshot.d.ts`) is a
hand-maintained `Pick<EngineSettingsState, …>` naming the settings clusters a
takeover (a tour or an exhibit) captures before it runs and restores when it
ends. Investigate whether that list can be **derived** from the Layer registry
instead of hand-written, and land it if the answer holds up.

Do not write code until the checkpoint below is answered.

## Why this is being asked

On 2026-09-21 the list was found to be missing `localBubble` and
`constellations`. Both are keys in `VISIBILITY_LAYER_ROWS`
(`src/data/animation/visibilityLayerRows.ts`), so a clip's `hide()`/`show()`
cue can address them, and such a cue writes visibility INTENT into settings
(see `src/layers/localBubble/present/localBubbleFadeRows.ts`:
`intent: (s) => s.localBubble.enabled`). A tour that hid either one left it
hidden after the restore — the viewer's setting silently consumed.

It was latent, not live: no shipped clip names either key. Both Layers landed
after the list was written and nobody re-checked it. They were added by hand in
commit `4b4d2f3d7` (PR #793). **That hand-fix is the thing this task is meant to
make unnecessary for the next Layer.** The failure mode is the point: a
hand-maintained list that a new Layer must remember to join is the bug.

## What is true today (verified, don't re-derive)

- The store has **24** settings clusters. The snapshot captures **15**;
  `orientation` rides separately on `SceneSnapshot` (that type's header explains
  why, and it must stay that way).
- Captured: `galaxyCatalogs structures volumes filaments milkyWay
  zoneOfAvoidance flow localBubble constellations orbitTrails starCatalogs
  bodies labels picking camera`.
- Not captured: `tonemap bloom hdr bias earth sgrAStarLensingTuning thumbnails
  debug`.
- `CORE_SETTINGS_SLICES` (`src/state/settings/coreSettingsSlices.ts`) holds
  `orientation camera tonemap hdr bloom labels picking debug`.
- `APP_SETTINGS_SLICES` (`src/compositions/appSettingsSlices.ts`) is built by
  spreading per-Layer arrays — this is the seam the derivation would use.
- The body Layer owns four clusters: `bodies earth orbitTrails
  sgrAStarLensingTuning`. Two are captured, two are not — so "capture every
  Layer cluster" is NOT today's behaviour, and adopting it is a real change.
- `captureSettings` (`src/state/scene/captureSettings.ts`) destructures the
  clusters by name and `structuredClone`s them. `restoreSceneSaga` puts them
  back in one `mergeSnapshot`.
- Three tests pin the cluster list by name and will fail on any change — that
  is them working, not breakage: `tests/state/scene/captureScene.test.ts`,
  `captureSettings.test.ts`, `restoreSceneSaga.test.ts`.

## The checkpoint — answer before writing code

1. **Price the newly-swept clusters.** A derivation over Layer slices pulls in
   `earth` and `sgrAStarLensingTuning`. Capturing a cluster the takeover never
   writes is a no-op on restore — UNLESS something outside the takeover writes
   it concurrently, in which case restore stomps that write. That concurrent-
   writer hazard is the stated reason for today's exclusions
   (`SettingsSnapshot`'s header). Find out whether anything writes those two
   during a takeover; say what you checked. If the hazard is real for any
   cluster, the derivation needs an opt-out and you should say what it costs.
2. **Pick the shape and justify it against the alternative.** At least these
   two, and say which you recommend:
   - **(a) Derive the type.** Snapshot = every Layer cluster + an explicit core
     list. Removes the hand-maintained list entirely; a new Layer joins for
     free. Costs: the newly-swept clusters above, and the type becomes indirect
     to read.
   - **(b) Keep the list, add a guard.** Leave `Pick<>` hand-written but add a
     test asserting every `VisibilityLayerKey` resolves to a captured cluster.
     ~15 lines, no type change, catches exactly the bug that happened — but
     only for visibility keys, and the list stays hand-maintained.
   (b) is the cheap fix and a legitimate answer. Do not pick (a) because it is
   more clever; pick it only if it genuinely retires the maintenance burden.
3. **Say whether a `VisibilityLayerKey` → cluster guard is still wanted under
   your chosen shape.** Under (a) it may be redundant; under (b) it is the
   whole deliverable. Don't ship both without saying why both are needed.

## Constraints

- Separate PR off `origin/main`, its own worktree. Do NOT touch PR #793.
- Project conventions in `CLAUDE.md` bind: `type` never `interface`; one symbol
  per file in `utils/` and `@types/`; comment budget (module header ≤ 5 lines,
  comment lines ≤ half the code lines) and comments explain WHY.
- `npm run typecheck` silent and `npm test` green before every commit.
- `npx prettier --write <files>` — never `npm run format`.
- Test what can break (`docs/superpowers/conventions/testing.md`): a test that
  restates the type or mirrors the implementation is a finding, not coverage.
  If you add a guard test, mutation-verify it — break the thing it guards and
  confirm it goes red.
- Read `SettingsSnapshot`'s header before editing it. It records why
  `orientation` is excluded and why the exclusion list exists; both are
  landmines, not decoration.
