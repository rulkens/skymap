# A tour skip or Prev can run beats under the wrong pole

`needs-repro` — found by reading during the tour-opens-on-Earth ground check (2026-11-05), not yet
reproduced.

`computeSceneEntering` rebuilds a beat's scene on entry but leaves the pole out ("carried forward
live", `src/state/tour/computeSceneEntering.ts:8-10`). Only three grand-tour beats set the pole
(`parkOpening.ts`, `approachM31.ts:63`, `homeAgain.ts:48`), so:

- **Prev** from beat 2 (supergalactic) to beat 1 replays beat 1 under supergalactic instead of
  galactic.
- **Skip or a windowed take** starting at beat 5 never fires `approachM31`'s cue, so beats 5+ run
  under galactic instead of supergalactic. The recorder's ranged takes start mid-tour exactly so.

`tests/data/animation/tours/grandTour/frameLadder.test.ts` plays every beat in order, so it can't
see either case. First step: a failing test that skips to beat 5 and expects `supergalactic`.

Fix direction, ruled at the checkpoint: no second setter beside the cues. Candidates: each beat that
depends on the pole states it on entry (the pattern the Earth beats use for their date), or the
fold replays the last `frameTo` through `applySceneEffect`.
