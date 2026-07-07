# Tour recorder — Playwright + CDP virtual time + ffmpeg

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-07-tour-recorder-design.md` (source of truth for every decision below)

**Goal:** Record the grand tour deterministically, frame by frame, at 3840×2160 / 60 fps into an H.264 mp4 — via a Node harness under `tools/record/` that drives the *unmodified* app in headless Chromium with CDP virtual time and pipes screenshots into ffmpeg. The in-repo app surface is exactly three things: a `?cinema` URL mode, a `window.__skymapRecorder` hook, and beat-range support in the tour saga.

**Architecture:** The harness launches Playwright Chromium (the e2e suite's known-good headless setup), boots the app in real time behind `?cinema`, awaits the recorder hook's `ready`, then engages `Emulation.setVirtualTimePolicy('pauseIfNetworkFetchesPending')` and steps the whole browser clock in 1000/fps ms grants — screenshotting after each grant into a spawned ffmpeg's stdin. The tour runs itself (`startTour` → `guidedTourSaga`; the dwell timeout auto-advances); the hook's returned promise is the stop signal, with a precomputed frame cap (from the `tour-length` machinery) as runaway guard. Everything clock-shaped in the app (`startLoop`, sagas' `Date.now()`/`delay()`, load-fade stamps) is virtualized by the browser — **no app-side clock changes**.

**Tech Stack:** TypeScript (tsx-run Node scripts), Playwright (`@playwright/test` 1.59.1, already a devDependency), Chrome DevTools Protocol (`Emulation` domain), ffmpeg (host prerequisite), ffprobe, Vitest, React Testing Library, redux-saga.

## Global Constraints

Pulled from the spec's Decisions table — these are the contract, not defaults to revisit:

- **Resolution:** 3840×2160 default (`--size`), viewport at `deviceScaleFactor: 1`.
- **Frame rate:** 60 fps default (`--fps`); per-frame virtual-time budget = 1000/fps ms.
- **Codec:** `libx264 -crf 16 -preset slow -pix_fmt yuv420p`, mp4 container, no audio.
- **ffmpeg is a host prerequisite** (`brew install ffmpeg`), never an npm dependency.
- **Output:** `recordings/grand-tour-4k60.mp4` default; `recordings/` is gitignored (Task 6).
- **Cinema mode is captions-only:** canvas + `TourOverlayContainer` and nothing else from the HUD.
- **Determinism bar:** two takes visually identical frame-for-frame; byte-identical NOT promised (GPU float wiggle) — every comparison in this plan is perceptual/near-equal, never byte-equal.

House rules (repeat in every dispatch):

- `type` aliases, never `interface`. One exported symbol per file in `tools/utils/` and `src/utils/`; one type per file in `src/@types/` (filename = symbol).
- Didactic module headers: why + what the alternative was. No history narration.
- Deep relative imports, no barrels.
- Tests mirror the src/tools tree; `npm test` and `npm run typecheck` (both tsconfigs) green at every task boundary.
- Search before writing helpers — each new helper below is annotated "verified no existing helper" or "reuse X"; re-verify at implementation time.
- Commit per task; stage specific paths, never `git add -A`; prettier only on touched files.
- Tasks 2–6 are TDD (test first). Task 1 is an exploratory spike (explicitly not TDD). **Tasks 4 and 6 are GATED on Task 1's go verdict.**

---

## Task 1 — SPIKE: virtual time × WebGPU presentation (GATE)

**Files:** `tools/record/virtualTimeSpike.ts` (new), `package.json` (add `"spike-virtual-time": "tsx tools/record/virtualTimeSpike.ts"`), spec Risks section (append verdict note).

**The unknown (spec "Risks and the spike gate"):** does each virtual-time budget grant reliably fire rAF → `runFrame` → submit → present *before* `page.screenshot()` composites? Headless WebGPU + screenshots is proven (`tests/e2e/cf4-density-volume.spec.ts`); virtual time + canvas stepping is proven (timecut-class tools); the combination on this app is not.

**Launch pattern (reuse, don't invent):** the e2e suite runs default Playwright headless Chromium with **no custom flags** — `playwright.config.ts:32-41` documents that the bundled Chromium has WebGPU enabled by default, dev server assumed on `:5173`. The spike does the same via `chromium.launch()` from `@playwright/test`, viewport 640×360, `deviceScaleFactor: 1`.

**Motion without the tour (researched):** auto-rotate boots OFF (`DEFAULT_AUTO_ROTATE = false`, `src/data/defaults.ts:76`), and the splash blocks a fresh profile. Two known levers, zero app changes:

- load `/?tour=x` — the `tour` query key is a deep-link that suppresses the splash (`src/utils/url/hasDeepLink.ts:39-54`; it does NOT auto-start anything);
- click the top-bar pill `getByRole('button', { name: 'Start camera auto-rotate' })` (`src/components/AutoRotateToggle/AutoRotateToggle.tsx:22`) — auto-rotate keeps the render scheduler awake every frame.

**Procedure:**

- [ ] Write `virtualTimeSpike.ts`: launch → goto `http://localhost:5173/?tour=x` → wait for boot in real time (networkidle + the engine-ready console log, per the e2e spec's pattern at `tests/e2e/cf4-density-volume.spec.ts:34-49`) → click the auto-rotate pill → open a CDP session (`page.context().newCDPSession(page)`) → `Emulation.setVirtualTimePolicy({ policy: 'pause' })` then step ~120 iterations: grant `{ policy: 'pauseIfNetworkFetchesPending', budget: 1000/60 }`, await the `Emulation.virtualTimeBudgetExpired` event, `page.screenshot({ type: 'png' })` to the OS tmpdir.
- [ ] Assertion (a) — **motion**: consecutive screenshots differ. Decode with `sharp` (already a devDependency — verified no existing image-diff helper under `tools/utils/image/`) and compute mean absolute pixel difference; assert > a small noise floor for most consecutive pairs.
- [ ] Assertion (b) — **determinism**: run the 120-frame loop twice in fresh pages; frame N of run 1 vs frame N of run 2 must be *near-equal* (mean abs diff below a tight threshold). NOT byte-equal — GPU floats wiggle.
- [ ] If (a) fails (frozen/blank frames): try the spec's named fallbacks **in order** and record which one was needed: (1) an extra zero-work budget grant before each screenshot (present-lag absorption); (2) note that an explicit per-frame present handshake must be added to the Task 4 hook — do not build it in the spike.
- [ ] Eyeball a handful of PNGs: captions/DOM text rasterization looks sane headless (secondary risk in the spec).
- [ ] Add the npm script; leave the spike in the repo (it is the standing diagnostic for this pipeline).
- [ ] **Deliverable:** go/no-go + which fallback (if any) in the commit message, AND a short note appended to the spec's "Risks and the spike gate" section. On no-go with both fallbacks dead: STOP the plan and escalate.
- [ ] Commit.

