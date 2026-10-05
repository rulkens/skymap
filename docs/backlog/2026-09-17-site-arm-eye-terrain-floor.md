# Rover-site camera: floor the eye on the terrain under it

`ready` — found on F4 (#743), design ruled by the user 2026-09-17, handed to the
terrain-aware camera work so the camera changes land in one place.

## Bug

In the `site:<id>` frame (`src/services/engine/camera/rungs/siteRung.ts`) the
eye's only floor is `clampedSitePose`: 0.2 × the site mesh's bounding radius above
the ANCHOR's tangent plane. On a slope the eye goes under the real terrain, and
tiles seen from below are back-face culled (`surfaceTileRenderer.ts:160`), so the
ground vanishes. Perseverance at heading 0, range 12.23 m, elevation 0.0325 rad:
eye 0.88 m under the z17 terrain. User pose that shows it: heading −0.546,
elevation 0.0325, range 12.23 m.

## Ruled design ("option A")

Keep the site's own clearance (0.2 × bounding radius, ~0.4 m for Perseverance) but
measure it against the LIVE ground under the EYE (`host.groundRadiusAtM`). When the
eye would dip below, keep heading and range and raise elevation to the lowest value
that clears (the pivot solve `flooredBodyPose` already has); the camera slides up
the orbit sphere over the uphill side and returns to the chosen angle when the
terrain allows. Range floor first; step and `fromParent` floor, decoded clip
channels stay unfloored. Guard a lookup that answers 0 (nothing resident).

Rejected: the body floor (`surfaceFloorM`, ~8 m on Mars — forces ~42° at 12 m and
kills rover close-ups); flooring the world arm after the fold (fights the site pose
every frame).

Site placement stays on the baked `SITE_GROUND_HEIGHTS` (#743); only the eye floor
is live. Test first: a synthetic sloped lookup puts the eye under ground; after the
fix eye ≥ ground + clearance, heading/range unchanged, downhill passes through.
