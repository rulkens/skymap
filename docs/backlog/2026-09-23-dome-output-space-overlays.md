# Dome output-space overlays: labels plus pixel floors in fisheye pixels

**Raised:** 2026-09-23, brainstorm at the end of the dome PR (#800). Rulings
from that session are the design constraints below; the joint is not built.

## Problem

Every pixel-tuned quantity is measured in the pixels of the view that draws
it. In mono that is the canvas. In the dome each cube face is a view with
its own `drawPxPerRad` (N/2 per radian on axis, 1/cos² denser off axis), but
the audience sees the resampled equidistant image at a uniform N/π per
radian, 1.6× to 3× coarser than a face. So:

- the star glow floor `STAR_GLOW_MIN_PX` (`src/data/starCullSlack.ts:13`,
  WGSL twin `src/services/gpu/shaders/lib/starPhotometry.wesl:43`) lands
  sub-pixel in the output and stars flicker frame to frame ("fireflies");
  the 3×3 resample box (#800) halves the effect but does not remove it;
- the Milky Way sprite clamp `[starPxMin, starPxMax]`
  (`src/services/gpu/shaders/milkyWay/sprites/stars.wesl:82-97`, params in
  `sprites/io.wesl`) and the structure-ring band
  (`src/services/gpu/shaders/structureMarker/ring.wesl:108`, width from
  `dpdx`/`dpdy` of the face) are wider on axis than at a seam;
- constellation `halfWidthPx` (`constellations/vertex.wesl:75`) is a face
  width, so a line thins toward every face edge.

Screen-aligned overlays are simply off: the dome rig's program omits
`OVERLAYS` (`src/data/rendering/viewRigs.ts:25`), and the label director runs
once against the canvas `FrameView` (`runFrame.ts`, `label2DDirector.ts`)
with a rectilinear CPU projection (`src/utils/labels/projectLabels.ts:16-45`
via `cosmoLabelProjection.ts`). No `FrameView` describes the fisheye image;
`DOME_RESAMPLE` (`frameSections.ts:325-328`) is a once-scope texture remap
with no camera uniforms (`domeResampleRenderer.ts`).

## Rulings (2026-09-23)

- **Scope:** labels and the pixel floors above, one follow-up. Marker lines
  and the selection ring stay off in the dome (no cursor). Constellations and
  structure rings already draw per face and only need the width fix.
- **One joint for both.** The view carries an output pixel scale beside its
  geometric one: `pxPerRad` stays the face's own projection scale (what
  `worldLenToPx` needs), and a new `outputPxPerRad` (mono: `drawPxPerRad`;
  dome: N/π) is what every tuning constant is measured in. It travels in the
  shared camera prefix (`src/services/gpu/lib/cameraUniforms.ts:82-92`) so
  no renderer copies it.
- **Labels draw once on the fisheye image**, after the resample and after
  tonemap, from a projection of kind `equidistant` (direction → output px)
  beside today's perspective one. Declutter and placement happen in output
  pixels, so no text crosses a seam and nothing is warped by the resample.
- **Label orientation: upright toward the zenith.** Each label is rotated so
  its top points at the image centre; within ~2° of the centre it falls back
  to image-up. At the front of the dome (bottom of the dome master) this is
  identical to mono. Confirm with the planetarium that they expect
  front-at-bottom dome masters before the first delivery with text.
- The spec's own plan (`docs/superpowers/specs/completed/2026-09-19-view-rigs-dome-fisheye-design.md`,
  "OVERLAYS becomes perView") is superseded by the once-on-output shape for
  labels; per-face text would bend across seams.

## Not decided

Whether the equidistant projection is a second `FrameView` (an output view
the rig lists after its faces) or a projection object the label director
receives directly; where the per-label rotation enters the MSDF quad pass.
Run `refactor-ground` before the spec.
