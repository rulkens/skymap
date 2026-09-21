# Search palette tabs PR3 — views, tours, takeover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the palette's four view cards live — a view takes over the scene, states its case over the render, and hands control back on Esc — with tours and views sharing one takeover bracket instead of each orchestrating its own.

**Architecture:** One `runTakeover(source, body)` saga owns snapshot → start → body → restore → end, and a single `takeLatest` over start requests gives tours and views mutual exclusion for free; neither feature knows the other exists. A view is a registry row (`src/data/views/viewRegistry.ts`) whose body applies a settings patch, plays a pose-addressed clip, and waits for `exitTakeover`.

**Tech Stack:** TypeScript, Redux Toolkit, typed-redux-saga, React, Vitest, Playwright (capture tool).

**Spec:** `docs/superpowers/specs/2026-09-19-search-palette-tabs-design.md` (§3.5 prep P2–P3, §7, §8). PR1 → `#762`, PR2 → `#765`, both merged.

## Global Constraints

- **`ViewId` is a closed union, already shipped** at `src/@types/views/ViewId.d.ts:3`: `'solarSystem' | 'cosmicFlows' | 'cosmicWeb' | 'observableUniverse'`. Do not widen it.
- **`PaletteAction`'s `view` member already exists** (`src/@types/palette/PaletteAction.d.ts:5`). Do not re-add it.
- **The user writes all view copy.** Registry entries ship with placeholder prose, exactly as PR1 shipped placeholder blurbs; the user replaces it before merge.
- **`featured` naming stays.** The `featured` → `curated` rename was dropped by the user on 2026-09-20. Do not rename `featuredTabs.ts`, `FEATURED_TABS`, `FeaturedCard`, `public/images/featured/` or `capture-featured`.
- **Card images resolve through `CARD_IMAGE_DIR`** (`src/data/palette/cardImageDir.ts`). Never re-spell the image path.
- **Moving or renaming any `.ts` file uses `npm run move-files`**, never `git mv` plus hand-edited imports. See `.claude/skills/refactor/SKILL.md`.
- **Types live in `@types/`**, one type per file; `utils/` is one function per file. Under `tools/`, a tool app's types go in `tools/<tool>/@types/` and shared-helper types in `tools/@types/<area>/`.
- **Comment budget:** module header ≤ 5 lines, comment lines ≤ half the code lines; explain _why_, never _what_.

## Landing in three PRs

Decided 2026-09-21. The cuts are the dependency seams, and the order front-loads
the pose helper because the user cannot frame two of the four views without it.

| PR                   | Tasks        | Lands                                                                 |
| -------------------- | ------------ | --------------------------------------------------------------------- |
| **3a** — the bracket | 10, 1, 2, 3  | Pure refactor, no user-visible change. `#781`.                        |
| **3b** — views live  | 4, 5, 6, 8   | View cards stop being inert; placeholder copy, two placeholder poses. |
| **3c** — the rest    | 7, 9, 11, 12 | Tours tab, search rows, capture change, six thumbnails, copy, smoke.  |

Task 10 rides 3a despite being a views task: it is ~20 lines against the debug
panel, touches nothing else, and merging it first lets the user frame the
`solarSystem` and `observableUniverse` poses while 3b is being written.

Thumbnails must trail into 3c because capture needs the final poses. The four
view cards already render a broken thumbnail on `main` today (`featuredTabs.ts`
:125, :178-190 carry no `image` override and no webp exists), so 3b does not
make that worse.

---

### Task 1: Prep P2 — move the scene snapshot helpers out of `tour/`

The snapshot is about the scene, not about tours; views are about to take it too. `SceneSnapshot` already lives outside `tour/` (`src/@types/engine/settings/SceneSnapshot.ts:52`), so only the three implementation files move.

**Files:**

- Move: `src/state/tour/{captureScene,captureSettings,restoreSceneSaga}.ts` → `src/state/scene/`
- The `tests/` mirror moves with them (the tool does this).

- [x] Run the move, dry first:

```bash
npm run move-files -- --manifest moves.json --dry
npm run move-files -- --manifest moves.json
```

with `moves.json`:

```json
[
  { "from": "src/state/tour/captureScene.ts", "to": "src/state/scene/captureScene.ts" },
  { "from": "src/state/tour/captureSettings.ts", "to": "src/state/scene/captureSettings.ts" },
  { "from": "src/state/tour/restoreSceneSaga.ts", "to": "src/state/scene/restoreSceneSaga.ts" }
]
```

