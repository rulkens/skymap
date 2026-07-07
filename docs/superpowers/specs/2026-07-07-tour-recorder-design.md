# Tour Recorder Design — Playwright + Virtual Time + ffmpeg

**Status:** Draft — approach + output format approved in brainstorm 2026-07-07;
next step is `writing-plans`.
**Date:** 2026-07-07
**Author:** Alexander Rulkens (+ Claude)

## Goal

Record the grand tour ("The Long Way Out") frame by frame — deterministically,
at 3840×2160, 60 fps — and encode it into an H.264 mp4. The film includes the
tour captions (they carry the narration) and nothing else from the HUD.

The recorder is an offline authoring tool, not a product feature: a Node
harness under `tools/record/` that drives the app in headless Chromium. A full
take is allowed to be slow (hours); iteration happens on per-beat partial
takes.

## Why this shape

Two pipeline shapes were weighed:

1. **In-app recorder** — step the clock at `startLoop`, read pixels back via
   `copyTextureToBuffer`, encode with WebCodecs in the page. Fast capture, but
   it must rebuild the captions in-canvas (they are styled React DOM today —
   typography, wrapping, fade choreography — and the MSDF pipeline does small
   scene labels, not paragraph layout), it must fix the tour saga's wall-clock
   reads, pin the canvas size, add `COPY_SRC`, and build an encoder. Every one
   of those is app code, and the caption work would be a second caption
   implementation maintained forever.

2. **Browser harness** — Playwright drives the unmodified app; Chrome DevTools
   Protocol **virtual time** (`Emulation.setVirtualTimePolicy`) pauses the
   entire browser clock — `performance.now()`, `Date.now()`, `setTimeout`,
   rAF, CSS transitions — and advances it in exact per-frame increments. This
   is the `timecut` technique. Screenshots capture the composited page, DOM
   captions included, pixel-exact as authored.

Shape 2 wins because virtual time dissolves, with **zero app-side clock
changes**, every blocker the research pass found on the app side:

- The tour sequencer runs on the wall clock (`pausableDwellSaga.ts` uses
  `Date.now()` + redux-saga `delay()`, i.e. real `setTimeout`) — under virtual
  time it steps in lockstep with the render clock.
- `resizeCanvasToDisplay` (`src/services/gpu/device.ts`) recomputes
  `clientWidth × dpr` every frame — a 3840×2160 viewport at
  `deviceScaleFactor: 1` makes it produce a native 4K canvas by itself.
- `AssetSlot`'s `Date.now()` load-fade stamps are virtualized too.

The in-app recorder only wins on capture speed. The shapes are not exclusive:
if take time ever becomes the bottleneck, in-canvas captions + in-app capture
is a later follow-up that obsoletes none of this harness (the harness just
keeps screenshotting whatever the page shows).

## What the research pass established

