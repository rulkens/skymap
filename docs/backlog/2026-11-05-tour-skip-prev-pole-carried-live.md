# A tour skip or Prev can run beats after M31 under the wrong pole

`ready` — found by reading during the tour-opens-on-Earth ground check (2026-11-05); the beats up
to M31 were fixed on the tour-opens-on-Earth branch (2026-11-06), the rest is open.

`computeSceneEntering` rebuilds a beat's scene on entry but leaves the pole out ("carried forward
live", `src/state/tour/computeSceneEntering.ts`). The beats up to and including the M31 approach
now state their pole on entry, and `frameLadder.test.ts` enters each of them cold from every pole.
The beats after it (`localGroup` through `homeAgain`) still don't state supergalactic, so a skip or
a windowed recorder take that starts past M31 runs them under whatever pole was live.

Fix, as ruled at the checkpoint (no second setter beside the cues): each of those beats states
`frameTo('supergalactic')` on entry, and the cold-entry test extends to them.