- [x] Grep for the old paths afterwards — the tool misses string literals and `.md`: `grep -rn "tour/captureScene\|tour/captureSettings\|tour/restoreSceneSaga" src tools tests docs`.
- [x] **No new tests.** This is a move; the existing `tests/state/scene/*.test.ts` (carried over) are the proof.
- [x] `npm run typecheck` silent, `npm test` green, commit as its own prep commit.

---

### Task 2: Finish the `CameraPose` unification — `PerfPose` extends it

The spec's radar finding 5 claims this landed; it did not. `src/@types/perf/PerfPose.ts:20-36` still re-declares `target`/`yaw`/`pitch`/`distance` field-for-field beside `CameraPose` (`src/@types/camera/CameraPose.d.ts:10-22`). Two copies of a pose shape is exactly the drift the finding was raised about.

**Files:** `src/@types/perf/PerfPose.ts` (modify)

**Target shape:**

```ts
export type PerfPose = CameraPose & {
  rate?: number;
  clearFocus?: boolean;
};
```

- [x] Rewrite `PerfPose` as above, dropping the four duplicated fields and the now-unused `Vec3` import.
- [x] **No new test.** A type change the compiler proves; `npm run typecheck` is the gate. Note that `CameraPose.roll?` becomes reachable on `PerfPose` — confirm no perf-hook code branches on key presence in a way that breaks.
- [x] `npm run typecheck` silent, `npm test` green, commit.

---

### Task 3: Prep P3 — the takeover slice and the one bracket

**review: yes** — Redux state, sagas, and a cancellation path CI cannot see.

The single hardest task in the plan, and the reason the rest is small. Today `guidedTourSaga` (`src/state/tour/guidedTourSaga.ts:84`) _is_ the bracket: it takes the snapshot (`:88`), dispatches `tourStarted` (`:92`), races the beat loop against `exitTour` (`:103-167`), restores in `finally` (`:171`), and skips `tourEnded` when superseded via `if (!(yield* cancelled()))` (`:180-182`). That structure moves wholesale into `runTakeover`; what stays behind is the beat loop.

**Files:**

- Create: `src/state/takeover/{takeoverSlice.ts,takeoverActions.ts,selectors.ts,runTakeover.ts,watchTakeoverSaga.ts}`
- Create: `src/@types/takeover/TakeoverSource.d.ts`, `src/@types/takeover/TakeoverState.d.ts`
- Modify: `src/state/tour/guidedTourSaga.ts` (becomes `tourBody`), `src/state/tour/watchTourSaga.ts` (deleted — `watchTakeoverSaga` subsumes it), `src/state/tour/{tourSlice.ts,selectors.ts}`, `src/state/input/keyboardShortcuts.ts:54`, `src/components/App/App.tsx:84,130`, `src/components/containers/TourOverlayContainer.tsx:57`
- Test: `tests/state/takeover/runTakeover.test.ts`, plus the existing `tests/state/tour/*.test.ts`

**Interfaces — Produces:**

```ts
// src/@types/takeover/TakeoverSource.d.ts
export type TakeoverSource = { kind: 'tour'; id: TourId } | { kind: 'view'; id: ViewId };

// src/@types/takeover/TakeoverState.d.ts
export type TakeoverState = { active: TakeoverSource | null };

// takeoverActions.ts
export const takeoverStarted: ActionCreatorWithPayload<TakeoverSource>;
export const takeoverEnded: ActionCreatorWithoutPayload;
export const exitTakeover: ActionCreatorWithoutPayload;

// runTakeover.ts
export function* runTakeover(source: TakeoverSource, body: () => Generator): Generator;

// selectors.ts
export const selectTakeoverActive: (state: RootState) => boolean;
export const selectTakeoverSource: (state: RootState) => TakeoverSource | null;
```

**The bracket's contract** — `runTakeover` does, in order: `select(captureScene)`; `put(takeoverStarted(source))`; run `body`; then in `finally`, `call(restoreSceneSaga, snapshot)`, and `put(takeoverEnded())` **only when `!(yield* cancelled())`**. Lift this from `guidedTourSaga.ts:88-183` rather than rewriting it — the `cancelled()` guard at `:180` is load-bearing and subtle: a superseded run must not clobber the incoming run's `takeoverStarted`.

