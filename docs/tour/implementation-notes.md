# Tour — implementation notes

Running log of issues/gotchas building `grandTour` ("The Long Way Out").
Newest first. Primitives: [`../animation/clip-primitives.md`](../animation/clip-primitives.md).

## Reference

- `Tour` = `{ id, label, beats[] }` → registered in `tourRegistry.ts`.
- `BeatData` = `{ caption, enterClip?, dwellClip }`. Focus lives in the enterClip (`focus(id)`), not the beat. `enterClip` (the establishing move) is optional — omit it when the previous beat already framed the subject; the dwell then starts at once.
- Clips: `flyToClip(id)` (camera), `flyAndFocusOnClip(id)` (camera + isolate, = `focusOn` composite), or hand-authored `flyPath([...])`.
- `startTour(id)` → `guidedTourSaga`: auto snapshot/restore of settings + focus. HUD-hide derived from `tour.active`.
- Focus ids: structures `${category}-${seedId}` (e.g. `cluster-virgo-m87`, `void-bootes-void`, `group-local-group`); famous bare (`m31`, `m87`); Milky Way `milkyWay` (resolves with no data).

## Log

- **`dwellSec` dissolved into `dwellClip`.** Beats author their dwell as a clip (`dwellClip: dwellDrift(8)` — or any clip: a flyPath ring, a push-in). The dwell length = the resolved clip's compiled `durationSec`; `visitBeatSaga` computes it and carries it on `dwellStarted({ dwellSec })` so the countdown ring reads the slice, not the beat. Trade accepted: after pause/resume the clip replays from its start into the remaining window (the saga can't reshape an opaque clip), so post-resume motion is cut mid-ease at the timer.
- **Caption reveals on clip LAND, not clip start** (`visitBeatSaga` step 4 = `dwellStarted()` fires after `playClip` resolves). So any in-clip `hold`/move is dead time the viewer sits through _before_ the beat's title appears. For a held/title beat, make the clip instant and let the dwell carry the motion.
- **The dwell already drifts** (`pausableDwellSaga` → `dwellDrift`): a gentle eased yaw-orbit + zero-mean pitch-bob for the whole dwell, auto-settling on the cut. Don't add in-clip "keep it alive" motion — it's redundant and delays the caption.
- **Tour-level setup was moot — deleted.** Settings actions in a setup list worked, but camera actions there were fenced (clip@95 outranks tween@60; `clipEnded` clears tweens; `suspendDuringClip` blocks new ones mid-clip), and it was a second authoring surface. The scene strip now rides beat 1's clip: `hide([...], 0)` sweep + `scene(setGalaxyCatalogVisible(...))` for per-item toggles. Same snapshot/restore covers it; stepping back to beat 1 re-establishes its scene.
- **In-clip `focus()` never moves the camera** (selection/isolation only — the fence above). The fused select-and-fly verb is `focusOn(id, over)` = `seq([focus, all([moveTargetId, dollyToId])])`; `flyAndFocusOnClip` wraps it.
- **Scene strip contents** (grandTour beat 1): volumes + filaments + flow + structure rings/labels + famous labels + MW label hidden, milliquas off; beats `show()` each as its reveal. Defaults that matter: `mcpm` volume ON, all structure rings/labels ON, all catalogs ON, filaments/flow/cf4 OFF.
