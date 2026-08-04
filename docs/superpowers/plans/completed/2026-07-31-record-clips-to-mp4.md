# Record standalone clips to mp4

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Each implementer subagent is dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax.

**Design record:** `docs/grill-sessions/record-clips-to-mp4-2026-07-31.md` — seven decisions, settled with the user. This plan implements exactly those; do not re-open them. There is no separate spec (Q7 decision: short plan, no spec, with the Ground-preparation section below standing in for a `refactor-ground` run).

**Goal:** film any of the six standalone clips (`flyout`, `earthFlyout`, `flowOrbit`, `flyPathDemo`, `famousFlythrough`, `cosmicFlows`) to an mp4 with the existing offline recorder, reproducibly — `npm run record-clip -- flyout`. Today `window.__skymapRecorder` exposes only `ready` + `startTour`, so a clip that belongs to no tour cannot be filmed at all.

**Architecture:** one recorder entry point (`tools/record/record.ts`, renamed from `recordTour.ts`) whose subject is a two-case union `Take = {kind:'tour', id, beats} | {kind:'clip', id}`. The union decides exactly three things — the kick `page.evaluate`, the frame cap, and whether `FOLD_SETTLE_MS` is burnt. Launch, boot retry, virtual-time loop, capture clip/scale, ffmpeg pipe and ffprobe are subject-agnostic and shared verbatim. The app-side change is one new verb on the recorder seam (`startClip`) plus its type. The sim clock is pinned on every take by composing `#t=<ISO>` into the capture URL — no app change; the `t` row already exists in `HASH_PARAM_SOURCES` (`src/state/url/hashParamSources.ts:192-207`) and `watchHashReadSaga`'s boot pass applies it (`watchHashReadSaga.ts:110`).

**Tech stack:** TypeScript (tsx-run Node scripts), Playwright + CDP `Emulation` domain, ffmpeg/ffprobe (host prerequisites), Vitest, RTK.

## Global constraints

House rules, repeated in every dispatch:

- `type` aliases, never `interface`. One exported symbol per file under `tools/utils/`; one type per file under `src/@types/` (filename = symbol name).
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code lines in the file. Comments record _why_ — a landmine, a unit, a cross-file contract — never _what_.
- Deep relative imports, no barrels. Tests mirror the `src/`/`tools/` tree.
- `npm test` and `npm run typecheck` (BOTH tsconfigs) green at every task boundary.
- Commit per task; stage specific paths, never `git add -A`; prettier only on touched files.
- Search before writing a helper. Every new helper below is annotated "verified no existing helper"; re-verify at implementation time.
- Test what can break (`docs/superpowers/conventions/testing.md`): no runtime type tests, no registry restatements, no clamp-boundary or mirror tests. Expected values are hand-computed, never re-derived with the implementation's own formula.

## Two landmines — an implementer must not miss these

**1. The sim clock and the virtual frame clock are independent, and both must be right.**
`#t=<ISO>` pins the **sim** clock (which instant the solar system is drawn at) via the URL hash. CDP `Emulation.setVirtualTimePolicy` budgets drive the **frame** clock (how much page time each captured frame advances). They share no code and no units: the hash carries an ISO wall-clock instant that becomes a Julian-day anchor; the budget is `1000/fps` milliseconds of page time per grant. A take is only reproducible when both are pinned. Do not "simplify" one into the other, and do not assume pinning `t` freezes animation — it does not; camera tweens, fades and clip timelines all still run on the virtual frame clock.

**2. Frame 0 of a clip take shows the `?cinema` boot scene — this is an authoring rule, not a harness feature.**
A windowed _tour_ take burns `FOLD_SETTLE_MS` before capturing because the saga's scene reconstruction happens outside any beat's timeline. A clip's `scene()`/`show()`/`hide()` cues sit **on the clip's own timeline**, so there is no coherent settle for them: burning virtual time to let dressing land also burns the opening of the clip you are filming. Q5 decided Option A — document the rule, build nothing. The rule: **instant cues must precede any lead-in `wait` to dress literal frame 0** — `compileClip` accumulates the cursor across top-level timeline entries including `wait` (`src/services/engine/animation/compileClip.ts:334-340`), so a cue authored at the head of the timeline with `over: 0` fires wherever the cursor sits when the walk reaches it, not at t=0 unconditionally. `cosmicFlows` shows the instant-cue SHAPE but not the rule: its `hide([...], 0)` + `fade(['flow'], 0, 0)` + `scene(setFlowEnabled(true))` (`src/data/animation/clips/cosmicFlows.ts:77-79`) are all instant, but they sit behind a leading `wait(2)` (`cosmicFlows.ts:76`), so they land at t=2s and its own frame 0 is NOT dressed. Copy the cue shape but put it ahead of any lead-in `wait` when a clip needs frame 0 dressed. The accepted consequence: the first publishable take of a cue-less (or wait-then-cue) clip will look wrong on frame 0 until its instant cues are moved ahead of the lead-in.

