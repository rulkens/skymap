# Arm ridge chain leaks flux at the cloud/spur share boundary

Found during the GPU-side v2 placement plan's Task 15 verification
(`.superpowers/sdd/2026-08-11-gpu-side-v2-placement/task-15-report.md`),
pre-existing and out of that task's scope — the ridge chain itself is
untouched by the plan.

## The bug

`pushArmRidges` (`src/services/engine/galaxyGenerator/v2/galaxyFieldMixture.ts`)
documents a flux-conservation invariant: splitting arm flux across the ridge
chain / arm-cloud tier / spur-cloud tier via `arms.cloud.share` and
`arms.spurs.share` should leave total rendered flux unchanged regardless of
the split (`renderedShare + cloudShare + spurShare === 1` ⇒ invariant total).
In practice the ridge chain carries non-negligible residual emission even at
the `share` boundary values (0 and 1), where it should contribute nothing —
contradicting its own doc comment.

## Evidence

Task 15's arm-cloud/spur-cloud consuming-multiply probe check first tried a
whole-field-sum ratio across an `elongation`-only tuning change and observed
~1.08x–1.39x against a predicted ~1x, even when driven to an *exact*
`renderedShare === 0` boundary. Isolating the cause:

- `arms.enabled = false` control ⇒ `everythingOffField = 0`, ruling out
  disc/bulge/bar/halo as the source.
- The same ~1.08x–1.39x magnitude persisted whether driven via `elongation`
  or via `share` directly, pointing at the ridge chain itself rather than the
  cloud tiers' own placement.

Task 15 worked around it by isolating measurements to a single reservation's
own instance range via `firstInstance`/`instanceCount` (through
`encodeSplatPass`), which cancels the ridge-chain confound entirely and let
the arm-cloud consuming-multiply check converge to `ratio = 1.000557`. The
underlying ridge-chain leak itself was never fixed — it wasn't Task 15's bug
to fix.

## Direction

Whoever next touches `galaxyFieldMixture.ts`'s ridge chain should re-derive
`pushArmRidges`'s flux math at `share` values near 0 and 1 and find where the
residual comes from — likely a fade/taper term that doesn't fully zero out at
the boundary rather than a gross double-count.
