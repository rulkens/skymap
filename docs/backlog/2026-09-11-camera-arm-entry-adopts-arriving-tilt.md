# Body-arm entry doesn't adopt the arriving pose's tilt

**Raised:** 2026-09-10/11, orientation-unbraid design pass on PR #647 (design B7).
User ruled: backlog, not this PR.

A pose that _arrives_ at the body arm with more tilt than the arm's own mapping
implies — a fly-to, a clip end, a body switch that wiped the tilt memory — does
not get adopted into `SurfaceMemory`'s remembered tilt on entry. `display =
remembered × bodyUpWeight(h/R)` (ruling 12) reads only what got explicitly
written by a drag or the decay; an arriving pose's actual tilt is not one of
those writes.

## The symptom

A body-arm disengage that started from an unbacked tilt pops by as much as 37°
on the frame it hands off. `orientation-unbraid-design.md` §4 B2 and §5 T-G
(`.superpowers/sdd/2026-09-01-camera-pivot/orientation-unbraid-design.md:405-410,545`)
name this the standing "unbacked tilt pops at disengage" symptom, present
before this branch and explicitly _unchanged_, not worsened, by the branch's
orientation work.

## Second route (drag-authored, near-disengage)

`docs/superpowers/specs/2026-09-01-camera-pivot.md` §6 (lines ~465-479)
documents a second way to reach the same unbacked state: a tilt drag authors
display tilt directly, at any altitude; above `zeroHR` `unmappedTiltRad`'s
`w > 1e-6` guard skips the write back to `remembered`, so the drag-authored
tilt is unbacked even though it was interactively set. Held at the flip, it
crosses onto the absolute arm as roll/tilt — "the B7 symptom's second route."

## Why B7 (adopt-on-entry) is not the fix

Design B7 (`orientation-unbraid-design.md:424-428`) considered making arm
_entry_ adopt the arriving pose's tilt into `remembered`, which would make the
pop unrepresentable. Rejected for this pass: it clobbers a kept memory
whenever the world arm was not itself projecting the tilt (focus null,
`pivotsOnFocusedBody` false) — a case that needs its own ruling on what
"clobber" should mean before B7 can land safely.

## Readiness note

T22's feel gate (post-branch) attested no visible pop at the shipped tilt-band
defaults (`0.45`/`0.9`). The defect is real and reachable (both routes above),
but not observed at current tuning — readiness is `deferred`, not `ready`.

## Fix shape

Rule the "focus null / non-projecting world arm" case first, then let entry
adopt `remembered := display-implied tilt from the arriving pose` only when
the world arm was projecting it. Needs a design pass before a plan; not a
mechanical fix.