---

## Task 2 — Pure CLI/plan helpers (TDD)

**Files:** `tools/utils/record/parseBeatRange.ts`, `tools/utils/record/parseSize.ts`, `tools/utils/record/buildFfmpegArgs.ts`, `tools/utils/record/tourFrameCap.ts` (all new, one symbol per file); tests in `tests/tools/utils/record/*.test.ts` (mirroring the existing `tests/tools/utils/animation/clipDurationSec.test.ts` placement).

All four verified against existing code: `tools/utils/cli/args.ts` is deliberately bool-only (its header, lines 4-9, says string-valued flags stay bespoke), and nothing under `tools/utils/` parses ranges/sizes or builds ffmpeg argv.

**Signatures (contract):**

```ts
export function parseBeatRange(raw: string): { from: number; to: number };
export function parseSize(raw: string): { width: number; height: number };
export function buildFfmpegArgs(opts: { fps: number; out: string }): string[];
export function tourFrameCap(beats: readonly BeatData[], fps: number): number;
```

**Behaviour:**

- `parseBeatRange`: `'4..6'` → `{ from: 4, to: 6 }`; single `'4'` → `{ from: 4, to: 4 }`. Indices are **0-based, matching the `#` column `npm run tour-length` prints** (`tools/animation/tourLength.ts:28-35`) — the README (Task 7) states this. Throws (with the offending input in the message) on: reversed range (`'6..4'`), negatives, non-integers, empty/garbage.
- `parseSize`: `'3840x2160'` → `{ width: 3840, height: 2160 }`; throws on zero/negative dimensions or malformed input (separator is a literal lowercase `x`).
- `buildFfmpegArgs`: returns exactly `['-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-y', out]` — the Global Constraints codec line as argv. Test asserts the full array.
- `tourFrameCap`: authored seconds = Σ over `beats` of `(beat.enterClip ? clipDurationSec(beat.enterClip) : 0) + clipDurationSec(beat.dwellClip)` — the exact per-beat sum `tools/animation/tourLength.ts:29-31` uses, via the existing `tools/utils/animation/clipDurationSec.ts` + its `stubResolveClipFoci` machinery (reuse, do not reimplement). Frame cap formula, exactly: `Math.ceil((authoredSec * 1.25 + 10) * fps)` — 25% headroom for `waitUntil` readiness gates + load-dissolve tails, plus 10 flat virtual seconds so short single-beat takes aren't starved. The caller slices the beat array to the requested range first; this function is range-agnostic.

