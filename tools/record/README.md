# Tour recorder

An offline authoring tool that plays a skymap tour ("The Long Way Out" and any
other entry in `tourRegistry`) frame by frame and encodes it straight to an
mp4 — a deterministic, film-quality take, not a live capture. It drives
headless Chromium with Playwright, hands the page's clock to this Node
process via Chrome DevTools Protocol **virtual time** (each step grants
exactly `1000/fps` ms and waits for the page to consume it), and pipes each
frame's raw CDP screenshot straight into ffmpeg's stdin. Because virtual time
pauses the whole browser clock — `performance.now()`, `setTimeout`, rAF, CSS
transitions — the tour saga, load-fades, and camera tweens all step in
lockstep with the render loop no matter how long a 4K frame takes to render
and encode. The captions are the app's real `TourOverlayContainer` DOM,
screenshotted as authored — there is no second, in-canvas caption
implementation to maintain. See
`docs/superpowers/specs/2026-07-07-tour-recorder-design.md` for the full
design and the spike's findings.

## Prerequisites

- **ffmpeg (+ ffprobe)** on `PATH` — a host prerequisite, not an npm
  dependency. macOS: `brew install ffmpeg`.
- **A running dev server**: `npm run dev` (default `http://localhost:5173`).
  The recorder loads `<url>/?cinema`, a mode that skips the splash and mounts
  only the canvas + tour captions.
- **A GPU, and the Playwright `chromium` channel installed.** The recorder
  launches Playwright's `channel: 'chromium'` (the full Chromium build, not
  the default headless _shell_ — the shell exposes `navigator.gpu` but yields
  no adapter). Install it once with `npx playwright install chromium`. Note: a
  bare shell (e.g. over SSH with no GPU) cannot run this — there is no
  software-WebGPU fallback, only a flagged headless-shell launch that has
  _not_ been proven to composite WebGPU reliably.

## Usage

Full take, defaults (`grandTour`, all beats, 3840×2160 output @ 60 fps —
rendered in a 1920×1080 viewport at `deviceScaleFactor: 2` so captions keep
their designed proportions — H.264 `-crf 16`, output
`recordings/grand-tour-4k60.mp4`):

```bash
npm run record-tour
```

Flags (all optional; positional `tour id` defaults to `grandTour`):

| Flag       | Default                          | Notes                                                      |
| ---------- | -------------------------------- | ---------------------------------------------------------- |
| `--beats`  | full tour (`0..lastBeat`)        | `a..b`, inclusive, 0-based                                 |
| `--fps`    | `60`                             | positive integer                                           |
| `--size`   | `3840x2160`                      | `WIDTHxHEIGHT` — the OUTPUT film resolution                |
| `--dpr`    | `2`                              | viewport = size/dpr; `1` for CSS-px-native capture         |
| `--out`    | `recordings/grand-tour-4k60.mp4` | directory is created if missing                            |
| `--url`    | `http://localhost:5173`          | trailing slash stripped; point at a non-default dev server |
| positional | `grandTour`                      | tour id, must exist in `tourRegistry`                      |

`--size` always means the pixels that land in the mp4; `--dpr` only chooses
how they are produced. At the default `--dpr 2` the page runs in a size/2
viewport at `deviceScaleFactor: 2`: DOM captions are typeset in CSS pixels,
so this renders them at the relative size a designer sees on a 2× display,
while the app's DPR-capped canvas sizing (`min(devicePixelRatio, 2)` in
`src/services/gpu/device.ts`) rasterizes the identical native canvas either
way — dpr 2 costs nothing. The harness captures with an explicit screenshot
clip at `scale = dpr` (unclipped CDP captures come back in CSS pixels), so
the output stays size-exact. Both `--size` dimensions must divide evenly by
`--dpr`.

Beat indices are the 0-based numbers `npm run tour-length` prints for a tour
— use that command first to find the range you want.

Partial take for iteration, against a dev server on a non-standard port
(1920×1080 output, i.e. a 960×540 viewport at the default dpr 2):

```bash
npm run record-tour -- --beats 4..6 --fps 30 --size 1920x1080 \
  --url http://localhost:5174 --out recordings/beat-4-6.mp4
```

Add `--dpr 1` to capture CSS-px-native instead (viewport = `--size` exactly,
captions proportionally smaller — how the app looks on a 1× monitor).

A windowed take (`--beats` with a nonzero start) automatically burns and
discards `FOLD_SETTLE_MS` (1 s) of virtual time before capturing — the saga's
scene-reconstruction fold for a mid-tour start needs that long to settle, and
the harness throws those frames away so the film's first captured frame is
already stable. A full take (starting at beat 0) has no fold to settle and
skips this.

## How long a take takes

Expect roughly 100–500 ms per captured 4K frame (screenshot + encode). A full
~6-minute tour at 60 fps is therefore on the order of **1–3 hours**. This is
an offline tool — accept the wait for a final take, and iterate on a beat
range (minutes, not hours) while tuning choreography.

## The pipeline spike

`npm run spike-virtual-time` is the standing diagnostic for the one genuinely
unproven part of this pipeline: whether a CDP virtual-time budget grant
reliably drives a WebGPU frame all the way to _presentation_ before the next
screenshot composites. It runs the live app at 640×360 for a small number of
frames (default 120) with camera auto-rotate on, twice, in fresh browser
contexts, and asserts:

- **(a) MOTION** — consecutive frames within a run visibly differ, proving
  each grant produced a genuinely new presented frame (not a frozen or lagging
  canvas);
- **(b) DETERMINISM** — the two runs are visually near-identical frame for
  frame, proving the virtual clock (not wall time) drives what lands in each
  frame — the property a reproducible re-take depends on.

Reach for it after any Playwright or Chromium upgrade, or if a real take ever
shows frozen/duplicate frames or divergent re-takes of the same beats — it is
faster to reproduce and debug at 640×360/120 frames than in a multi-hour 4K
take. Run: `npm run spike-virtual-time -- --url http://localhost:5173`
(flags: `--frames`, `--out`, `--extra-grant`; see the module header in
`virtualTimeSpike.ts`).

## Cold-cache note

The very first take against a freshly cloned worktree may hit Vite's
one-time dependency-optimization reload mid-boot — the harness tolerates one
such navigation automatically and just re-runs the boot wait. If a boot still
fails after that, load the app once in a regular browser (warms Vite's dep
cache) and retry the recorder.
