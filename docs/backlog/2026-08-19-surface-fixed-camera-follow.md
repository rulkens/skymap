# Surface-fixed camera follow

Surfaced during the EOX deep-tile-bands visual pass
([spec §10](superpowers/specs/2026-08-19-eox-deep-tile-bands-design.md)):
at the feature's new ~1 km surface-standoff floor (`SURFACE_STANDOFF_RADII`,
`src/utils/camera/clampDistance.ts`), a LIVE sim clock rotates Earth under
the centre-pivoted orbit camera. Ground at Copenhagen's latitude slides
~0.26 km/s under real-time rotation — at the old 127 km floor that drift was
sub-pixel and invisible; at ~1 km it read in the visual pass as "the camera
slowly drifts while pinned," even though the camera is not moving — the
planet is rotating under it.

## Suspected fix

When focused on a body and below some altitude threshold, the camera
follows the body's rotating frame (surface-fixed) instead of the inertial
frame it uses today, degenerating back to today's behavior once the camera
pulls out past that threshold. Same shape as the existing altitude-gated
fixes in `zoomedDistance.ts` and `orbitRadPerPixel.ts` — a behavior that
only needs to change near the surface, gated on distance rather than always
on.

## Related stale note

`src/services/engine/frame/runFrame.ts:125-129` derives `LIVE_IDLE_TICK_MS
= 500` from the old 127 km standoff ("~147 km viewport" in the comment). At
the new ~1 km floor, a 500 ms live-clock tick is a ~130 m ground jump — about
10% of the viewport, no longer the sub-1.5px drift the comment claims. The
cadence (or the comment's derivation) needs re-deriving once a follow mode
exists to change the geometry it's tuned against.

## Status

The drift itself is not yet user-confirmed via a clock-paused test (pausing
LIVE time and checking the "drift" disappears) — this write-up is a
high-confidence hypothesis from the geometry (rotation rate × standoff
radius), not a repro.
