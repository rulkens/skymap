# Dome pixel floors in fisheye pixels

**Raised:** 2026-09-23, brainstorm at the end of the dome PR (#800). Trimmed
2026-11-17 by the labels-as-data prep PR, which built the label half's joint
(`OutputProjection`), and again 2026-11-19 by the dome labels PR (#1145), which
drew the labels on the fisheye image and closed the risks it carried. What is
left here is the pixel floors, plus two lines carried from the label work (last
section).

## Problem

Every pixel-tuned quantity is measured in the pixels of the view that draws
it. In mono that is the canvas. In the dome each cube face is a view with
its own `drawPxPerRad` (N/2 per radian on axis, 1/cos² denser off axis), but
the audience sees the resampled equidistant image at a uniform N/π per
radian, 1.6× to 3× coarser than a face. So:

- the star glow floor `STAR_GLOW_MIN_PX` (`src/data/starCullSlack.ts`,
  WGSL twin in `shaders/lib/starPhotometry.wesl`) lands sub-pixel in the
  output and stars flicker frame to frame ("fireflies"); the 3×3 resample
  box (#800) halves the effect but does not remove it;
- the Milky Way sprite clamp `[starPxMin, starPxMax]`
  (`shaders/milkyWay/sprites/stars.wesl`, params in `sprites/io.wesl`) and
  the structure-ring band (`shaders/structureMarker/ring.wesl`, width from
  `dpdx`/`dpdy` of the face) are wider on axis than at a seam;
- constellation `halfWidthPx` (`constellations/vertex.wesl`) is a face
  width, so a line thins toward every face edge.

## Rulings (2026-09-23)

- **Scope:** the pixel floors above. Constellations and structure rings
  already draw per face and only need the width fix.
- **One output scale.** The view carries an output pixel scale beside its
  geometric one: `pxPerRad` stays the face's own projection scale (what
  `worldLenToPx` needs), and the output scale (mono: `drawPxPerRad`; dome:
  N/π) is what every tuning constant is measured in. It travels in the
  shared camera prefix (`src/services/gpu/lib/cameraUniforms.ts`) so no
  renderer copies it.

## Since then

Labels already measure their constants this way: `OutputProjection.pxScale`
multiplies every authored label px (CSS px): mono's is the device pixel
ratio, and the dome's is `(N/π) / REFERENCE_PX_PER_RAD × DOME_LABEL_SCALE`
(`outputProjectionOf`). The floors' scale should come from the same rig-level value rather than a second
one minted beside it.

## Not decided

Where the output scale enters the camera prefix, and whether each floor
constant is re-based to CSS px as the label constants were. Run
`refactor-ground` before the spec.

## Carried from the label work

- The light-time spheres fade by their size in face pixels, so on the dome the fade distance
  depends on the dome's resolution (2205 px, dpr 1: full to 17 radii, gone at 57; the screen
  rule gives 12 and 40 at the reference lens). Labels now use the dome's own pixel scale; the
  spheres need the output scale in the shared camera prefix, which is this item's work.
- Recordings render at dpr 1, so label text on film is half its former size. The owner
  accepted this (2026-11-18).