**Mutual exclusion** — `watchTakeoverSaga` is a single `takeLatest` over both `startTour` and `openView`, dispatching the matching body under `runTakeover`. `takeLatest` cancelling the previous run is what makes its `finally` restore before the new snapshot is taken. Do not add a second `takeLatest`; two would break the ordering the tests below pin.

**`selectTourActive` is preserved, not deleted** — it becomes `selectTakeoverSource(state)?.kind === 'tour'`, and `tour.active` is deleted from `tourSlice`. Its seven read sites (`keyboardShortcuts.ts:80-82`, `installRecorderHook.ts:80,88`, `App.tsx:84`, plus three doc comments) keep working untouched.

- [x] Add the two types and the slice (`active: TakeoverSource | null`, reducers for `takeoverStarted`/`takeoverEnded`).
- [x] Write `tests/state/takeover/runTakeover.test.ts` with exactly these four names, which are the acceptance criteria:
  - `starting a view cancels a running tour and restores its settings before the new snapshot`
  - `a view restores its settings and toggle changes on exit`
  - `a superseded run does not dispatch takeoverEnded`
  - `selectTourActive is still true for a running tour`
- [x] Move the bracket out of `guidedTourSaga` into `runTakeover`; what remains becomes `tourBody(tour, range)` — the `while` loop at `:110-163` and its `exitTour` race, with `exitTour` becoming `exitTakeover`.
- [x] Replace `watchTourSaga` with `watchTakeoverSaga` (wire it wherever `watchTourSaga` was registered; grep for it).
- [x] `keyboardShortcuts.ts:54`: swap `exitTour()` for `exitTakeover()`. The list stays three long — consolidating it is a separate backlog item (spec §3.7), not this task.
- [x] `App.tsx:130`: the hide expression is already `uiHidden || splashVisible || tourActive` — **swap `tourActive` for `takeoverActive`**, don't add a fourth term. Keep `tourOverlay` (`App.tsx:102`) and `TourBeatRailContainer` (`:165`) gated on `tourActive`, since they are tour chrome, not takeover chrome.
- [x] `TourOverlayContainer.tsx:57`: `exitTour()` → `exitTakeover()`.
- [x] Update the existing tour tests that read `tour.active` or dispatch `exitTour`. Everything else in `tests/state/tour/` must stay green **unmodified** — that is the behaviour-preservation proof.
- [x] `npm run typecheck` silent, `npm test` green, commit as its own prep commit.

---

### Task 4: The `View` type and registry

**Files:**

- Create: `src/@types/views/View.d.ts`, `src/@types/views/ViewSection.d.ts`, `src/data/views/viewRegistry.ts`
- Test: none (see below)

**Shape** — one type per file, so these are two files:

```ts
// View.d.ts
export type View = {
  id: ViewId;
  label: string;
  /** Applied through `mergeSnapshot`; the takeover bracket restores it on exit. */
  settings: Partial<SettingsSnapshot>;
  pose: CameraPose;
  body: readonly ViewSection[];
};

// ViewSection.d.ts
export type ViewSection = { heading: string; text: string };
```

`viewRegistry.ts` is `Record<ViewId, View>`, hand-edited like `featuredTabs.ts`.

**Settings and poses, from spec §7.1:**

- `cosmicWeb` — the user-framed pose recorded in `docs/grill-sessions/search-palette-tabs-2026-09-18.md` (Design pass); galaxies off.
- `cosmicFlows` — flow on, galaxies and Milky Way off. Its pose already exists as the `start` of the shipped clip at `src/data/animation/clips/cosmicFlows.ts:72` — reuse those numbers, do not re-derive them.
- `solarSystem`, `observableUniverse` — **placeholder poses**, framed by the user with Task 9's helper before merge. Mark each with a one-line comment saying so.

Copy is placeholder prose in every entry; the user writes it. The Cosmic Web draft content (sections, facts, sources from `docs/DATA.md`) is on the V6 artboard and in the grill transcript's Design pass — use it for that one entry.

- [ ] **No tests.** Registry content is data (spec §8: no tests for `featuredTabs.ts` content, and this is its sibling). The compiler proves the shape; the user proves the copy.
- [ ] `npm run typecheck` silent, commit.

---

### Task 5: The pose-addressed clip

