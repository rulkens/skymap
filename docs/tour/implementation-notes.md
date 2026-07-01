# Tour — implementation notes

Running log of issues/gotchas building `grandTour` ("The Long Way Out").
Newest first. Primitives: [`../animation/clip-primitives.md`](../animation/clip-primitives.md).

## Reference

- `Tour` = `{ id, label, setup?, beats[] }` → registered in `tourRegistry.ts`.
- `BeatData` = `{ caption, dwellSec, clip }`. Focus lives in the clip (`focus(id)`), not the beat.
- Clips: `flyToClip(id)` (camera), `flyAndFocusOnClip(id)` (camera + isolate), or hand-authored `flyPath([...])`.
- `startTour(id)` → `guidedTourSaga`: auto snapshot/restore of settings + focus. HUD-hide derived from `tour.active`.
- Focus ids: structures `${category}-${seedId}` (e.g. `cluster-virgo-m87`, `void-bootes-void`, `group-local-group`); famous bare (`m31`, `m87`); Milky Way `milkyWay` (resolves with no data).

## Log

- **Caption reveals on clip LAND, not clip start** (`visitBeatSaga` step 4 = `dwellStarted()` fires after `playClip` resolves). So any in-clip `hold`/move is dead time the viewer sits through *before* the beat's title appears. For a held/title beat, make the clip instant and let the dwell carry the motion.
- **The dwell already drifts** (`pausableDwellSaga` → `dwellDrift`): a gentle eased yaw-orbit + zero-mean pitch-bob for the whole dwell, auto-settling on the cut. Don't add in-clip "keep it alive" motion — it's redundant and delays the caption.
- **Scene setup = `Tour.setup.effects`** (plain settings actions, auto-restored on exit). Home scene strips volumes + structure rings/labels + famous labels + milliquas; beats `show()` each as its reveal. Defaults that matter: `mcpm` volume ON, all structure rings/labels ON, all catalogs ON, filaments/flow/cf4 OFF.
