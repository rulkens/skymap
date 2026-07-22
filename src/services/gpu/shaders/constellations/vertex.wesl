// constellations/vertex.wesl — instanced-quad thick-line vertex stage for the
// true-3D constellation stick figures.
//
// One instance per constellation line segment. The instance carries the two
// endpoints (world Mpc) plus each endpoint's apparent magnitude. The stage does
// two things:
//
//   1. Thickness — expands the corner into a screen-aligned quad of half-width
//      'u.halfWidthPx' via the shared 'lib::segmentQuad::expandSegmentQuad'
//      helper (the same expansion filaments + markerLines use). This owns the
//      endpoint choice (corner.x >0.5 -> b) and the +/- perpendicular offset.
//
//   2. The endpoint gap (Q4) — pulls each end INWARD along the screen-space
//      segment tangent by a pixel margin derived from that endpoint's apparent
//      magnitude, so the line stops short of the star's visible glow. This is
//      COMPOSED onto the helper's output, not a second copy of the expansion:
//      the helper already baked the chosen endpoint's w into 'base', so adding a
//      tangent-inward NDC offset times 'base.w' lands back in clip space exactly
//      as the helper's own perpendicular offset does.
//
// ## The gap curve and the star glow
//
// A star's DRAWN dot is a fixed screen-space radius (STAR_GLOW_MIN_PX at the
// default size slider — see lib/starPhotometry.wesl); its apparent magnitude
// expresses purely as the additive dot's PEAK, and the bloom pass spreads a
// bright star's visible glow well past that dot. There is therefore no single
// magnitude->radius curve in the star shaders to import — the visible glow is a
// bloom-dependent perceptual size, not a shader constant. So this stage derives
// the gap as a monotonic, magnitude-linear clearance (the classical star-chart
// convention: a brighter star draws a bigger mark), BOUNDED by the same
// STAR_GLOW_MIN_PX floor and STAR_GLOW_MAX_PX ceiling the drawn dot obeys, so
// the gap can never fall below the point-source dot nor blow past the glow cap.
// The two shaping constants below are eye-tuning STARTING POINTS, tuned visually
// in Task 15 alongside the halfwidth, tone, and distance fade.
//
// ## Why bindings are declared here, not in io.wesl
//
// WESL has no global state — the '@group(0) @binding(0)' declaration is
// module-local and cannot be exported. We re-declare it here using 'Uniforms'
// imported from io.wesl so the layout matches fragment.wesl's declaration.

import package::constellations::io::Uniforms;
import package::constellations::io::PerVertex;
import package::constellations::io::VSOut;
import package::lib::segmentQuad::expandSegmentQuad;
import package::lib::camera::worldToClip;
import package::lib::starPhotometry::STAR_GLOW_MIN_PX;
import package::lib::starPhotometry::STAR_GLOW_MAX_PX;

@group(0) @binding(0) var<uniform> u : Uniforms;

// Depth epsilon: pull the clamped clip-z this far inside the far plane (in
// ndc-z terms) so an endpoint sitting exactly ON it still passes the clip test.
// Inert for depth here — the constellation pass is depthless additive HDR (no
// depth test or write), so a clamped z perturbs no comparison; it only keeps a
// beyond-far endpoint from frustum-clipping. Mirrors markerLines/vertex.wesl.
const CLIP_Z_EPS : f32 = 1e-4;

// Apparent magnitude at/above which an endpoint star barely glows, so the gap
// is just the point-source floor. ~6 = the naked-eye limit; eye-tuning start.
const GAP_FAINT_MAG : f32 = 6.0;

// Screen-space pixels of extra clearance per magnitude BRIGHTER than
// GAP_FAINT_MAG. Bright stars bloom wider, so the line must clear more of them.
// Eye-tuning starting point (Task 15).
const GAP_PX_PER_MAG : f32 = 1.6;

// The inward pixel gap for one endpoint from its apparent magnitude: brighter
// (lower appMag) ⇒ larger gap, floored on the drawn dot's minimum radius and
// capped on its maximum, so the clearance tracks the glow bounds.
fn endpointGapPx(appMag : f32) -> f32 {
  let raw = STAR_GLOW_MIN_PX + GAP_PX_PER_MAG * (GAP_FAINT_MAG - appMag);
  return clamp(raw, STAR_GLOW_MIN_PX, STAR_GLOW_MAX_PX);
}

@vertex
fn vs(in : PerVertex) -> VSOut {
  // 1. Thickness/base clip via the shared helper. 'u.halfWidthPx' is already a
  //    half-width, so it passes straight through. 'base.w' is the SELECTED
  //    endpoint's w (the helper returns the endpoint's z/w untouched), which the
  //    gap step below re-uses to convert its NDC offset back to clip space.
  let base = expandSegmentQuad(u.cam, in.aWorld, in.bWorld, in.uv, u.halfWidthPx);

  // 2. Screen-space tangent, recomputed here (a few lines, NOT a second
  //    expansion): project both endpoints, perspective-divide, take the NDC
  //    direction from a to b. This is the same project->divide the helper does
  //    internally, but the helper hides its tangent, so the gap step derives it
  //    once more rather than re-copying the whole expansion.
  let aClip = worldToClip(u.cam, in.aWorld);
  let bClip = worldToClip(u.cam, in.bWorld);
  let aNdc = aClip.xy / aClip.w;
  let bNdc = bClip.xy / bClip.w;
  let tangent = normalize(bNdc - aNdc);

  // This corner's endpoint, by the SAME public convention the helper documents
  // (corner.x >0.5 -> b). Pull it toward the OTHER end: endpoint a moves +tangent
  // (toward b), endpoint b moves -tangent (toward a).
  let isB = in.uv.x > 0.5;
  let appMag = select(in.aAppMag, in.bAppMag, isB);
  let inwardDir = select(tangent, -tangent, isB);

  // px -> NDC by the same viewport convention 'expandSegmentQuad' uses for its
  // perpendicular offset (one NDC unit = half the viewport in px), then back to
  // clip space by the chosen endpoint's w. Because the helper already offset
  // 'base.xy' by 'perp * w', adding 'gapNdc * base.w' composes the two offsets
  // on the one endpoint whose w they share.
  let gapNdc = inwardDir * (endpointGapPx(appMag) / (u.cam.viewportPx * 0.5));

  var out : VSOut;
  let gapped = base.xy + gapNdc * base.w;
  // Clamp z just inside the far plane so a beyond-far endpoint survives (inert
  // for depth — depthless additive pass), mirroring markerLines/vertex.wesl.
  out.clip = vec4<f32>(gapped, min(base.z, base.w * (1.0 - CLIP_Z_EPS)), base.w);
  out.uv = in.uv;
  return out;
}