**Steps:**

- [ ] Tests first, per file. Names: `parseBeatRange parses 'a..b' inclusive`, `parseBeatRange parses a single index as a one-beat range`, `parseBeatRange throws on reversed, negative, and malformed input`; `parseSize parses WxH`, `parseSize throws on malformed or non-positive input`; `buildFfmpegArgs emits the pinned libx264 image2pipe argv`; `tourFrameCap sums enter+dwell over the beats and applies the margin formula` (fixture: narration clips + `dwellDrift(n)` beats, as `tests/state/tour/guidedTourSaga.test.ts:66-69,134-140` builds them — assert against the formula evaluated on the same fixture).
- [ ] Implement each (bodies from the tests, not from this plan).
- [ ] `npm test -- record` green; `npm run typecheck` green (tools config picks the new files up).
- [ ] Commit.

---

## Task 3 — Cinema mode (`?cinema`)

**Files:** `src/utils/url/isCinemaMode.ts` (new), `src/components/App/App.tsx` (modify), `src/state/ui/buildInitialUiState.ts` (modify), `tests/utils/url/isCinemaMode.test.ts` (new), `tests/components/App/App.cinema.test.tsx` (new), `tests/state/uiState/…` (extend the existing buildInitialUiState coverage if present — check `tests/state/` before adding a new file).

**The seam:** `hasUrlGate` (`src/utils/url/hasUrlGate.ts:35-42`) is the existing URL-param util — REUSE it. Cinema is a bare-presence flag, exactly its shape. One new one-symbol wrapper so three call sites share one name:

```ts
export function isCinemaMode(): boolean; // = hasUrlGate('cinema')
```

**Behaviour (spec "App changes" §1):** with `?cinema`, App renders **only** the canvas and `{tourActive && <TourOverlayContainer />}` (same conditional mount as today, `App.tsx:252`). Not mounted: StatusBar, ScaleBar, InfoCard, LoadingBar, NavigationPanel, HomeButton, SearchTrigger, AboutPill, AutoRotateToggle, CommandPalette, DebugPanel, Splash, and the `?tour` debug pill. Splash/first-interaction gating is skipped so the page is capture-ready on load: add cinema as gate 0 in `buildInitialUiState` (`src/state/ui/buildInitialUiState.ts:32-44`) forcing `splashVisible = false`.

Follow the `TOUR_DEBUG_GATE` precedent (`App.tsx:73-74`) for reading the flag once at module scope — but note the testing consequence: a module-scope const can't be flipped per-test, so the App test mocks `isCinemaMode` via `vi.mock` (or the implementer reads it inside the component; either is acceptable, pick one and say why in the module header).

**Steps:**

