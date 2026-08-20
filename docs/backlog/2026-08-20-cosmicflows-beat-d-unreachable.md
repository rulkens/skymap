# `cosmicFlows` beat D never plays — clip-compile duration bug

**Area:** tour/animation · **Readiness:** ready

Surfaced by rung 7's T7 review (`decisions.md` #18 closing paragraphs,
2026-08-20): `compileClip(cosmicFlows.data)` (`src/data/animation/clips/cosmicFlows.ts`)
yields `durationSec = 20`, with beat D's cue —
`fade([… milkyWayDisk …], 0, 3)` at `:96` — landing at `atSec = 20`, exactly
on the compiled boundary. `fade` cues contribute **zero awaited seconds** to
duration compilation, so the beat sheet's authored 26 s (counting each
cue's stated duration as elapsed time) collapses to a deterministic 20 s
(2 wait + 2 hold + 0 preroll-fade + 11 B + 5 C + 0 beat-D-fade). Beat D's
cue then sits at `atSec === durationSec`:
`clipPlayer.tick` fires it in the same step it sets `pendingEnd`, and the
next tick's `clipEnded()` → `resetState()` calls `clipOpacity.reset()`,
snapping every factor back to 1 one frame later. The cue is not dropped or
delayed — it fires and is immediately wiped, so it never reaches a drawn
frame either in the harness or in the app.

This was invisible before rung 7 (`decisions.md` #18, D8) migrated
`milkyWayDisk` off a raw `opacityOf` read onto the clip-aware
`resolveLayerOpacity` path — before that migration nothing consumed the
clip factor for this key, so the dead cue had no visible symptom. Two of
`cosmicFlows`'s three inert-key moments are now live from that migration
(the pre-roll `fade(['flow'], 0, 0)` load mask and beat A's crossfade);
beat D's fade-to-black is the one moment that still does not fire, for a
reason entirely independent of that migration.

## Fix directions

- Make the compiled duration cover trailing fade tails, so a `fade()` cue
  authored near the end of a beat sheet gets awaited seconds rather than
  zero.
- Or re-author `cosmicFlows`'s beat timeline so beat D's cue lands strictly
  before the last awaited cue completes, not at the boundary.
