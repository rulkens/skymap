# Field-star body presence should follow proximity, not selection

**Surfaced:** 2026-07-21, follow-up to the `select`-slot braid quick-patch. The
patch (`select` star, else `focus` star — `focusedFieldStarSphereLayer.ts`) fixed
the acute symptom: `#focus=star-<recordIdx>` now arrives at a visible star, because
the URL-restore path fills `focus` and the layer falls back to it. This item is the
narrower, harder un-braid the patch left standing.

## Remaining symptom the patch does NOT fix

**Deselecting at close range blinks the star out of existence.** Navigate to a star
(the sphere resolves), then deselect → the body disappears, leaving empty space at
solar-radius distance from a star that is physically still there. `clearSelection`
nulls BOTH slots, so the `select`-else-`focus` fallback has nothing to fall back to.
The star is still in front of the camera; only the selection state changed.

## Root cause — the presence ⇐ selection entanglement

The sphere layer derives WHICH star to draw from selection state. But a body's
physical presence should depend only on proximity/resolvedness — selection should
decide halos and InfoCards, never whether geometry exists. This is the same
"presence ⇐ selection" class the opacity-0-⇒-no-render rule guards against
elsewhere: what you can see must not be gated on a UI-selection flag.

## Approach — presence-by-proximity

Make `focusedFieldStarSphereLayer` derive its row from "the resolved star near the
camera" instead of from `selectionRows`. Two candidate sources for that row:

- A per-frame nearest-leaf-record query against the star octree's load-time index
  (the walk already carries `boxOriginPc` per leaf — cheap to find the nearest
  record).
- Reuse `resolveStarRecord` on the nearest record within `STAR_RESOLVE_PX` range
  (the same resolve predicate the sphere gate already uses).

Selection then only DECORATES — the halo ring and InfoCard read `selectionRows`; the
sphere reads proximity. The `select`-else-`focus` fallback in the shipped patch stays
correct under this model (it becomes dead once presence is proximity-derived, and can
be deleted in the same change).

## Design questions to resolve first (why `needs-design`)

- **Which star wins when two resolve at once?** Nearest to the camera. Needs the
  tie-break spelled out for the per-frame query.
- **Hysteresis at the resolve threshold.** A star hovering at exactly
  `STAR_RESOLVE_PX` would flicker on/off frame to frame as the camera jitters; the
  presence query needs a hysteresis band (resolve-on above the threshold, resolve-off
  below a lower one) so the sphere doesn't strobe.
- **Cost at deep zoom.** The query runs every frame the layer is live; confirm the
  nearest-record walk is negligible against the ~2.5M-galaxy inner loop (it operates
  on the far smaller star index, and only at solar-radius range).