- [ ] `isCinemaMode` test (mirror `tests/utils/url/hasUrlGate.test.ts`): returns true iff `?cinema` present. Implement.
- [ ] App component test — RTL over the real store `Provider`, `useEngine` (and any other GPU-touching hook) mocked with typed `vi.fn` (see `tests/components/InfoCard/InfoCard.mobile.test.tsx` for the RTL + `.tsx` pattern; there is no existing App-level test — this is the first, keep the mock surface minimal). Test names: `cinema mode mounts only the canvas (no HUD chrome)` — asserts the canvas is present and StatusBar/ScaleBar/SearchTrigger/AboutPill/NavigationPanel queries all come back empty; `cinema mode mounts TourOverlayContainer while a tour is active` — dispatch `tourStarted` on the store, assert the overlay root appears; `normal mode still mounts the HUD` — regression guard.
- [ ] Implement: early-return branch in `App.tsx` (cinema JSX is a strict subset — do NOT duplicate the full tree; hooks that must still run in cinema mode — `useEngine`, `useUrlSync` — stay above the branch), plus the `buildInitialUiState` gate with its test.
- [ ] `npm test` + `npm run typecheck` green. Manual check note for the main session: `http://localhost:5173/?cinema&tour=x` shows a bare canvas.
- [ ] Commit.

---

## Task 4 — Recorder hook (`window.__skymapRecorder`) — GATED on Task 1

**Files:** `src/@types/recorder/SkymapRecorderHook.ts` (new), `src/@types/animation/tour/BeatRange.ts` (new — also consumed by Task 5), `src/state/recorder/installRecorderHook.ts` (new), `src/main.tsx` (modify: call the installer after store construction), `tests/state/recorder/installRecorderHook.test.ts` (new).

**Types (one per file, house rule):**

```ts
export type BeatRange = { readonly from: number; readonly to: number };

export type SkymapRecorderHook = {
  readonly ready: Promise<void>;
  readonly startTour: (id: TourId, beats?: BeatRange) => Promise<void>;
};
```

**Behaviour (spec "App changes" §2):**

- `installRecorderHook(store: AppStore): void` (`AppStore` from `src/store/types.ts:53`). **Gating lives inside the installer**: it no-ops unless `isCinemaMode()` — that makes the gate unit-testable and keeps `main.tsx`'s call unconditional (one line, no branch to forget).
- `ready` resolves when the engine is running and registered loading slots have settled. Both facts are already in the Redux engine slice — `selectEngineStatus` / `selectLoadProgress` (`src/state/engine/selectors.ts:36,48-49`), fed by the load-progress aggregator (`src/services/engine/subsystems/loadProgressAggregator.ts` — note its "null when empty" convention). Predicate: `status.kind === 'ready' && loadProgress === null`. **Caveat the implementer must handle:** `loadProgress` is *also* null before the first slot starts, so the predicate can be momentarily true mid-bootstrap; `ready` must resolve only once the predicate has held stably (e.g. persisted across a ~1 s real-time window via `store.subscribe` + timer — boot runs in real time, so over-waiting costs nothing). State the chosen mechanism in the module header.
- `startTour(id, beats?)` dispatches the existing `startTour` action (`src/state/tour/tourActions.ts:33`; Task 5 widens its payload) and resolves on the tour-ended signal. **No new action needed — verified:** `tourSlice.tourEnded` / `tour.active` (`src/state/tour/tourSlice.ts:64-71`, `selectTourActive`) is the observable; `guidedTourSaga`'s finally emits it on natural completion and exit (`src/state/tour/guidedTourSaga.ts:125-140`). Resolve by observing `tour.active` transition true → false via `store.subscribe`.
- The hook is the harness's **single seam** — the harness never reaches into the store from `page.evaluate`.

**Steps:**