The frame-clock seam (PR #405) did its job — the app is already
recorder-shaped on the render side:

- **Rendering is a pure function of `nowMs`.** `runFrame(state, deps, nowMs)`
  takes time as a parameter; the only hardcoded `performance.now()` on the
  frame path is the closure in `startLoop.ts` — which virtual time
  virtualizes. Fades, tweens, clip evaluation, focus recession, and dwell
  drift are all absolute-time evaluators; there is no shader time uniform and
  no RNG on the frame path.
- **The tour runs end-to-end with no input**: `startTour(id)` →
  `guidedTourSaga`, and `pausableDwellSaga`'s `timeout` race arm
  auto-advances each beat.
- **Labels, "You are here", and structure rings are in-canvas** (MSDF +
  `encodeUiOverlay` + `structureMarkersPass`) — they survive any capture.
- **`npm run tour-length`** (`clipDurationSec` over the beat sheet) gives the
  exact authored virtual duration per beat — the recorder's frame budget.
- **What is DOM, and therefore only in a page screenshot:** the TourOverlay
  captions, ScaleBar, StatusBar, InfoCard, LoadingBar, NavigationPanel, and
  the button cluster — all mounted in `App.tsx`.
- **Playwright already drives real WebGPU headless** in the e2e suite
  (`tests/e2e/`, screenshots included) — the launch flags are known-good.

## Decisions (approved)

| Decision      | Choice                                                           |
| ------------- | ---------------------------------------------------------------- |
| Pipeline      | Playwright + CDP virtual time + ffmpeg stdin pipe                |
| Resolution    | 3840×2160 (viewport 3840×2160 @ `deviceScaleFactor: 1`)          |
| Frame rate    | 60 fps (budget grant = 1000/60 ms per frame)                     |
| Codec         | H.264, `libx264 -crf 16 -preset slow -pix_fmt yuv420p`, mp4      |
| Audio         | none — captions carry the narration                              |
| Overlays kept | TourOverlay captions only; all other HUD hidden ("cinema mode")  |
| Output        | `recordings/grand-tour-4k60.mp4` (`recordings/` gitignored)      |
| ffmpeg        | host prerequisite (`brew install ffmpeg`), not an npm dependency |

## Architecture

```
npm run record-tour [--beats 4..6] [--fps 60] [--size 3840x2160] [--out path]
        │
        ▼
tools/record/recordTour.ts  (Node, Playwright)
        │  launch headless Chromium (e2e WebGPU flags), viewport = --size, dpr 1
        │  goto <app>?cinema   → boot in REAL time → await recorder hook `ready`
        │  CDP: Emulation.setVirtualTimePolicy('pauseIfNetworkFetchesPending')
        │  hook.startTour('grandTour', beats?)
        │
        │  per frame:  grant 1000/fps ms budget
        │              await virtualTimeBudgetExpired
        │              CDP Page.captureScreenshot ──PNG──▶ ffmpeg stdin
        │
        │  stop on hook's tour-ended signal (frame-budget cap as runaway guard)
        ▼
ffmpeg -f image2pipe -framerate <fps> -i - -c:v libx264 … out.mp4
        │
        ▼
ffprobe verification (geometry, frame count, duration) printed to the console
```

### Harness flow

1. **Launch** Chromium with the e2e suite's WebGPU flags; context viewport
   `--size` at `deviceScaleFactor: 1`. Target URL is the running dev server or
   `vite preview` (flag, default `http://localhost:5173`).
2. **Boot in real time.** Virtual time is NOT engaged during bootstrap — font
   atlas, catalog tiers, and engine init proceed normally. The harness awaits
   the recorder hook's `ready` promise (engine started, registered loading
   slots settled).
3. **Engage virtual time**: `setVirtualTimePolicy('pauseIfNetworkFetchesPending')`
   from an initial paused state, then dispatch the tour through the hook.
4. **Step**: each loop iteration grants one frame's budget and awaits
   `Emulation.virtualTimeBudgetExpired`. The grant fires rAF → the scheduler →
   `runFrame` with a stepped `performance.now()`. The
   `pauseIfNetworkFetchesPending` policy means virtual time halts while
   fetches (thumbnails, tiers, volumes) are in flight — lazy loads land at
   deterministic _virtual_ moments.
5. **Capture**: raw CDP `Page.captureScreenshot({ format: 'png', fromSurface: true })`
   after each step, written to ffmpeg's stdin — NOT Playwright's
   `page.screenshot()`, whose readiness waits deadlock while the virtual-time
   budget is exhausted (spike finding). No frames directory — 20k 4K PNGs
   would be ~200 GB.
6. **Terminate** on the tour-ended signal; close stdin, await ffmpeg exit,
   run ffprobe on the output and report.

The expected frame count is precomputed from the `tour-length` machinery
(`clipDurationSec` per beat) plus a margin for `waitUntil` readiness gates;
it is a safety cap and a progress denominator, not the stop condition.

### App changes (the entire in-repo surface)

1. **Cinema mode** — a `?cinema` URL param. `App.tsx` renders only the canvas
   and `TourOverlayContainer`; StatusBar, ScaleBar, InfoCard, LoadingBar,
   NavigationPanel, HomeButton, SearchTrigger, AboutPill, AutoRotateToggle,
   Splash, and debug pills are not mounted. Any splash/first-interaction gate
   is skipped so the page is capture-ready on load.
2. **Recorder hook** — active only in cinema mode, a small
   `window.__skymapRecorder` object exposing:
   - `ready: Promise<void>` — engine running and registered loading slots
     settled;
   - `startTour(id, beats?: { from: number; to: number }): Promise<void>` —
     resolves when the tour saga completes (the tour-ended signal).

   This is the single seam the harness talks through; the harness never
   reaches into the store from `page.evaluate`.

