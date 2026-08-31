# NEAR0 Label3D lift floor — verify it isn't shared code

Surfaced by the Quest 3 WebXR spike (branch `worktree-quest-vr-spike`, draft
PR #625, not merging), commit `5e14e0119` — the spike's NEAR0 label producer
work.

## What it is

The spike's NEAR0 label placement math has a `MIN_DISTANCE_MPC = 1e-6` (1
parsec) floor used when computing how far to lift a label above its object.
Every solar-system-scale body the NEAR0 label producer handles sits far
closer than 1 pc, so the floor pins the lift to one oversized constant
regardless of the object's actual size or distance.

On `main` today, `src/services/engine/presentation/label3DProducers.ts`
registers exactly one `Label3DProducer`: `produceZoneOfAvoidanceLettering`
(zone-of-avoidance sky lettering, not a NEAR0/solar-system body). No
`MIN_DISTANCE_MPC`-named constant was found searched against the shared
Label3D placement surface (`Label3DArcPlacement.d.ts`,
`label3DRenderer.ts`, `runLabel3DProducers.ts`) — the closest same-named
constant on `main` is `clampDistance.ts`'s camera-clamp floor (`1e-17`), an
unrelated concern.

## Why it matters

If the floor lives in code the NEAR0 producer shares with
`produceZoneOfAvoidanceLettering` (rather than being private to the spike's
new producer), any future NEAR0 use of the shared `Label3D` mechanism on
`main` would inherit an oversized lift floor sized for a different distance
regime, tuned in a branch that never merges.

## Verification needed

This has not been confirmed against the spike's actual diff, only inferred
from what's absent on `main`. Before writing a fix or filing a design item:

1. On `worktree-quest-vr-spike` at commit `5e14e0119` (or later), find where
   `MIN_DISTANCE_MPC` is defined and read.
2. Check whether that file is shared Label3D placement code (something
   `produceZoneOfAvoidanceLettering` would also exercise) or lives entirely
   inside the spike's new NEAR0 label producer file.
3. If shared: file a follow-up to either parameterize the floor per-producer
   or scale it to the object's actual size, before any NEAR0 Label3D
   producer lands on `main`.
4. If producer-private: close this out with a note that the risk doesn't
   apply — nothing on `main` shares the constant today.
