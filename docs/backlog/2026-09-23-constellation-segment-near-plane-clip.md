# Constellation segments need a near-plane clip before quad expansion

**Raised:** 2026-09-22 during the dome PR (#800) clamp audit; not fixed there.

`lib::segmentQuad::expandSegmentQuad`
(`src/services/gpu/shaders/lib/segmentQuad.wesl:46`) projects both endpoints
to clip space and expands the quad from their NDC difference. When one
endpoint is behind the view's eye plane (clip w < 0) its NDC flips sign and
the expanded quad crosses the screen at the wrong place, or vanishes. Mono
never shows it: a 60° frustum rarely has a constellation line crossing its
eye plane. A dome face has a 90° frustum and four neighbours, so a line
leaving one face toward a neighbour routinely straddles the eye plane and
shows a wrong or missing stub near the seam.

The far-plane clip-z clamp that used to sit on this path was deleted in
#800 (`constellations/vertex.wesl`); it never addressed this case.

## Fix shape

Clip the segment against the near plane in clip space before expansion:
if exactly one endpoint has `w < eps`, replace it by the interpolated point
where `w = eps` along the segment, then expand as today. Both behind: cull
(zero-area quad). This lives in `expandSegmentQuad`, so marker lines get it
for free. Verify at a dome pose with a constellation figure spanning the
front/side seam (shot tool, `?dome`).
