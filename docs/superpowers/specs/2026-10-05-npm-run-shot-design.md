# `npm run shot` — a screenshot of any deep link

Decision ledger: [`docs/grill-sessions/npm-run-shot-2026-10-05.md`](../../grill-sessions/npm-run-shot-2026-10-05.md)
(Q-numbers below refer to it).

## Goal

`npm run shot -- '<share URL or bare hash>' …` opens each link in a headless browser, waits until the
app has arrived and drawn, and writes a JPEG (PNG with `--png`). Its main use is an agent's debugging loop: shoot the dev
server that is already running, look at the result, and hand the shot plus its deep link to the user
as a dash check (Q1, Q13).

Measured cost against a running dev server: about 5.6 s for one shot (`tsx` start ~1 s, Chromium
launch 0.7 s, boot to `ready` 3.3 s, screenshot 0.3–0.9 s) and about 3.6 s for each further link in the
same run. That is accepted as is (Q4).

## Rulings

- `--url` reuses a running server; without it the tool spawns its own. There is no default URL (Q2).
- Stateless: one process per run, one browser shared by every link in the run. No daemon (Q3).
- One always-installed `window.__skymap` base hook; the perf and recorder hooks keep only their own
  members (Q5, Q6).
- `renderScheduler.nextFrame()` replaces every double-`requestAnimationFrame` guess (Q7). It never
  times out; callers that need a bound bring their own.
- A spawned server is a dev server; `--build` uses the production build + preview path (Q8).
- A shot shows the link as given, plus `--hide-ui` and `--hide-labels` (Q9).
- Default frame 1600×900 at DPR 2; `--size` and `--dpr` override (Q10).
- Output is `data/shots/<subject>-<timestamp>.jpg` (`.png` under `--png`), one absolute path per shot on stdout (Q11).
- `--timeout` defaults to 30 s; on expiry the tool shoots anyway and exits non-zero. Page errors go to
  stderr and do not change the exit code (Q12).
- The tool warns when the server it shot runs from a different checkout; `perf` gets the same warning
  (Q14).
- Two PRs: ground preparation first, the tool second (Q15).

## Ground preparation

Lands as its own PR, behaviour-preserving for `perf`, `record-tour`/`record-clip` and
`capture-featured`.

### Ideal shape

```ts
// src/@types/engine/subsystems/RenderScheduler.d.ts — one new member
nextFrame(): Promise<void>; // requests a render; resolves after the next onFrame returns

// Reached by sagas through SagaContext.nextFrame and by hooks through EngineHandle.nextFrame.
// Deleted: src/services/animation/afterTwoFrames.ts

// src/@types/automation/SkymapHook.d.ts — window.__skymap
export type SkymapHook = {
  readonly ready: Promise<void>; // lazy: whenStablyReady(store), created on first read
  readonly dispatch: AppDispatch;
  readonly getState: () => RootState;
  readonly nextFrame: () => Promise<void>;
  readonly settled: () => Promise<void>; // nextFrame, repeated while the frame reported a fade or label animation
  readonly projectRoot: string; // the serving checkout's root, injected by vite `define`
};
// src/@types/automation/SkymapWindow.d.ts — the window cast, as PerfWindow/RecorderWindow do.

// SkymapPerfHook: ready, dispatch, getState removed.
// SkymapRecorderHook: ready removed.
```

Files:

- `src/state/automation/installSkymapHook.ts` — installed from `useEngine`'s effect beside
  `installPerfHook` (it needs the engine handle for `nextFrame`), ungated.
- `tools/utils/browser/bootHookedPage.ts` — waits on `__skymap` only; the `hook` parameter goes.
  `applyPose.ts` and `dispatchActions.ts` go through `__skymap.dispatch`; `applyPose` commits the pose
  with the camera slice's own actions and awaits `nextFrame`.
- `tools/utils/serve/ensureServeBuild.ts`, `ensureDataSymlink.ts`, `spawnViteServer.ts` — moved out
  of `tools/record/record.ts` unchanged, one function per file, their types under `tools/@types/serve/`.

### Joints and verdicts

| Joint | Verdict without prep | Blocker |
| --- | --- | --- |
| "A frame was drawn" signal | Bolt-on: a fourth double-rAF guess | `renderScheduler.ts` has no completion signal |
| Generic page hook | Bolt-on: the tool would borrow `?perf` and its GPU timing | `installPerfHook.ts`, `bootHookedPage.ts` hook union |
| Shared build/preview server | Bolt-on: `--build` would copy ~140 lines | `record.ts` `ensureServeBuild`…`spawnViteServer` |
| Sagas reaching the scheduler | Growth: one more `SagaContext` entry | — |