- [ ] Tests first (real `rootReducer` store, the `buildStore` pattern of `tests/state/tour/guidedTourSaga.test.ts:73-97`; mock `isCinemaMode`): `installRecorderHook is a no-op outside cinema mode` (no `window.__skymapRecorder`); `installRecorderHook exposes the hook in cinema mode`; `ready resolves once the engine is ready and load progress has settled` (dispatch the engine-slice actions to walk the predicate true, assert the promise settles — and a companion assertion that a momentary flicker does NOT resolve it, per the stability caveat); `startTour dispatches tour/start and resolves when the tour ends` (assert the dispatched action's payload carries `id` + `beats`; drive `tourStarted` → `tourEnded` on the store, await the promise).
- [ ] Implement the two type files + installer; wire the one-line call in `main.tsx` (after `createAppStore`, near `persistSplashVersion(store)` — `src/main.tsx:88-94`).
- [ ] If Task 1's verdict required the present-handshake fallback: extend the hook type + installer accordingly (the spike's ledger note is the contract) — otherwise skip.
- [ ] `npm test` + `npm run typecheck` green. Commit.

---

## Task 5 — Beat ranges in the tour saga

**Files:** `src/state/tour/tourActions.ts` (modify `startTour`), `src/state/tour/watchTourSaga.ts` (modify: thread the range), `src/state/tour/guidedTourSaga.ts` (modify the beat loop), `tests/state/tour/guidedTourSaga.test.ts` + `tests/state/tour/watchTourSaga.test.ts` (extend).

**Contract:**

