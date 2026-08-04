# Tour and clip recorder

An offline authoring tool that plays a skymap take — a tour ("The Long Way
Out" and any other entry in `tourRegistry`), optionally windowed to a beat
range, or a standalone clip from `clipRegistry` — frame by frame and encodes
it straight to an mp4: a deterministic, film-quality take, not a live
capture. It drives headless Chromium with Playwright, hands the page's clock
to this Node process via Chrome DevTools Protocol **virtual time** (each step
grants exactly `1000/fps` ms and waits for the page to consume it), and pipes
each frame's raw CDP screenshot straight into ffmpeg's stdin. Because virtual
time pauses the whole browser clock — `performance.now()`, `setTimeout`, rAF,
CSS transitions — the tour saga (or the clip player), load-fades, and camera
tweens all step in lockstep with the render loop no matter how long a 4K
frame takes to render and encode. A tour's captions are the app's real
`TourOverlayContainer` DOM, screenshotted as authored — there is no second,
in-canvas caption implementation to maintain; a clip has no beat and so no
caption source, and a clip take carries none. See
`docs/superpowers/specs/completed/2026-07-07-tour-recorder-design.md` for the
full design and the spike's findings.

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
`recordings/grandTour-3840x2160-60fps-<timestamp>.mp4`):

```bash
npm run record-tour
```

Flags (all optional; positional `tour id` defaults to `grandTour`). `--clip`
switches the take to a standalone clip and is mutually exclusive with the
positional tour id and with `--beats` — see [Clip takes](#clip-takes) below:

| Flag         | Default                                             | Notes                                                                                                                                                   |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--clip`     | none — the take is a tour                           | clip id, must exist in `clipRegistry`; the take plays whole (`--beats` is rejected alongside it)                                                        |
| `--beats`    | full tour (`0..lastBeat`)                           | `a..b`, inclusive, 0-based; tour-only, rejected alongside `--clip`                                                                                      |
| `--sim-time` | now, resolved once at take start                    | ISO 8601 instant (e.g. `2026-07-31T12:00:00.000Z`); pins the sim clock — see [Reproducibility](#reproducibility)                                        |
| `--fps`      | `60`                                                | positive integer                                                                                                                                        |
| `--size`     | `3840x2160`                                         | `WIDTHxHEIGHT` — the OUTPUT film resolution                                                                                                             |
| `--dpr`      | `2`                                                 | viewport = size/dpr; `1` for CSS-px-native capture                                                                                                      |
| `--out`      | `recordings/<take>-<size>-<fps>fps-<timestamp>.mp4` | never overwrites a previous take; pass `--out` for a fixed name (dir auto-created); `<take>` is the tour or clip id                                     |
| `--url`      | `http://localhost:5173`                             | trailing slash stripped; must carry NO query or hash of its own — the harness appends `?cinema#t=<ISO>` itself and throws if `--url` already has either |
| positional   | `grandTour`                                         | tour id, must exist in `tourRegistry`; rejected alongside `--clip`                                                                                      |

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

## Clip takes

```bash
npm run record-clip -- flyout
```

Clip ids come from `src/@types/animation/ClipId.ts` and are keyed in
`clipRegistry` (`src/data/animation/clips/clipRegistry.ts`). Six ids are
standalone clips and the interesting ones to record this way — `flyout`,
`earthFlyout`, `flowOrbit`, `flyPathDemo`, `famousFlythrough`, `cosmicFlows`.
The rest (`tourXxx`) are grand-tour beats: they exist to be stitched into a
tour's timeline, not played alone, so film them as a windowed tour take
(`npm run record-tour -- grandTour --beats a..b`) instead.

A clip take is always played whole — `--beats` windows a tour and is rejected
alongside `--clip`.

**Known artifact, not a recorder bug:** the last captured frame of a clip
take can show `fade()` cues already snapped back to opacity 1. On natural
completion, `clipPlayer.tick()`'s deferred-completion branch dispatches
`clipEnded()` and resets the clip's opacity channel to factor 1 in the same
synchronous call (`resetState()` in
`src/services/engine/subsystems/clipPlayer.ts`); the recorder polls the done
flag before granting the next frame, so the frame captured on the completing
grant already shows the reset. This is pre-existing engine behaviour, not
something the harness can settle around.

## Reproducibility

Every take pins the sim clock: the capture URL always carries `#t=<ISO>`
(`buildCaptureUrl`), and the banner prints the resolved instant — `sim time
pinned: <ISO>  (re-take with --sim-time <ISO>)`. Pass `--sim-time <ISO>` to
re-take at that exact instant instead of "now".

Two clocks are pinned, and they are not the same clock: `#t=<ISO>` fixes the
SIM clock (which instant the solar system is drawn at), while the CDP
virtual-time budget drives the FRAME clock (how much page time each captured
frame advances) — a reproducible take needs both pinned, and nothing shares
code or units between them.

This is a behaviour change for tour takes, not just a new clip capability:
they used to run on a live wall clock and now run manual + paused at the
pinned instant — the pin routes through the `t` hash row
(`src/state/url/hashParamSources.ts`) into the time slice's manual-paused
actions on boot. What that does and does not mean: the grand tour's beats are
all cosmic-scale, so nothing in them visibly tracks wall time and existing
tour takes look the same; a solar-system-scale beat added later would now be
frozen at the pinned instant instead of drifting with wall time while it films.

The guarantee this buys is bounded: matching frame counts and the same sim
instant across two takes, not bit-identical mp4s. Pixel-level determinism
between takes is `npm run spike-virtual-time`'s standing job, not this
harness's.

## Frame 0 and scene dressing

A clip take's frame 0 is whatever `?cinema` booted into — the recorder does
not settle or dress a clip's opening the way it settles a windowed tour take
(no `--settle` flag exists for clips; see below). A clip dresses itself:
`scene()` / `show()` / `hide()` cues placed at t=0 on the clip's OWN timeline,
authored with `over: 0` so they fire as a single instant rather than a fade.
`cosmicFlows` (`src/data/animation/clips/cosmicFlows.ts`) shows the cue
shape — `hide(['volumesMaster', 'filaments', 'surveyLabel'], 0)`,
`fade(['flow'], 0, 0)`, and `scene(setFlowEnabled(true))` are all instant
cues — though in that clip they land 2 s into the timeline, after a leading
`wait(2)` lead-in, not at literal t=0: a clip whose dressing must be visible
on the very first captured frame needs its instant cues ahead of any lead-in
`wait`, not after one.

There is deliberately no `--settle` flag for clips: a windowed tour take
burns virtual time before capturing because its scene reconstruction happens
outside any beat's timeline, but a clip's cues live ON its own timeline —
burning virtual time to let them land would burn the clip's opening, which is
the thing being filmed. A clip authored without early instant cues will show
the boot scene on its opening frame(s) until cues are added.

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