## Not in scope

Each was decided against in the grill; the one-line reason is the decision, not a summary of it.

- **Captions / title cards for clip takes** (Q6 A) — a clip has no beat, so a caption would be a second source of caption truth alongside `BeatCaption`, for a payoff nobody can judge before watching a few takes. Titles go in post.
- **A `--settle` flag** (Q5 B) — the tour's settle is incoherent for clips: the virtual time it burns is the clip's own opening.
- **A harness-side scene-preset registry / `--scene`** (Q2 B) — it would be a second place scene state comes from; in-clip cues are the canonical home already.
- **Any change to the `Clip` type** (Q5 C, Q6 C) — an opening-scene field or a caption field is the right answer _on repetition_; the trigger is the second time an instant-cue preamble gets copied between clips.

---

## Ground preparation

`refactor-ground` was deliberately skipped (Q7); this section carries its output. Prep commits ride the **same PR** as the feature, as separate commits (Q7's prep-vs-PR decision).

### Ideal shape — data delta first

New data:

```ts
// tools/record/record.ts — module scope, beside RecordOptions (same precedent)
type Take = { kind: 'tour'; id: TourId; beats: BeatRange } | { kind: 'clip'; id: ClipId };
```

```ts
// src/@types/recorder/SkymapRecorderHook.ts — one new verb on the existing seam
readonly startClip: (id: ClipId) => Promise<void>;
```

`RecordOptions` gains `clipId: string | undefined` and `simTime: Date | undefined`.

Renamed (naming-correctness: no half-renames): `recordTour.ts` → `record.ts`, `captureTour` → `captureTake`, `TourStatus` → `TakeStatus`, `window.__recorderTourStatus` → `__recorderTakeStatus`, `defaultOutName({ tourId })` → `defaultOutName({ takeId })`.

Extracted: `frameCapFor(authoredSec, fps)` (the ×1.25 + 10 s margin, currently inlined in `tourFrameCap`), `clipFrameCap(clip, fps)`, `buildCaptureUrl({ base, simTime })`.

Untouched, deliberately: `Clip`, `ClipId`, `clipRegistry`/`clipFactories`, `clipActions`, `watchClipSaga`, `HASH_PARAM_SOURCES`, `installPerfHook`.

### Growth vs bolt-on, per touchpoint

| Touchpoint                                                         | Verdict                                                | Why                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SkymapRecorderHook` (`src/@types/recorder/SkymapRecorderHook.ts`) | **Growth**                                             | The type is already a promise-shaped verb table over the app's play paths. `startClip` is the second row, same shape, no new mechanism.                                                                                                   |
| `installRecorderHook.runTour` (`installRecorderHook.ts:57-76`)     | **Growth, with a surfaced fold candidate** — see below | `runClip` is the same seen-active latch over a different selector/action pair.                                                                                                                                                            |
| `captureTour` (`recordTour.ts:364-516`)                            | **Growth via prep**                                    | ~150 lines of which 3 sites are tour-specific. Parameterizing the subject is the joint the feature needs; bolting a second script on top (Q4 option B) would fork a capture loop whose comments encode hard-won CDP findings.             |
| `tourFrameCap` (`tools/utils/record/tourFrameCap.ts`)              | **Bolt-on if copied**                                  | A second cap function that re-states `×1.25 + 10` is a duplicated constant with two homes. Extract the margin first (P3), then both callers delegate.                                                                                     |
| `defaultOutName`                                                   | **Bolt-on if left alone**                              | `tourId` becomes a lie the moment a clip id is passed through it. Rename the field (P4).                                                                                                                                                  |
| `page.goto(\`${url}/?cinema\`)` (`recordTour.ts:410`)              | **Bolt-on if left alone**                              | String concatenation cannot host a hash; appending `#t=` to it silently mangles a `--url` that carries its own `?`/`#`. Compose it in a tested helper (F3).                                                                               |
| `HASH_PARAM_SOURCES` `t` row                                       | **No change needed**                                   | The row already writes/reads the exact ISO shape the harness composes (`hashParamSources.ts:199`, `:204`), and `parseHashParams` is raw passthrough splitting on the FIRST `=`, so an ISO value with colons round-trips byte-identically. |
| `watchClipSaga`, `clipActions`, `clipRegistry`                     | **No change needed**                                   | `startClip(id)` + `camera.clip` is already the full lifecycle the hook observes.                                                                                                                                                          |

**Surfaced fold candidate (recommend: do NOT fold in this PR).** `runTour` and `runClip` share an identical latch — "subscribe, set `seenActive` on true, resolve on the first false after that" — and an identical-looking single-flight rejection. Folding the latch into a shared `awaitActiveCycle(store, selectActive)` is tempting, but the two _guards_ defend against different failure modes and would need one docstring telling two stories: for tours, a `takeLatest` supersede deliberately skips `tourEnded`, so a later end cannot be attributed to the earlier caller; for clips, a supersede _does_ emit `clipEnded` (via `playClip`'s `[CANCEL]` → `clipPlayer.stop()`, see `src/services/engine/animation/playClip.ts:97-101`), so an overlapping caller would resolve on the handoff instead of never. Twenty lines of duplication with two honest reasons beats one shared helper with a confusing one. **Fold trigger:** a third play path on the seam. Flag this to the user at review if they would rather fold now.

### Prep refactors (P1–P4, own commits, same PR)

1. **P1** — rename `recordTour.ts` → `record.ts`.
2. **P2** — generalize the capture core behind a **one-member** `Take` union. Behaviour-identical; the feature task then _widens_ the union and the compiler points at every branch that must grow.
3. **P3** — extract `frameCapFor(authoredSec, fps)` so the margin formula has one home.
4. **P4** — `defaultOutName({ takeId })`.

---

## Task P1 — Rename `recordTour.ts` → `record.ts`

**Files:** `tools/record/recordTour.ts` → `tools/record/record.ts` (move), `package.json` (modify), plus prose references listed below.

**THE RENAME MUST USE `npm run move-files`.** Do not use `git mv` + hand-edited imports.

- [x] Dry run first:
      `npm run move-files -- --dry tools/record/recordTour.ts tools/record/record.ts`
- [x] Perform it:
      `npm run move-files -- tools/record/recordTour.ts tools/record/record.ts`
- [x] Update the npm script in `package.json`: `"record-tour": "tsx tools/record/record.ts"`.
- [x] `move-files` rewrites relative imports only — it does **not** touch string literals or comments. Grep for stragglers: `grep -rn "recordTour" src tools package.json docs/superpowers/conventions tools/record/README.md`. Known live references to update: `src/@types/recorder/RecorderWindow.ts:9`, `src/state/tour/guidedTourSaga.ts:147`, `tools/record/grantAndAwaitExpiry.ts:4`, `tools/record/virtualTimeSpike.ts:310`, `tools/perf/measurePerf.ts:25,189,220`, and the module header of the moved file itself.
- [x] **Leave `docs/superpowers/plans/completed/` and `docs/superpowers/specs/completed/` alone** — those are shipped artifacts describing what was built then; rewriting them is rewriting history.
- [x] Verify: `npm run typecheck` and `npm test` green; `npm run record-tour -- --help`-style typo smoke is not available, so instead confirm the script resolves: `npx tsx tools/record/record.ts --bogus` prints the unknown-flag error (not a module-not-found).
- [x] Commit.

---

## Task P2 — Generalize the capture core behind a one-member `Take` union

**Files:** `tools/record/record.ts` (modify).

Behaviour-neutral reshape. No new capability, no test changes — the point is that the feature task widens the union and `tsc` then enumerates every branch that must grow.

**Contract:**

```ts
type Take = { kind: 'tour'; id: TourId; beats: BeatRange };
type TakeStatus = { done: boolean; error: string | null };
type RecorderPageWindow = RecorderWindow & { __recorderTakeStatus?: TakeStatus };

async function captureTake(
  browser: Browser,
  options: RecordOptions,
  take: Take,
  frameCap: number,
  writePng: (png: Buffer) => Promise<void>,
): Promise<number>;
```

- [x] Rename `captureTour` → `captureTake`, `TourStatus` → `TakeStatus`, `window.__recorderTourStatus` → `__recorderTakeStatus` (three sites: the kick evaluate at `recordTour.ts:438-456`, the poll at `:483-485`, the vanished-flag error at `:486`).
- [x] Replace the `range: BeatRange` parameter with `take: Take`. The three subject-specific sites become explicit reads off `take`: the kick evaluate's `hook.startTour(take.id, take.beats)`, the settle gate `take.beats.from > 0` (`:466`), and the progress/abort messages.
- [x] `take` is passed into `page.evaluate` as its serializable argument — keep it plain data (no functions, no class instances) so structured-clone across CDP stays trivially safe.
- [x] Generalize the frame-cap abort message (`:491-496`): it currently says "the tour has not ended". Make it name the take (`'${take.kind} ${take.id}' has not ended`) — a clip take stuck on `clipFociReady` must not report itself as a stuck tour.
- [x] `main()` builds the `Take` after the registry lookup and passes it down; the local `range` variable stays only where the beat-slice arithmetic needs it.
- [x] Verify: `npm run typecheck`; `npm test`. Then a real smoke, since the capture core has no unit tests: with `npm run dev` running, `npx tsx tools/record/record.ts demo --size 640x360 --fps 10 --beats 0..0 --out /tmp/p2-smoke.mp4` produces a playable mp4 and the DONE banner.
- [x] Commit.

---

## Task P3 — Extract `frameCapFor(authoredSec, fps)` (TDD-adjacent)

**Files:** `tools/utils/record/frameCapFor.ts` (new), `tools/utils/record/tourFrameCap.ts` (modify), `tests/tools/utils/record/tourFrameCap.test.ts` (unchanged — it is the regression proof).

Verified no existing helper: `tools/utils/record/` holds only `buildFfmpegArgs`, `defaultOutName`, `parseBeatRange`, `parseSize`, `tourFrameCap`.

**Signature:** `frameCapFor(authoredSec: number, fps: number): number`
**Behaviour:** `Math.ceil((authoredSec * 1.25 + 10) * fps)`. The ×1.25 (authored length is a lower bound — real playback burns extra time on `waitUntil` readiness gates and load-dissolve tails) and the +10 s flat margin (sized to the whole take, so a short subject is not starved by a percentage of a small number) move here with their rationale from `tourFrameCap.ts:14-22`.

- [x] Create `frameCapFor.ts` with the formula and the margin rationale (module header ≤ 10 lines).
- [x] `tourFrameCap` keeps the beat-summing (`clipDurationSec` over enter + dwell) and delegates the margin. Its header keeps the caller-slices-first contract and loses the duplicated margin prose (link, don't restate).
- [x] **Add no new test for `frameCapFor`.** The existing `tourFrameCap` test asserts a hand-computed `788` and is not a mirror, so it already proves the delegation end-to-end; a second test of the same arithmetic is a restatement.
- [x] Verify: `npm test -- tourFrameCap` green unchanged; `npm run typecheck`.
- [x] Commit.

---

## Task P4 — `defaultOutName({ takeId })`

**Files:** `tools/utils/record/defaultOutName.ts` (modify), `tests/tools/utils/record/defaultOutName.test.ts` (modify), `tools/record/record.ts` (modify).

**Signature:** `defaultOutName(opts: { takeId: string; width: number; height: number; fps: number; now: Date }): string` — output format unchanged (`recordings/<takeId>-<w>x<h>-<fps>fps-<YYYYMMDD-HHMMSS>.mp4`).

- [x] Rename the field and update the module header (the timestamp rationale stays; `tourId`'s name is the only lie).
- [x] Update the two existing tests' call sites only — their asserted strings do not change.
- [x] Update the caller at `record.ts` (`recordTour.ts:589-597`).
- [x] Verify: `npm test -- defaultOutName`; `npm run typecheck`.
- [x] Commit.

---

## Task F1 — `startClip` on the recorder seam (TDD)

**Files:** `src/@types/recorder/SkymapRecorderHook.ts` (modify), `src/state/recorder/installRecorderHook.ts` (modify), `tests/state/recorder/installRecorderHook.test.ts` (modify).

**Contract:**

```ts
// SkymapRecorderHook — added beside startTour
/**
 * Plays one standalone clip; resolves when the clip ends. Single-flight:
 * rejects if a clip is already active.
 */
readonly startClip: (id: ClipId) => Promise<void>;
```

`installRecorderHook` gains a `runClip(store, id)` mirroring `runTour` (`installRecorderHook.ts:57-76`): reject up front when `selectClipActive(store.getState())` (`src/state/camera/selectors.ts:63`), else subscribe with a `seenActive` latch on `selectClipActive` and dispatch `startClip(id)` from `src/state/camera/clipActions.ts:26`.

**The latch must tolerate a delayed activation, and that is the load-bearing property.** `watchClipSaga` blocks on `waitUntil(clipFociReady(...) && cameraRuntime() !== null)` _before_ the clip becomes active (`src/state/camera/watchClipSaga.ts:105-112`), so `camera.clip` stays `null` across an unbounded number of store updates after `startClip` dispatches — catalog pulses, load-progress updates, tier swaps. A latch that resolved on any inactive reading would resolve instantly and the harness would film zero frames.

**Tests** (add to the existing suite; it already mocks `isCinemaMode` and builds a real `rootReducer` store with a recording middleware):

- `startClip dispatches clip/start and resolves when the clip ends` — assert the dispatched action's `payload` is the `ClipId` (the action is `createAction('clip/start', (id) => ({ payload: id }))`, so the payload is the bare id, **not** an object); then `store.dispatch(clipStarted(clipData))` must not settle it, and `store.dispatch(clipEnded())` must. Use the minimal fixture `const clipData: ClipData = { timeline: [] }` (precedent: `tests/state/camera/selectors.test.ts:41`); `clipStarted`/`clipEnded` come from `src/state/camera/cameraSlice`.
- `startClip does not resolve on store updates before the clip becomes active` — dispatch an unrelated store change (e.g. `engineLoadProgressChanged({...})`, already imported by this suite) after `startClip` and before any `clipStarted`; assert not settled. This is the foci-wait case above; it fails on exactly the latch bug that "resolve on the first inactive reading" would introduce.
- `startClip rejects when a clip is already active` — seed `clipStarted(clipData)`, then assert the rejection message and that **no** superseding `clip/start` was dispatched (count actions before/after, same shape as the existing `startTour` rejection test).

- [x] Write the three failing tests.
- [x] Add `startClip` to `SkymapRecorderHook` with its docstring; add `runClip` + the hook field in `installRecorderHook`.
- [x] Extend the installer's module header with the clip single-flight reason **and note it differs from the tour's**: a superseding `startClip` _does_ emit `clipEnded` through `playClip`'s `[CANCEL]` hook, so the danger is resolving on the handoff rather than never resolving. Keep it inside the comment budget.
- [x] Leave the existing "exposes the hook in cinema mode" test alone — do **not** add a `typeof hook.startClip === 'function'` assertion; `tsc` already proves that (no runtime type tests).
- [x] Verify: `npm test -- installRecorderHook`; `npm run typecheck`.
- [x] Commit.

---

## Task F2 — `clipFrameCap(clip, fps)` (TDD)

**Files:** `tools/utils/record/clipFrameCap.ts` (new), `tests/tools/utils/record/clipFrameCap.test.ts` (new).

**Signature:** `clipFrameCap(clip: ClipData, fps: number): number`
**Behaviour:** `frameCapFor(clipDurationSec(clip), fps)` — the compiled clip length (`tools/utils/animation/clipDurationSec.ts`, which stubs id-bearing cues duration-neutrally first) under the shared margin from P3.

Why the same ×1.25 + 10 s shape holds for a single clip: the padding's job is the readiness gates a static compile cannot see, and a clip take has one big one — `watchClipSaga`'s `waitUntil(clipFociReady && cameraRuntime)`, which for `famousFlythrough` / `flyPathDemo` waits on catalog focus resolution. The +10 s flat term is generous relative to a ~10–30 s clip (a 12 s clip gets a 25 s budget), which is the right direction: the cap is a runaway guard, not a schedule.

**Test:** `clipFrameCap pads the compiled clip duration by the shared margin` — build a fixture `ClipData` with a single `hold(8)` (from `src/services/engine/animation/effectHelpers.ts:279`) and assert `clipFrameCap(fixture, 30) === 600`, hand-computed as `ceil((8 × 1.25 + 10) × 30) = ceil(600)`. Do not re-derive the expectation with `frameCapFor`.

- [x] Write the failing test.
- [x] Implement; module header states the runaway-guard purpose and links `frameCapFor` for the margin (do not restate the margin rationale — comment budget).
- [x] Verify: `npm test -- clipFrameCap`; `npm run typecheck`.
- [x] Commit.

---

## Task F3 — `buildCaptureUrl({ base, simTime })` (TDD)

**Files:** `tools/utils/record/buildCaptureUrl.ts` (new), `tests/tools/utils/record/buildCaptureUrl.test.ts` (new).

Verified no existing helper composes the capture URL — `record.ts` concatenates it inline at `recordTour.ts:409-410`.

**Signature:** `buildCaptureUrl(opts: { base: string; simTime: Date }): string`
**Behaviour:** returns `` `${base}/?cinema#t=${simTime.toISOString()}` ``. Throws when `base` contains `?` or `#`.

The throw is the point (landmine 1's URL half). Today `--url` is only stripped of a trailing slash; with a hash appended, a `--url http://host/#t=X` would compose `http://host/#t=X/?cinema#t=Y` and the pin the operator asked for would silently lose to the harness's. The harness owns both the query gate and the hash now, so a `--url` carrying either is an operator error worth failing loudly on.

`toISOString()` is the exact serialization the `t` row writes (`hashParamSources.ts:199`), and `parseHashParams` splits on the FIRST `=` with no decoding — so the composed hash is byte-identical to what the app itself would publish, and `writeHashBody`'s compare-and-skip means the boot read pushes no history entry.

**Tests:**

- `buildCaptureUrl composes the cinema gate and the pinned instant` — `{ base: 'http://localhost:5173', simTime: new Date(Date.UTC(2026, 6, 31, 12, 0, 0)) }` → `'http://localhost:5173/?cinema#t=2026-07-31T12:00:00.000Z'`.
- `buildCaptureUrl rejects a base carrying its own query or hash` — both `'http://localhost:5173/?cinema'` and `'http://localhost:5173#t=x'` throw, with a message naming `--url`.

- [x] Write the failing tests.
- [x] Implement.
- [x] Verify: `npm test -- buildCaptureUrl`; `npm run typecheck`.
- [x] Commit.

---

## Task F4 — Harness: `--clip`, `--sim-time`, and the widened `Take`

**Files:** `tools/record/record.ts` (modify).

The union widens; `tsc` then names every site that must grow. No unit tests (the harness's argv loop and capture core are untested by design — see the note at the end of this task); the verification is a real take.

**Contract:**

```ts
type Take = { kind: 'tour'; id: TourId; beats: BeatRange } | { kind: 'clip'; id: ClipId };

type RecordOptions = {
  tourId: string;
  clipId: string | undefined; // --clip
  beats: BeatRange | undefined;
  fps: number;
  size: { width: number; height: number };
  dpr: number;
  out: string | undefined;
  url: string;
  /** --sim-time override; absent = resolved at take start (always pinned). */
  simTime: Date | undefined;
};
```

- [x] **argv.** Add `--clip <id>` and `--sim-time <ISO>` to the value-taking flag list and to the unknown-flag error's "known:" list. `--sim-time` validates inline like `--fps` does: `Date.parse` → throw on `NaN` naming the expected ISO 8601 shape. Two mutual-exclusion errors, both in `parseArgs`:
  - an explicit positional tour id **and** `--clip` → "a take is either a tour or a clip, not both".
  - `--beats` **and** `--clip` → "--beats windows a tour take; a clip take is played whole".
- [x] **Take resolution in `main()`.** When `clipId` is set: look it up in `clipRegistry` (`src/data/animation/clips/clipRegistry.ts:85`); unknown id throws listing `Object.keys(clipRegistry)`, mirroring the tour lookup's error at `recordTour.ts:565-569`. `frameCap = clipFrameCap(clip.data, options.fps)`. Use the `clipRegistry` snapshot (factories resolved at J2000), not `clipFactories[id](...)`: only the _start pose_ depends on the instant (`src/data/animation/clips/earthFlyout.ts:68-69`), the authored durations do not, so the cap is instant-independent.
- [x] **Sim-time pin, always.** `const simTime = options.simTime ?? new Date()`, resolved once in `main()` before anything spawns, and used for both the goto URL and the banner. This applies to **tour takes too** — that is Q3's decision, and it is a deliberate behaviour change for existing tour takes: they previously ran on a live clock and now run manual + paused at the pinned instant (`manualPausedAtActions`, reached through the `t` row's `read`). The grand tour's beats are cosmic-scale, so nothing visibly moves; a solar-system beat added later would now be frozen, which is the intended property.
- [x] **URL.** Replace the inline concatenation with `buildCaptureUrl({ base: options.url, simTime })`, and log the composed URL verbatim so the banner and the `loading …` line agree.
- [x] **Kick evaluate.** One branch inside the evaluate, everything else shared:
      `const p = take.kind === 'tour' ? hook.startTour(take.id, take.beats) : hook.startClip(take.id);`
      then the existing `.then/.catch` writes to `__recorderTakeStatus`. Keep the payload plain data.
- [x] **Settle gate.** `FOLD_SETTLE_MS` burns only for `take.kind === 'tour' && take.beats.from > 0`. Add one comment line stating that a clip take has no analogous settle **and why** (landmine 2) — pointing at the README's authoring rule rather than restating it.
- [x] **Out name.** `defaultOutName({ takeId: take.id, … })` — clip takes land at `recordings/<clipId>-<size>-<fps>fps-<stamp>.mp4`.
- [x] **Banner.** Print, for a clip take, the clip id + `label`, the resolved size/fps/viewport line unchanged, and a new line for the pin — `sim time pinned: <ISO>  (re-take with --sim-time <ISO>)`. Printing the copy-paste re-take flag is the whole point of Q3's Option A.
- [x] Update the module header: the second usage line (`npm run record-clip -- flyout`), the `Take` union in the "why a harness outside the app" framing, and the sim/frame clock distinction (landmine 1) in one or two lines. Header stays ≤ 10 lines of _new_ material; move anything longer to the README.
- [x] Verify (no unit tests — see below): with `npm run dev` running,
      `npx tsx tools/record/record.ts --clip flyout --size 640x360 --fps 10 --out /tmp/f4-clip.mp4`
      produces a playable mp4 whose ffprobe line reports 640x360 and a nonzero frame count, and the banner shows the pinned instant. Then `npx tsx tools/record/record.ts demo --beats 0..0 --size 640x360 --fps 10 --out /tmp/f4-tour.mp4` still works.
- [x] `npm run typecheck`; `npm test` (nothing should have moved).
- [x] Commit.

**Why `parseArgs` stays unexported and untested:** it has never been exported or tested, and the two new validations fail loudly on the operator's own terminal within milliseconds. Exporting it solely to unit-test flag rejection would add test surface that mostly mirrors the argv loop's structure; the value-shaped logic that _can_ silently produce a wrong film (URL composition, frame cap, out name) lives in the tested helpers F2/F3/P3/P4 instead. If a future task grows a third mutually-exclusive flag, revisit — that is the point at which a `resolveTake` helper earns its test.

---

## Task F5 — npm scripts + docs

**Files:** `package.json` (modify), `tools/record/README.md` (modify).

- [x] Scripts: `"record-tour": "tsx tools/record/record.ts"` (kept working — docs and muscle memory point at it, Q4's sub-decision) and `"record-clip": "tsx tools/record/record.ts --clip"`. The trailing `--clip` means `npm run record-clip -- flyout --fps 30` expands to `… record.ts --clip flyout --fps 30`; `npm run record-clip` with no argument fails with the flag's own "requires a value" error, which is a clear enough prompt.
- [x] README — retitle from "Tour recorder" to cover both subjects; keep every existing section (prerequisites, dpr/pixel contract, how long a take takes, the spike, the cold-cache note) intact. Add:
  - a **Clip takes** section: `npm run record-clip -- flyout`, where clip ids come from (`src/@types/animation/ClipId.ts` / `clipRegistry`), that the six standalone ids are the interesting ones (the `tourXxx` ids are grand-tour beats and are better filmed as a tour window), and that a clip take is played whole (`--beats` is a tour-only flag).
  - a **Reproducibility** subsection: every take pins the sim clock via `#t=<ISO>`; the banner prints the instant; `--sim-time <ISO>` re-takes it exactly. State landmine 1 in one sentence — the pin is the _sim_ clock, the CDP budget is the _frame_ clock, and a reproducible take needs both.
  - a **Frame 0 and scene dressing** subsection: landmine 2 verbatim in operator terms — the film opens on whatever `?cinema` booted into; dressing a clip is done with instant `scene()`/`show()`/`hide()` cues placed ahead of any lead-in `wait` on the clip's own timeline; `cosmicFlows` shows the cue shape but lands its cues 2 s in, behind its own lead-in `wait(2)`, so it is a counter-example for literal frame 0, not the worked example; there is deliberately no `--settle` for clips, because the virtual time it would burn is the clip's opening.
  - a flag-table row for `--clip` and `--sim-time`, and a note that `--url` must carry no query or hash.
- [x] Verify: `npm run format` on the two touched files; re-read the README top to bottom for LLM tells and for claims that are now false.
- [x] Commit.

---

## Task F6 — Verification take (no code)

**Files:** none. Do not commit any mp4 (`recordings/` is gitignored; write to `/tmp`).

- [x] With `npm run dev` running in this worktree, record `flyout` at low res: `npm run record-clip -- flyout --size 960x540 --fps 24 --out /tmp/clip-flyout.mp4`. Note the pinned instant from the banner.
- [x] Re-take with the printed instant: `npm run record-clip -- flyout --size 960x540 --fps 24 --sim-time <ISO> --out /tmp/clip-flyout-2.mp4`. The two ffprobe frame counts must match. (Pixel-level comparison is the standing job of `npm run spike-virtual-time`, not this task.)
- [x] Record `earthFlyout` — the one instant-dependent clip — twice with the same `--sim-time`, and confirm the opening frame shows the same Earth. This is the take the pin exists for.
- [x] Record one `cosmicFlows` take and confirm it shows the boot scene for its ~2 s lead-in `wait`, then the dressing (flow field mask, cosmic-web layers hidden) lands the instant the cues fire at t=2s — demonstrating that cue POSITION on the timeline, not just instant `over: 0`, determines what frame 0 shows.
- [x] Confirm `npm run record-tour -- demo --beats 0..0 --size 640x360 --fps 10 --out /tmp/tour-smoke.mp4` still works end to end.
- [x] Report the frame counts, the mp4 sizes, and anything surprising in the banner. **User visual pass:** ask the user to watch `/tmp/clip-flyout.mp4` and `/tmp/clip-earthflyout.mp4` before the PR is marked ready — nothing in this plan can tell whether a take _looks_ right.
- [x] Run the `/feature-done` audit **before** merging; it gates the DoD then relocates this plan to `plans/completed/`.

---

## Definition of Done

### Deliverable inventory

- [x] `tools/record/record.ts` is the single entry point; no `recordTour.ts` remains, and no `recordTour` string survives in `src/`, `tools/`, `package.json` or the README (shipped artifacts under `*/completed/` excepted).
- [x] `SkymapRecorderHook.startClip(id: ClipId): Promise<void>` exists on the seam and is installed by `installRecorderHook`, single-flight against `selectClipActive`.
- [x] New helpers, one exported symbol each with a mirrored test where the plan calls for one: `tools/utils/record/frameCapFor.ts`, `clipFrameCap.ts`, `buildCaptureUrl.ts`. `tourFrameCap` delegates the margin to `frameCapFor` rather than restating it.
- [x] `defaultOutName` takes `takeId`; no caller or test still passes `tourId`.
- [x] `RecordOptions` carries `clipId` and `simTime`; `--clip <id>` and `--sim-time <ISO>` are in the value-taking flag list and in the unknown-flag error's "known:" list.
- [x] `package.json` has `record-clip` and a still-working `record-tour`, both pointing at `record.ts`.
- [x] `tools/record/README.md` covers both subjects and carries the three new sections — Clip takes, Reproducibility, Frame 0 and scene dressing — plus flag-table rows for `--clip` and `--sim-time` and the "`--url` carries no query or hash" note.

### Named observable behaviours (manual smoke)

- [x] `npm run record-clip -- flyout --size 960x540 --fps 24` produces a playable mp4 whose ffprobe line reports 960x540 and a nonzero frame count.
- [x] The banner prints `sim time pinned: <ISO>` with the copy-paste `--sim-time` re-take flag; re-taking with that ISO yields a matching frame count.
- [x] Two `earthFlyout` takes at the same `--sim-time` open on the same Earth.
- [x] A `cosmicFlows` take shows the boot scene through its ~2 s lead-in `wait`, then dresses the instant its cues fire at t=2s — cue position, not just `over: 0`, determines what frame 0 shows.
- [x] A clip take lands at `recordings/<clipId>-<w>x<h>-<fps>fps-<stamp>.mp4` when `--out` is omitted.
- [x] Loud failures: a positional tour id together with `--clip`; `--beats` together with `--clip`; a `--url` carrying `?` or `#`; an unknown clip id, whose error lists the registry keys.
- [x] `npm run record-tour -- demo --beats 0..0 --size 640x360 --fps 10` still works end to end.
- [x] The user has watched a `flyout` and an `earthFlyout` take.

### Deferral boundary

Decided against in the grill; a reviewer must not chase these.

- Captions or title cards for clip takes (Q6 A) — titles go in post.
- A `--settle` flag (Q5 B).
- A harness-side scene-preset registry or `--scene` (Q2 B).
- Any change to the `Clip` type — no opening-scene field, no caption field (Q5 C, Q6 C).
- Pixel-level determinism between two takes. Frame counts must match; comparing pixels is `npm run spike-virtual-time`'s standing job.

## Completion note

Shipped on branch `worktree-record-clips-to-mp4`, PR #534. Verified: `flyout` films 529 frames at 960x540/24 (its authored 22.0 s), a re-take at the printed `--sim-time` matches frame counts, `demo` beat 0 still yields the same 131 frames it did before the change, and all four flag/id rejections fire.

Outstanding: the user's visual pass, and an intermittent `earthFlyout` virtual-time stall (`docs/backlog/2026-07-31-earthflyout-virtual-time-stall.md`). Not a regression — `grantAndAwaitExpiry` is untouched; the clip path merely made that clip reachable by the recorder for the first time.