- `startTour(id: TourId, beats?: BeatRange)` — payload `{ id, beats? }`, still fully serializable. Existing call sites pass only `id` and stay untouched.
- `watchTourSaga` (`src/state/tour/watchTourSaga.ts:18-23`) passes the range through: `guidedTourSaga(tour, action.payload.beats)`.
- `guidedTourSaga`'s run arm (`src/state/tour/guidedTourSaga.ts:104-120` — verified: `let i = 0; while (i < tour.beats.length)`) runs `i` from `range.from` to `range.to` **inclusive**, in *global* beat indices. Default (no range) = full tour — behaviour identical to today.
- **Out-of-range CLAMPS** (not errors) to `[0, beats.length - 1]`; an authoring change that shortens the tour must not brick a saved recording command. `prevBeat` clamps at `range.from` (mirror of today's `Math.max(0, i - 1)`).
- **Free correctness note for the implementer:** the loop's scene fold `computeSceneEntering(baseline, tour.beats, i)` already takes global `i`, so a `from: 4` take re-establishes the scene as if beats 0–3 had played (guidedTourSaga.ts:108-112 + module header "Every beat entry reconstructs its derived scene"). Range support must NOT slice the beats array — index into it — or the fold breaks. Also fine as-is: `tourStarted` resets `beatIndex` to 0 and the first `beatChanged(from)` corrects it (`tourSlice.ts:45-55`).

**Steps:**

- [ ] Extend `tests/state/tour/guidedTourSaga.test.ts` (its narration-clip + `dwellDrift(0.001)` + fake-timers idiom, lines 109-215): `plays only the beats inside a given range` (3-beat tour, `{from:1,to:1}` → exactly one fly for beat 1 — assert via the playClip stub's call count and `tour.beatIndex` — then natural completion); `clamps an out-of-range beat range to the tour bounds` (`{from:0,to:99}` → all beats play); `a range take still applies the scene cues of the skipped prefix` (reuse the hide-cue fixture of the `reconstructs the scene on every beat entry` test at lines 219-258, but start at `{from:1,to:1}` and assert the cue's effect is applied on entry).
- [ ] Extend `watchTourSaga.test.ts`: the range on the action reaches `guidedTourSaga`.
- [ ] Implement (action payload prepare-fn, watcher pass-through, loop bounds + clamp).
- [ ] Full `npm test` — the existing five guidedTourSaga tests must stay green untouched (no-range default). `npm run typecheck`. Commit.

---

## Task 6 — The harness (`npm run record-tour`) — GATED on Task 1

**Files:** `tools/record/recordTour.ts` (new), `package.json` (add `"record-tour": "tsx tools/record/recordTour.ts"`), `.gitignore` (add a `recordings/` block).

**CLI:** `--beats <a..b>` (default: full tour), `--fps <n>` (default 60), `--size <WxH>` (default `3840x2160`), `--out <path>` (default `recordings/grand-tour-4k60.mp4`), `--url` (default `http://localhost:5173`), tour id as the positional arg (default `grandTour`, resolved against `tourRegistry` — `src/data/animation/tours/tourRegistry.ts:17-21`). Argv: string-valued flags use a small bespoke loop — that is the documented convention (`tools/utils/cli/args.ts:4-9` explicitly scopes `parseFlags` to booleans); values are validated through Task 2's `parseBeatRange`/`parseSize`. Fail fast with a clear message if ffmpeg is not on PATH (spawn error → "brew install ffmpeg").

**Flow (spec Architecture + "Harness flow", steps 1-6 — implement in this order):**

1. Launch Chromium exactly as the spike proved (Task 1's launch pattern + any fallback its ledger note names); context viewport from `--size`, `deviceScaleFactor: 1`.
2. `goto <url>/?cinema` — boot in REAL time; await `page.evaluate` on `window.__skymapRecorder.ready`.
3. CDP `Emulation.setVirtualTimePolicy({ policy: 'pause' })`, then per-frame grants with `pauseIfNetworkFetchesPending` (lazy fetches halt virtual time → deterministic arrivals).
4. Kick `hook.startTour(id, beats?)` via `page.evaluate` — **do not await it inline**; hold the promise (bridged through `page.exposeFunction` or an evaluated flag the loop polls) and race it against the frame loop.
5. Loop: grant `1000/fps` ms → await `virtualTimeBudgetExpired` → `page.screenshot({ type: 'png' })` → write the Buffer to ffmpeg's stdin (`spawn('ffmpeg', buildFfmpegArgs({ fps, out }))`, with stdin backpressure respected — await the `write` callback/drain). No frames directory, ever (spec: 20k 4K PNGs ≈ 200 GB).
6. Stop when the startTour promise resolves; the frame cap — `tourFrameCap(beats.slice(from, to + 1), fps)` over the registry tour's beats — is the runaway guard and progress denominator (print `frame N / cap`). Then: close stdin, await ffmpeg exit code 0, run ffprobe (`-show_streams`: width/height + `nb_frames`), print the report.

**Steps:**

- [ ] Write the harness (the flow above is the contract; Task 2's helpers do all the parsing/math — no new pure logic in this file. Anything that *does* turn out pure and non-trivial: extract to `tools/utils/record/` with a test, per house rule).
- [ ] Add the npm script (alphabetical slot, after `r2-cors`) and the `.gitignore` block — own commented section next to the `docs/screenshots` video block (`.gitignore:123-129`): recorder output, huge, regenerable.
- [ ] `npm run typecheck` green.
- [ ] **Manual smoke (main session runs this, not CI — needs dev server + GPU + ffmpeg):** `npm run record-tour -- --beats 1..1 --size 640x360 --fps 10` → tiny mp4 exists, ffprobe shows 640×360 and a plausible `nb_frames`, eyeball the clip. Record the result in the commit message.
- [ ] Commit.

---

## Task 7 — Entanglement-radar pass + docs

**Files:** `tools/record/README.md` (new), `CLAUDE.md` (one line in Commands), plus whatever the radar names.

- [ ] Run the `entanglement-radar` skill over the full plan diff; fix what it names (candidates to watch: the cinema branch duplicating App JSX; the hook's ready-predicate braiding engine status with load progress; harness flow mixing capture and encode concerns).
- [ ] `tools/record/README.md` — short: prerequisites (ffmpeg on host, `npm run dev` running, GPU), usage (`record-tour` flags + the `spike-virtual-time` diagnostic), beat indices are the 0-based `tour-length` numbers, take-time expectations (~100–500 ms per 4K frame → a full ~6-min take is 1–3 h; iterate with `--beats`).
- [ ] `CLAUDE.md` Commands block: one line for `npm run record-tour` (offline tour recorder; see tools/record/README.md).
- [ ] Full `npm test` + `npm run typecheck` + `npm run build` green. Commit.

---

## Ledger

(Task 1 records its go/no-go verdict, the fallback used if any, and any launch-pattern deviations here — later tasks read this before touching Playwright.)
