# Terrain: horizon cull drops near patches under high tilt (grey holes)

**Status:** parked 2026-09-15 during F2 (`terrain-f2-displacement`, PR #719)
by user ruling; root cause located, fix not written. Repro test patch and
probe traces are in the F2 ledger's session scratchpad and reproduced below.

**Symptom.** At Everest and in the Copenhagen z13 ring around Søndermarken,
with the orbit target sunk to sea level (camera ~0–2 m above the datum) and
the view tilted 10–20° above the local horizontal, grey rectangles sit at the
bottom of the screen and never fill. The LOD overlay shows no tint there: no
patch is drawn at all (not a texture miss). Debug readout: `plan: 124 req ·
zWin 13 · 0 miss · cut: 38 tiles drawn`. Only seen where a deep band (z13)
carries real relief; lower-z areas look fine. The base globe on F2 is drawn
at `innerBoundRadiusM`, so an absent leaf shows sky/haze grey (F1's datum
BMNG hid the same holes).

**Root cause (instrumented walk, `src/utils/scene/cutSurfaceTiles.ts`).**
Step "1. Horizon" culls on the flat-datum angle alone:
`centreAngle - patchAngle > capAngle` never reads `reliefHeadroom`. Step 2
(frustum sphere) does fold relief in, but a node the horizon test rejects
never reaches it. At 2 m altitude the cap is ~0.045°, so a patch whose real
relief (Everest 8849 m; even Søndermarken's ~30 m matters at that altitude)
lifts it above the smooth-sphere horizon is dropped, and with it the whole
subtree, with no ancestor drawn either. Trace at height 2 m, tilt 10°,
azimuth 0, Everest: `z11 1519/352: HORIZON CULL centreAngle=0.00289
patchAngle=0.00205 capAngle=0.00079`; four z13 tiles (6073–6076/1411) on
screen in the bottom third missing from the cut. Azimuths 90/180 show no
hole, which is why the 30-pose oracle earlier in F2 (camera well above the
datum) saw none.

**Second finding, same code.** `if (!(camLen > radiusM))` returns an empty
plan when the camera is on or inside the datum sphere. With the target sunk
to sea level and terrain up to 8.8 km, a camera 50 m below the datum plans
nothing: `height=-50m … requests=0 cut=0`. The surface vanishes entirely.
Whatever fixes the horizon cap must also give this branch a relief-aware
answer (treat camera radius as `max(camLen, radiusM + reliefMax)` or plan
from the max-relief sphere).

**Fix direction.** Fold `reliefHeadroom(z, x, y)` (or the subtree's max
relief) into the horizon test: raise the effective sphere the cap is computed
against, or subtract the relief-lifted angle from `centreAngle - patchAngle`.
Same headroom the frustum sphere already uses, so no new data. Then re-run
the repro below and the F2 30-pose oracle. Real fix for the camera sinking to
sea level is F3 (surface-relative camera); this item only makes the walk
honest about relief so F3 has ground to stand on.

**Repro test (parked; drop into
`tests/utils/scene/cutSurfaceTiles.test.ts` beside "low-altitude planner
input precision").** Pose `tiltedAt(2, 10, 86.955, 27.932)`, bands = global
z3–7 + Everest EOX band (86.68212890625–87.12158203125 E,
27.79541015625–28.10302734375 N, z8–13), `lodBias 1`, residentSlot returning
`subtreeRangeM = [-200, 8849] / R` for height tiles. Expected: request set
contains `height/13/6076/1412`; on the flat datum (`[0, 0]`) it does not.