### Shape options under compatibility tension

A greenfield cross-check diverged in three places, each ruled:

- **Perf and recorder nested under the one global** — rejected at Q5: it couples three install paths.
- **`nextFrame` rejecting on a timeout** — rejected: today's wait has no bound either, and the one
  bound that matters lives in the tool.
- **Commit and dirty flag beside the project root** — rejected: a dev server's commit goes stale when
  HEAD moves; the root catches the wrong-checkout mix-up.

### Prep commits

1. `nextFrame` on the render scheduler, exposed on `SagaContext` and `EngineHandle`; `arrivalSaga` and
   the perf hook's `setPose` use it; `afterTwoFrames` is deleted.
2. `window.__skymap` installed; perf and recorder hooks shed the shared members; `bootHookedPage`,
   `applyPose`, `dispatchActions`, `captureScene`, `measurePerf` and `record.ts` move to it.
   `capture-featured` drops `?perf` from its URL and its double rAF.
3. The three serve helpers move out of `record.ts`.

### Adjacent findings

- `perf`'s `localhost:5173` default is the same wrong-server trap. Its warning rides the tool PR (Q14);
  the default itself is left alone.

## Design

### Command line

```
npm run shot -- <link>... [--url <server>] [--build] [--out <file>] [--size WxH] [--dpr N]
                          [--hide-ui] [--hide-labels] [--png] [--timeout <seconds>]
```

- A link is a full share URL or a bare hash (`focus=body-saturn`, with or without `#`). The origin and
  path of a full URL are discarded; its query flags and hash are kept.
- `--out` names the file and is valid with exactly one link. A `.png` name is written as PNG; any
  other name is JPEG, and `--png` with such a name is an error.
- `--build` is valid only without `--url`.

### Server

- With `--url`, the tool uses that server and never starts or stops one.
- Without it, the tool spawns `vite` on a free port, reads the bound URL from the banner
  (`parsePreviewUrl`), shoots, and kills the server. With `--build` it runs the production build and
  preview through the shared serve helpers.
- After boot the tool compares `__skymap.projectRoot` with its own project root and, on a mismatch,
  writes one warning line to stderr naming both. `measurePerf` does the same.

### One shot

1. New browser context at the requested size and DPR.
2. `bootHookedPage` on `<server>/?<flags>#<hash>`, with `cinema` added to the flags under `--hide-ui`.
3. Under `--hide-labels`, dispatch `labelDeclutterActions()`.
4. Await `__skymap.settled()`: at least one frame, then until a frame reports no fade or label animation. Auto-rotate and a playing clock do not count, so it cannot hang on them.
5. Capture as JPEG (quality 90) or, under `--png`, PNG, written to the output path; the absolute path goes to stdout. Under `--hide-ui` after a successful boot the bytes come from the WebGPU canvas (`toBlob` in the same task as a fresh frame); otherwise, and if that read fails, from `page.screenshot`.

Steps 2–4 race the `--timeout`. On expiry the tool still takes step 5, reports the timeout on stderr,
and the run exits non-zero after the remaining links are shot.

### Output name

`data/shots/<subject>-<YYYYMMDD-HHMMSS>.jpg` (`.png` under `--png`), local time. `<subject>` is the link's `focus`, `exhibit`,
`tour` or `clip` id, else `shot`. `data/shots/` is gitignored. Two links with the same subject in one
run get a numeric suffix.

### Convention

CLAUDE.md's "Dev server stays running" line gains the habit from Q13: for a visual check the agent
shoots, looks, then sends the user the shot and its deep link as a dash check. `npm run shot` joins
the Commands list with a `tools/shot/README.md`.

## Testing

- `renderScheduler.nextFrame`: resolves after `onFrame`, not before; requests a render when none is
  queued; concurrent callers share one frame.
- Argument parsing: link normalisation (full URL, bare hash, kept query flags), the two invalid
  combinations, size and DPR.
- Output naming: subject extraction and the same-subject suffix.
- Project-root comparison: equal, different, and a trailing-slash difference.
- The prep PR is verified by running `perf`, `capture-featured` (one card) and `record-clip` (a short
  clip) before and after; the tool by shooting a body link, an exhibit link and an unknown id (which
  must land home and still produce a shot).

## Out of scope

- A warm browser or page between runs, parallel contexts, and boot-time tuning (Q3, Q4).
- Changing `perf`'s default URL.
- Formats other than JPEG and PNG.
