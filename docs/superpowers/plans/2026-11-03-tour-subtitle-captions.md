# Tour subtitle captions — plan

> **Source.** Chat brainstorm 2026-11-03 + an in-tour spike (`?cap=b`, reverted). Rulings: direction B
> (beat title as a small mono label, one narration line at a time in large serif, bottom-centre);
> authors write the lines; lines play during the dwell only (a beat wanting text over motion authors the
> motion as its dwell, the `neighbourhoodFlythrough` idiom); line changes are CSS animations from a pure
> schedule, like the dwell ring.
> **Ground preparation.** None needed — `refactor-ground` ran: every touchpoint is growth or deletion
> (one `BeatCaption` contract change, one new util); the greenfield cross-check derived the same data
> shape and differed only on the timing driver, ruled A (CSS) by the user.
> **Gate.** `npm run typecheck`, `npm test`, CI, and the eye checks in the DoD. Ships as its own PR from
> worktree `tour-start-earth-ui-rework`, ahead of the tour-opens-on-Earth work.

## Contract

```ts
// src/@types/animation/tour/BeatCaption.d.ts — body, position removed
export type BeatCaption = {
  readonly title: string;
  /** Narration, one subtitle per entry, author-broken at phrase boundaries. Plain text. ≥ 1. */
  readonly lines: readonly string[];
};

// src/utils/animation/lineSchedule.ts — contiguous slices of the dwell, weighted by max(length, SUBTITLE_MIN_CHARS)
export function lineSchedule(
  lines: readonly string[],
  dwellSec: number,
): readonly { readonly startSec: number; readonly endSec: number }[];

// src/data/animation/subtitleTiming.ts
export const SUBTITLE_MIN_CHARS: number; // weight floor so a short line still holds
export const SUBTITLE_MIN_READ_SEC: number; // the fit test's floor per line (start ~2.5 s, tune by eye)
```

Deleted: `src/@types/animation/tour/CaptionPosition.d.ts`, `src/utils/animation/captionAnchor.ts`, the
overlay's `VIGNETTE_CLASS` map and per-anchor classes, and the `react-markdown` dependency (its only user
is `TourCaption`).

## Tasks

### Task 1 — schedule util + timing constants

**Files:** `src/utils/animation/lineSchedule.ts`, `src/data/animation/subtitleTiming.ts`,
`tests/utils/animation/lineSchedule.test.ts`

Tests (the arithmetic that can drift):

- `slices are contiguous from 0 to dwellSec` — `s[0].startSec === 0`, `s[i].endSec === s[i+1].startSec`,
  last `endSec === dwellSec`.
- `a longer line gets a longer slice` — two lines, 10 and 40 chars → second slice ≈ 4× the first.
- `the weight floor lifts a very short line` — `['OK.', <40 chars>]` → first slice equals the slice of a
  `SUBTITLE_MIN_CHARS`-long line.
- `one line spans the whole dwell`.

### Task 2 — `BeatCaption` becomes `{ title, lines }`; migrate every caption; fit test

**Files:** `src/@types/animation/tour/BeatCaption.d.ts`, `src/data/animation/tours/grandTour.ts`,
`src/data/animation/tours/demoTour.ts`, `src/data/animation/tours/webShowcase.ts`,
`tests/data/animation/tours/subtitleFit.test.ts`

- Every caption's `body` becomes `lines`, **same words**, split at sentence or phrase boundaries (a long
  single sentence, e.g. Laniakea, splits at its colon/comma). Drop every `position:` field.
- Fit test over every tour in `tourRegistry`: for each beat with a caption, compile its `dwellClip` to
  `durationSec` and assert every `lineSchedule` slice ≥ `SUBTITLE_MIN_READ_SEC`. `compileClip` throws on
  unresolved id-bearing cues, so resolve with a stub `SelectionResolver` (any id → a fixed row);
  durations don't depend on the resolved values. Name: `every tour beat gives each subtitle line its