`flyToClip` (`src/state/tour/flyToClip.ts:30-44`) is focus-addressed: `moveTargetId`/`dollyToId` resolve a `FocusId` through a catalog lookup. A view is addressed by a pose, which needs no lookup.

**Files:** create `src/state/scene/flyToPoseClip.ts`; test `tests/state/scene/flyToPoseClip.test.ts`

**Signature:** `flyToPoseClip(pose: CameraPose): ClipData`

**Behaviour:** same shape as `flyToClip` — `start: 'live'`, one `timeline` entry wrapping `all([...])`, same `FLY_SEC` and `'easeInOutCubic'` — but built from the concrete arms `moveTarget(to: Vec3, over, ease)` (`src/services/engine/animation/effectHelpers.ts:122`) and `dollyTo(mpc: number, over, ease?)` (`:110`), reading `pose.target` and `pose.distance`. No `resolveClipFoci` pass.

- [ ] Add the test `flyToPoseClip targets the pose without a focus lookup`, asserting the returned `ClipData` carries the pose's `target` and `distance` and that `start` is `'live'`.
- [ ] Implement against `flyToClip.ts:30-44` as the shape reference.
- [ ] **Decide and record in a comment:** `flyToClip` moves target and distance only, not bearing, so `pose.yaw`/`pose.pitch` are unused here. If a view needs its bearing honoured, that is an `aimAt` arm and belongs in this task — check the Cosmic Web pose before deciding, since a wrong bearing is invisible to the test but obvious on screen.
- [ ] `npm test -- flyToPoseClip` green, commit.

---

### Task 6: `openView`, `viewBody`, and the container's live `view` handler

**review: yes** — saga wiring and the takeover ordering.

**Files:**

- Create: `src/state/views/{viewActions.ts,viewBody.ts}`
- Modify: `src/state/takeover/watchTakeoverSaga.ts`, `src/components/containers/CommandPaletteContainer.tsx:25-36`
- Test: `tests/state/views/viewBody.test.ts`

**Interfaces — Consumes:** `runTakeover` (Task 3), `viewRegistry` (Task 4), `flyToPoseClip` (Task 5).

**Produces:** `export const openView: ActionCreatorWithPayload<ViewId>;` and `export function* viewBody(view: View): Generator;`

**`viewBody` does three things, in order** (spec §7.2): `put(mergeSnapshot(view.settings))`; play `flyToPoseClip(view.pose)`; wait for `exitTakeover`. It does **not** snapshot, restore, or dispatch start/end — the bracket owns all of that.

- [ ] Add `openView` to `watchTakeoverSaga`'s `takeLatest` alongside `startTour`, running `viewBody` under `runTakeover({ kind: 'view', id })`.
- [ ] `CommandPaletteContainer.tsx:32-35`: replace the `view: () => {}` stub (marked "Placeholder until PR3") with `dispatch(openView(action.viewId))`.
- [ ] Write `tests/state/views/viewBody.test.ts` with these names:
  - `viewBody applies the view settings before playing the clip`
  - `viewBody waits for exitTakeover and does not restore on its own`
- [ ] **Orbiting must not end a view** (spec §7.2). The `exitTakeover` race is the only abort arm — do not race camera-input actions. `guidedTourSaga.ts:78-82` carries a comment explaining why; read it before wiring the race.
- [ ] `npm run typecheck` silent, `npm test` green, commit.

---

### Task 7: The Tours tab and the `tour` card action

PR1 shipped the Tours tab **hidden**, because it had no cards until now (spec §5.1). This is the other half of the container's action table, and the only task that adds a `PaletteAction` member.

**Files:**

- Modify: `src/@types/palette/PaletteAction.d.ts:5`, `src/data/palette/featuredTabs.ts`, `src/components/containers/CommandPaletteContainer.tsx:25-36`, wherever PR1 hides the Tours tab (grep `featuredTabs.ts` and `PaletteTabs.tsx` for the hiding condition)

**New union member:** `| { kind: 'tour'; tourId: TourId }`, alongside the existing `focus` and `view`.