3. **Beat ranges** — `--beats 4..6` threads through the hook into
   `guidedTourSaga`'s beat loop as start/end indices. This is the iteration
   answer: a one-beat take costs minutes, not hours.

Explicitly **not** changed: `startLoop`, `renderScheduler`, `device.ts`,
`runFrame`, the sagas' clocks, canvas configuration. The virtual clock reaches
all of them through the browser.

### Determinism

- Acceptance bar: two takes of the same beats are **visually identical
  frame-for-frame**. Byte-identical is not promised — GPU float accumulation
  may wiggle low bits.
- Asset arrivals are deterministic in virtual time under
  `pauseIfNetworkFetchesPending`, so their authored load-fades (600 ms
  dissolve at arrival) play at reproducible moments. Consequence to accept:
  where the tour outruns loading, the film shows the dissolve — exactly as a
  fast live viewer would. If a specific beat's dissolve is ugly on film, the
  fix is authoring (a `waitUntil` gate in that beat), not recorder machinery.
- One known cosmetic wall-clock read survives on the frame path:
  `milkyWayPickVisible.ts` samples `performance.now()` directly — but that,
  too, is virtualized by CDP, and it only affects the pick-debug overlay,
  which cinema mode never shows.

## Risks and the spike gate

**The one genuine unknown is virtual time × WebGPU presentation**: does each
budget grant reliably fire rAF, render, submit, and present before
`page.screenshot` composites the page? Headless WebGPU + screenshots is proven
(e2e suite); virtual time + canvas stepping is proven (`timecut`-class tools);
the combination on this app is not.

The implementation plan therefore starts with a **spike task**, and the
harness build is gated on it: step the live app ~120 frames at 640×360,
screenshot each, assert (a) the camera pose advances between consecutive
frames, (b) two runs of the same window match visually. Named fallbacks if it
fails, decided then rather than speculatively:

- screenshot after an extra zero-work budget grant (present-lag absorption);
- an explicit per-frame present handshake added to the recorder hook.

Secondary risks:

- **Throughput** — ~100–500 ms per 4K screenshot → a full ~6-min take is
  1–3 h. Accepted: offline tool, beat ranges for iteration.
- **Headless caption rendering** — font rasterization in headless Chromium
  must match headed; verified in the spike (worst case: run headed, the
  harness is identical either way).

**Spike verdict (2026-07-07): GO, no fallback needed.** 120 frames × 16.67 ms
grants at 640×360 against the live app: motion on 119/119 consecutive pairs;
cross-run determinism mean abs diff 0.026 (max 0.068, most frames
byte-identical); MSDF labels and DOM text rasterize cleanly headless. Three
findings folded into the harness contract: (1) Playwright's default headless
_shell_ has no WebGPU adapter — launch with `channel: 'chromium'` (full build,
new headless; adapter works unflagged; `playwright.config.ts`'s
"headless works by default" comment is stale), (2) capture must use raw
CDP `Page.captureScreenshot` — Playwright's `page.screenshot()` readiness
waits deadlock while the virtual-time budget is exhausted, and (3) any DOM
interaction under paused virtual time goes through `page.evaluate` — locator
clicks run the same rAF-based readiness dance and deadlock identically.

## Testing

- Pure harness helpers — frame math (fps → budget, duration → frame cap),
  ffmpeg argument builder, `--beats` range parsing — as one-symbol-per-file
  `tools/utils/` functions with vitest coverage, per house convention.
- The spike doubles as the integration smoke: `record-tour --beats 1..1
--size 640x360 --fps 10` produces a real (tiny) mp4; ffprobe asserts stream
  geometry and frame count. Manual/dev-run only (needs GPU + ffmpeg), not CI.
- Cinema mode — a React component test asserting the HUD elements are absent
  and `TourOverlayContainer` is present under `?cinema`.

## Out of scope

- Audio (narration/music) — post-production concern.
- In-canvas GPU captions — the follow-up path if capture speed ever matters.
- Editing/grading mezzanine formats (ProRes master) — re-render is cheap
  enough offline; `-crf 16` H.264 is the deliverable.
- Recording anything other than tours (free-flight clips, live sessions) —
  the hook's `startTour` is the only entry point for now.