reading floor`. A failure message names tour, beat index and the short line.
- If a beat fails: lengthen its dwell or re-break its lines; never lower the floor to pass.

### Task 3 — the overlay draws subtitles

**Files:** `src/components/TourOverlay/TourCaption.tsx`, `src/components/TourOverlay/TourOverlay.tsx`,
`src/components/TourOverlay/TourOverlay.module.css`, `src/@types/animation/tour/CaptionPosition.d.ts`
(delete), `src/utils/animation/captionAnchor.ts` (delete, and its test if any), `package.json`
(drop `react-markdown`), `tests/components/TourOverlay/TourOverlay.test.tsx`

Load the `create-component` skill first; read `docs/superpowers/conventions/ui-ux.md`.

- `TourCaption` takes `dwellSec`, `dwellNonce`, `paused` (already TourOverlay props) beside `caption`,
  `label`, `index`, `total`, `hasChrome`. Kicker → the beat **title** as a small mono uppercase label
  (series label + readout stay with chrome as today, on the same line or dropped — pick by eye, keep one
  label line). Lines: one element per line, keyed on `dwellNonce`, each running a `subtitleLine`
  keyframe (opacity in ~300 ms ease-out, hold, out ~300 ms ease-in) with `animation-delay`/`duration`
  from `lineSchedule`, `animation-play-state: paused` while `paused` (the ring's mechanism,
  `TourNav.tsx:77-92`). Only one line is visible at a time; the first line has no fade-in delay beyond
  the existing reveal.
- Layout from the spike: block centred above the nav (`bottom` clears the cluster; cinema keeps the
  no-chrome inset), `width: min(72ch, 92vw)`, line in `--font-family-display` 500,
  `clamp(19px, 1.1vw + 8px, 27px)`, line-height 1.3, `max-width: 54ch`, `text-wrap: balance`, the
  existing text-shadow. One vignette: a bottom band (`linear-gradient(to top, …)`), always on.
- `prefers-reduced-motion: reduce` → lines swap with no fade.
- Tests: delete the markdown case. Add `pausing freezes the subtitle line` (paused → every line element
  has `animation-play-state: paused`) and `each line starts at its schedule slice` (line i's
  `animation-delay` equals `lineSchedule(...)[i].startSec`). Nothing else earns a test.

### Task 4 — recorder check (assumption of ruling A)

**Files:** none (evidence in the PR body)

- Record one cinema take of a beat with ≥ 2 lines: `npm run record-tour -- --beats a..a --fps 30
--size 1280x720 --url <your server>`. Confirm in the frames that line 2 replaces line 1 at its
  scheduled time (± 1 frame). If CSS animations don't follow virtual time, **stop and report** — the
  fallback is ruling B (an rAF dwell-elapsed hook), which is the user's call.

### Task 3b — line timing moves to a frame clock (ruling B, 2026-11-03)

Task 4 failed: in a cinema take, CSS `animation-delay`s of several seconds never elapse under the
recorder's virtual time (line 2 never appeared). The user ruled B.

**Files:** `src/hooks/useDwellElapsed.ts`, `src/utils/animation/subtitleOpacity.ts`,
`src/components/TourOverlay/TourCaption.tsx`, `src/components/TourOverlay/TourOverlay.module.css`,
`tests/utils/animation/subtitleOpacity.test.ts`, `tests/components/TourOverlay/TourOverlay.test.tsx`

```ts
// seconds of dwell elapsed: frozen while `paused`, reset when `dwellNonce` changes.
// Amended after the re-run of Task 4: rAF also stalls ~2 s into a quiet dwell under virtual time,
// so the clock is a SUBTITLE_TICK_MS setInterval reading performance.now() (timers follow the budget).
export function useDwellElapsed(dwellNonce: number, paused: boolean): number;

// 0..1: ramps in over SUBTITLE_FADE_SEC from startSec, out over SUBTITLE_FADE_SEC to endSec;
// `stepped` (reduced motion) → 1 inside the slice, 0 outside
export function subtitleOpacity(
  slice: { readonly startSec: number; readonly endSec: number },
  tSec: number,
  stepped: boolean,
): number;
```

- `TourCaption` sets each line's `opacity` inline from `subtitleOpacity(schedule[i], elapsed, reduced)`;
  no line CSS animations or animation delays remain (`subtitleIn`/`subtitleOut`/`subtitleLineStep`
  and the `--in-delay`/`--out-delay`/`--dur` vars go). Lines still share one grid cell.
- Tests: `subtitleOpacity` — 0 before start, 1 mid-slice, ramp midpoint ≈ 0.5 at `startSec + fade/2`,
  0 after end, stepped has no ramp. Replace the two overlay tests with `pausing freezes the subtitle
line` (fake timers / mocked rAF: elapsed stops advancing while paused) and `the second line shows
after its slice start`.
- Re-run Task 4's recorder check.

### Task 5 — docs

**Files:** `docs/tour/graphic-design.md`, `docs/tour/implementation-notes.md`,
`.claude/skills/tour/SKILL.md` (only if it cites `body`/`position`)

- `graphic-design.md` Layout + "three text surfaces": replace the bottom-left lower-third with the
  subtitle block; keep it short.
- `implementation-notes.md` Log (newest first): captions are `lines`, timed across the dwell by
  `lineSchedule`; text over motion = author the motion as the dwell; the fit test is the authoring
  guard.

## Definition of Done

- [ ] `npm run typecheck`, `npm test` green; CI green.
- [ ] No `body`/`position` on any caption; `CaptionPosition`, `captionAnchor`, `react-markdown` gone
      (grep clean).
- [ ] Fit test passes for all three tours without lowering `SUBTITLE_MIN_READ_SEC`.
- [ ] Recorder check (Task 4) shows line changes on schedule.
- [ ] Eye checks as dash `check`s, before/after vs main, shot with `npm run shot` at **1728×1000 and
      400×850**, one per item:
  - `#tour=grandTour` beat 0 (one line);
  - a two-line beat (Nearest neighbour, `#tour=grandTour`, advance twice);
  - the longest beat (Laniakea) mid-dwell, second line showing;
  - paused mid-beat: the line holds.
- [ ] Reduced motion on: lines swap, nothing slides.
- [ ] `ui-ux.md` self-check lines in the PR body.
