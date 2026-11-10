# Clip studio handoff (cloud session → Claude CLI, 2026-11-10)

## RESUME HERE (CLI session, 2026-11-10, after wave B)

- Worktree `.claude/worktrees/clip-studio`, branch `feat/clip-studio` (renamed from ccr-4503b6fa-vvpnc3; old
  remote deleted), pushed through 2f751f6a4. Dev server: `npm run dev` here (was on :5175). `public/data` is
  linked to main. Mocks restored from the snapshot (gitignored).
- Done: Task 0, G0 0.1–0.3, 0.4 (contract amended, plan d12212c42), G1 1.1–1.8, G2 2.1–2.6 + 4 contract
  rulings, G3 3.1–3.4 + Q39 icon rework (34 new icons in src/components/icons, NOT yet visually checked).
- In flight when this was written (re-dispatch from the plan if lost):
  - **G4 shell + timeline view, Tasks 4.1–4.5** (sonnet), file set `packages/studio/src/{shell,timeline/components}/**`.
    On return: log it, push.
  - **G5 inspector, Tasks 5.1–5.3 + a Q38 task** (sonnet): a compact variant of the app's `src/components/common/Slider`,
    with NumberField as a thin wrapper over it; file set `packages/studio/src/inspector/**`, NumberField,
    Slider. On return: log it, push.
  - **Round-3 mock designer** (mock files only): fixes every round-2 finding plus Q32–Q39; shots go to
    `data/shots/studio-rounds/round-3-*.jpg`. On return: show the owner the shots, then run a fresh round-3
    review per `review-brief.md` and loop to 8/10.
- Next after G4 + G5: Task 6.1 (controller; StudioHost in App, the dock's inspector column, backlog line, smoke
  test with `#studio=` links), then an icon contact-sheet check, then one whole-branch review (spec fidelity +
  slop; known: StudioTip draws its own key chips instead of reusing Kbd), then the PR (owner's merge word only).
- All owner rulings are in the grill transcript (Q1–Q39). Round-2 review: `review-round-2.md` (7/10).



Temporary: delete this folder before the branch merges (the plan's Task 6.1 / `/feature-done` does).

## Where things stand

- **Branch** `feat/clip-studio`. Decisions: `docs/grill-sessions/clip-studio-2026-11-07.md` (Q1–Q31).
  Plan: `docs/superpowers/plans/2026-11-10-clip-studio-package.md` (slice 1, 29 tasks, waves 0/A/B/C/D).
- **Done and pushed:** Task 0 (EffectPath / EffectSpan types), G0 Tasks 0.1–0.3 (compileClip spans,
  flyPath knot times, `ClipCompileError` with paths), and G1 Tasks 1.1–1.8 (package scaffold, `combineSlices`
  + ADR 0016, `withFrozenClockSaga`, `#studio=<clipId>` takeover, contract types, draft addressing, studio
  slice, session saga). `typecheck:fast` is clean, and the targeted tests pass (50 files). CI hasn't run.
- **Next:** wave B in parallel: G2 (model + registry, Tasks 2.1–2.6) and G3 (primitives, 3.1–3.4). Then
  wave C: G4 (shell + timeline view) and G5 (inspector). Then wave D, Task 6.1. Then one whole-branch review.
  The ledger is `ledger.md` beside this file; copy it into `.superpowers/sdd/2026-11-10-clip-studio-package/progress.md`.

## Historical (cloud handoff, now resolved)

### Open before wave B starts

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
