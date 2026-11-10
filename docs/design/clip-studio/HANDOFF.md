# Clip studio handoff (cloud session → Claude CLI, 2026-11-10)

Temporary: delete this folder before the branch merges (the plan's Task 6.1 / `/feature-done` does).

## Where things stand

- **Branch** `ccr-4503b6fa-vvpnc3`. Decisions: `docs/grill-sessions/clip-studio-2026-11-07.md` (Q1–Q31).
  Plan: `docs/superpowers/plans/2026-11-10-clip-studio-package.md` (slice 1, 29 tasks, waves 0/A/B/C/D).
- **Done and pushed:** Task 0 (EffectPath / EffectSpan types), G0 Tasks 0.1–0.3 (compileClip spans,
  flyPath knot times, `ClipCompileError` with paths), and G1 Tasks 1.1–1.8 (package scaffold, `combineSlices`
  + ADR 0016, `withFrozenClockSaga`, `#studio=<clipId>` takeover, contract types, draft addressing, studio
  slice, session saga). `typecheck:fast` is clean, and the targeted tests pass (50 files). CI hasn't run.
- **Next:** wave B in parallel: G2 (model + registry, Tasks 2.1–2.6) and G3 (primitives, 3.1–3.4). Then
  wave C: G4 (shell + timeline view) and G5 (inspector). Then wave D, Task 6.1. Then one whole-branch review.
  The ledger is `ledger.md` beside this file; copy it into `.superpowers/sdd/2026-11-10-clip-studio-package/progress.md`.

## Open before wave B starts

- **Task 0.4's contract is wrong (controller ruling needed).** `resolveClipFoci` turns `lookAtId`/`aimAlong`
  into `aimAt` = `all([yaw, pitch])`, so a draft leaf at path P becomes an `all` with children that exist
  only in the resolved tree (7 registry clips). Every draft path still exists; spans and errors can name
  deeper paths. Recommended: amend the contract so the studio trims a resolved path to its longest draft
  prefix (a pure helper in G2), and leave the engine alone. G0's failing draft test was in the old
  session's scratchpad and is lost; re-derive it from this note.
- G1 deviations, accepted: two files edited outside its set (`src/state/remote/selectDomeStatus.ts`,
  `src/utils/url/combineLinkViews.ts`); `studioBodySaga` races `exitTakeover`; selectors read
  `state.studio ?? initialState` (RTK's injected selectors don't fit `RootState`).

## Open owner design asks (from round 2; not yet asked)

1. **Q14 crossfade treatment.** Compare the crops in `data/shots/studio-rounds/round-2-xfade-t{1,2,3}-crop.jpg`
   (re-shoot locally; shots are gitignored). Recommended: T1 (tapered bars + Stop / No stop / Blend join
   marks), with the T3 value curve in the inspector. T2's lens is about 37 px wide at Fit.
2. **Save for values that depend on the sim date** (sondermarkenFlyout's Start / Aim / Roll). Recommended:
   keep body-frame literals (the Start as a `b,earth,…` link, aim/roll in Earth's frame), so the file stays
   `(simDays) => Clip` and works on any date.
3. **Where the clip-level `loop` flag lives.** Recommended: an End row that mirrors Start, carrying stop / loop
   and the seam check pose(End) = pose(0).
4. **3D frame-box size in the Edit view.** Recommended: real size, plus a fixed-size playhead dot on the route.
5. **When the path recomputes.** Recommended: on commit for drags, on every edit otherwise. Also: the
   debug panel's clip-path section goes once the studio ships (recommended), and the store's `scrub01`
   becomes `scrubSec`.

## Design reference

- Mocks: `tar xzf docs/design/clip-studio/mock-snapshot.tar.gz` from the repo root restores
  `src/dev/mocks/studio*` (gitignored). The current design is the `studio-d-*` entries, built on `TopBar`
  (layout B, Q29), `StudioTip`, `InspectorGrid` and `marks/`.
- Shoot: `npm run dev`, then `docs/design/clip-studio/shoot.sh studio-d-<state> '<hash>'`. One browser at a
  time; it prints the shot path. The pose for Cosmic Flows states is `pose=a,0,-0.01,0,-1.7455,-0.3589,0.14,0`.
- The review loop: `review-brief.md` (the standing brief with every owner preference) and
  `review-round-1.md` (4/10, with the naming-convention table). **Round 2 hasn't been reviewed yet.** Run a
  fresh reviewer over the round-2 shots against the brief; loop fix → review until it scores 8/10, sending
  the owner each round's shots and a reviewer summary.
- Known mock loose ends: Cosmic Flows' bob shows `end` but should be `∞`; the "after end" label is in two
  places; StudioD.tsx has an unused `Status` / `fmt`; the Camera inset uses a placeholder crop;
  `docs/animation/clip-primitives.md`'s flowOrbit example (around line 507) is stale.