- [ ] Add the `tour` member to `PaletteAction`, and a `tour` entry to the container's `RUN_ACTION` table dispatching `startTour(action.tourId)`. Follow the `focus` entry's `if (action.kind !== 'tour') return;` narrowing at `CommandPaletteContainer.tsx:27`.
- [ ] Add the Tours tab's two cards to `featuredTabs.ts` — `grandTour` and `webShowcase` (spec §5.1 table) — with placeholder blurbs the user replaces.
- [ ] Unhide the Tours tab.
- [ ] **No new test here** — Task 8's all-kinds `actionForRow` coverage and the existing tab test carry it.
- [ ] `npm run typecheck` silent, `npm test` green, commit.

---

### Task 8: `ViewOverlay`

**Files:**

- Create: `src/components/ViewOverlay/ViewOverlay.tsx` + its CSS module, `src/components/containers/ViewOverlayContainer.tsx`
- Modify: `src/components/App/App.tsx`, `index.html` (Sora font)
- Test: none

Notes on the scene, no card (spec §4.2 — read it for the visual design, and the V6 artboard it references). Mount it as a sibling of `tourOverlay` (`App.tsx:102`), gated on `selectTakeoverSource(state)?.kind === 'view'`. It renders the active view's `label` and `body` sections and an Exit control dispatching `exitTakeover()`.

- [ ] Load Sora (weight 100) in `index.html` beside Cormorant, and use it **only** in `ViewOverlay` (spec §4.3). Adding a `--font-family-body` token and switching InfoCard and tour captions to it is a **separate PR** — do not do it here.
- [ ] **No tests** — presentational, gated by a selector the Task 3 tests already cover.
- [ ] **User eye-check, mandatory:** at weight 100 over bright filaments, legibility is the open risk the spec flags. If it is thin, **raise the size before raising the weight**.
- [ ] `npm run typecheck` silent, commit.

---

### Task 9: `view` and `tour` search rows

**Files:**

- Modify: `src/components/CommandPalette/paletteRowModel.ts:36-41` (two new `ScoredRow` kinds), `paletteRows.tsx:45` (`ROW_VIEW`), `utils/actionForRow.ts:37-61`, `utils/rankPaletteMatches.ts:97`
- Test: `tests/components/CommandPalette/utils/actionForRow.test.ts` (extend)

**New kinds:** `{ kind: 'view'; view: View; score: number }` and `{ kind: 'tour'; tour: Tour; score: number }`.

**Scoring** — score on `label` the way famous rows do: `scoreFamousMatch({ id, names: [label], description }, query)` (`utils/scoreFamousMatch.ts:29`), folded into the `primaryScored` merge-and-sort at `rankPaletteMatches.ts:97` so they rank alongside famous and body rows. Only registry views and tours get rows, so focus cards never duplicate object rows (spec §7.4).

**`actionForRow`** — `FOCUS_ID` (`actionForRow.ts:37-57`) currently maps every kind to a focus id, and the function hard-codes `{ kind: 'focus', ... }` at `:59-61`. The two new kinds do **not** produce a focus action, so this shape has to change: make the table map each kind directly to a `PaletteAction`. That is the un-braiding, not a special case for two kinds.

- [ ] **The existing test is thinner than the spec claims.** Spec §8 calls `actionForRow` "a table-coverage test", but `tests/components/CommandPalette/utils/actionForRow.test.ts:32-44` only covers `alias` and `structure`. Add the missing coverage as part of this task: one assertion per `ScoredRow` kind, all seven, so a future kind added to the union without a table row fails here rather than at runtime.
- [ ] Add a `ROW_VIEW` entry per new kind (`paletteRows.tsx`), matching the `RowView` shape at `:27-33`.
- [ ] `npm test -- actionForRow` green, `npm run typecheck` silent, commit.

---

### Task 10: "Copy view pose" debug helper

**Files:** modify `src/components/DebugPanel/CameraStateSection.tsx`

This is what the user frames `solarSystem` and `observableUniverse` with, so it lands **before** they are asked for poses.

**Behaviour:** a button writing a paste-ready `pose: { target: [...], yaw: …, pitch: …, distance: … }` snippet for the live camera to the clipboard, in `CameraPose` units (Mpc, radians) — pasteable straight into `viewRegistry.ts`.

- [x] Match the existing precedent in the same file: the "copy all" button at `CameraStateSection.tsx:254-268`, which assembles a **fresh** snapshot rather than the stale 4 Hz poll (`POLL_MS = 250`, `:29`) — read the comment at `:255`, it exists because of that exact bug. Alternatively reuse `src/components/common/CopyButton/CopyButton.tsx`; pick one and say which in the commit.
- [x] **No tests** — a clipboard button behind the debug panel.
- [x] `npm run typecheck` silent, commit.

---

### Task 11: Capture the view cards

**review: yes** — touches the capture tool's boot path.

The four view cards need thumbnails like every other card, and today they cannot get them: `tools/@types/capture/SceneShot.d.ts:8` makes `focusId` **required**, and `tools/utils/capture/captureScene.ts:31` always boots `${base}/?perf&cinema#focus=${shot.focusId}&t=${shot.t}` before applying any pose. A view has no focus id.

**Files:**

- Modify: `tools/@types/capture/SceneShot.d.ts`, `tools/utils/capture/captureScene.ts`, `tools/utils/capture/shotPose.ts`, `tools/capture/{capture.ts,selectCaptureTargets.ts}`
- Test: `tests/tools/utils/capture/shotPose.test.ts` (extend)

**Change:** `focusId` becomes optional. When absent, boot without the `#focus=` fragment and rely on the shot's `pose` alone; when absent **and** no `pose` is given, throw — a shot with neither is a curator error, not a default.

- [ ] Extend `tests/tools/utils/capture/shotPose.test.ts` with `a shot with neither focusId nor pose is refused`, asserting the throw.
- [ ] Add the boot branch in `captureScene.ts`. Everything downstream (`applyPose`, `poseMismatch`, `readLiveCameraState`) already works on a pose alone — note that `readLiveCameraState` returns only `yaw`/`pitch`/`distance`, not `target` (`tools/utils/browser/readLiveCameraState.ts:46`), which is why `poseMismatch` never compares targets.
- [ ] Give the four view cards a `capture` in `featuredTabs.ts` carrying each view's registry pose. The two Tours-tab cards from Task 7 need thumbnails too — a tour's first beat is a focus, so those shoot the ordinary way with a `focusId`.
- [ ] Run `npm run capture-featured -- --url http://localhost:<port> --force <the six card ids>` and commit the webps. **In a worktree, pass your own server's port** or you capture another branch's build.
- [ ] `npm test -- shotPose` green, commit.

---

### Task 12: The user's copy, poses, and smoke pass

Not an implementation task — the checkpoint PR1 had as its step 7.

- [ ] Hand the user Task 9's helper and ask for the `solarSystem` and `observableUniverse` poses.
- [ ] Hand the user the registry and ask for the four views' copy.
- [ ] Re-run Task 10's capture for any card whose pose changed.
- [ ] User smoke pass against the dev server — the named behaviours in the DoD below.

---

## Definition of Done

**Deliverable inventory**

- `src/state/takeover/` — slice, `runTakeover`, `watchTakeoverSaga`, `exitTakeover`; `tour.active` deleted and `selectTourActive` derived from the takeover source.
- `src/state/scene/` — `captureScene`, `captureSettings`, `restoreSceneSaga`, `flyToPoseClip`.
- `src/data/views/viewRegistry.ts` — four entries, each with the user's copy and a real pose.
- `src/components/ViewOverlay/` mounted and gated on an active view.
- `view` and `tour` rows in palette search; `actionForRow` covering all seven `ScoredRow` kinds.
- The Tours tab visible, carrying `grandTour` and `webShowcase`; `PaletteAction` carrying a `tour` member.
- Six new thumbnails under `public/images/featured/` (four views, two tours).
- `PerfPose` derived from `CameraPose`.

**Named observable behaviours (manual smoke)**

- Picking a view card flies to its pose and shows the overlay; the scene's settings change to the view's.
- Orbiting inside a view does **not** end it; Esc and the overlay's Exit both do, and both restore the pre-view scene.
- Starting a tour while a view is open ends the view first, and the view's settings are restored before the tour's snapshot is taken — and the reverse.
- A tour still runs exactly as before: beats, captions, the beat rail, prev/next/pause.
- Typing a view or tour name in the palette produces a row that launches it, and the Tours tab shows its two cards.
- The overlay's Sora 100 body text is legible over bright filaments.

**Deferral boundary**

- The `--font-family-body` token, and switching InfoCard and tour captions to it — separate PR (spec §4.3).
- Consolidating the Esc action list at `keyboardShortcuts.ts:54` — its own backlog item (spec §3.7).
- The `featured` → `curated` rename — dropped by the user, not deferred.
