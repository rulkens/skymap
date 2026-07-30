// lib/segmentQuad.wesl — instanced-quad thick-line expansion vocabulary.
//
// Two renderers draw screen-space thick lines the same way: filaments
// (cosmic-web strips) and markerLines (POI marker rings + leader lines).
// Both emit one instance per segment and expand it into a screen-aligned
// rectangle in the vertex stage, because WebGPU's 'line-list' topology is
// always 1-pixel-wide on most platforms (no 'setLineWidth' exists, by
// spec). A future constellation-line renderer wants the exact same trick.
//
// The expansion is a small but fiddly six-step dance — project both
// endpoints, perspective-divide to NDC, build a screen-space perpendicular
// from their delta, pick the corner's endpoint, offset by half-width in
// NDC, then re-multiply by w to restore clip space. Getting the order
// wrong (subtracting clip vectors with different w before dividing, or
// forgetting the w re-multiply) yields subtly foreshortened or non-uniform
// line widths that are hard to spot. Centralising it means exactly one
// definition to audit.
//
// ## Why a dedicated lib file rather than growing camera.wesl
//
// camera.wesl is deliberately MINIMAL — it owns only the shared
// CameraUniforms byte layout and the atomic 'worldToClip' / 'worldEyeDepth'
// projection primitives (see its header). Segment-quad expansion is a
// whole compound vocabulary built ON TOP of those primitives, specific to
// thick-line renderers. Keeping it here lets camera.wesl stay the place
// any world-space renderer imports from without dragging in line-expansion
// concepts it will never use.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;

// expandSegmentQuad — expand one instanced-quad corner into a clip-space
// vertex for a screen-space thick line between two world endpoints.
//
// cam         : shared CameraUniforms (supplies viewProj + viewportPx).
// aWorld/bWorld : the segment's two endpoints in world space.
// corner      : unit-quad uv. corner.x selects endpoint (>0.5 -> b);
//               corner.y in [0,1] selects side (-> +/- half-width along the
//               screen-space perpendicular).
// halfWidthPx : half the line width in CSS pixels. Callers holding a FULL
//               pixel width pass 'width * 0.5'.
//
// Returns the offset clip-space vertex. z and w are the SELECTED endpoint's,
// untouched, so perspective-correct interpolation and depth are preserved and
// a caller may re-clamp z on the result (e.g. a far-plane epsilon).
fn expandSegmentQuad(
  cam: CameraUniforms,
  aWorld: vec3<f32>,
  bWorld: vec3<f32>,
  corner: vec2<f32>,
  halfWidthPx: f32,
) -> vec4<f32> {
  // 1. Project both endpoints to clip space. We keep BOTH clip vectors:
  //    their w components are needed below to restore clip space after the
  //    pixel-space offset, so projecting twice is cheaper than any scheme
  //    that discards w.
  let aClip = worldToClip(cam, aWorld);
  let bClip = worldToClip(cam, bWorld);

  // 2. Perspective-divide each to NDC. The divide MUST happen before the
  //    subtraction in step 3 — subtracting two clip vectors with different
  //    w and dividing afterwards gives gibberish in NDC.
  let aNdc = aClip.xy / aClip.w;
  let bNdc = bClip.xy / bClip.w;

  // 3. Screen-space tangent along the segment, and its perpendicular. This
  //    is a true screen-aligned direction regardless of how foreshortened
  //    the line is in world space.
  let tangent = normalize(bNdc - aNdc);
  let perp = vec2<f32>(-tangent.y, tangent.x);

  // 4. Pick which endpoint this corner sits at (corner.x = 0 -> a, 1 -> b).
  let endpoint = select(aClip, bClip, corner.x > 0.5);

  // 5. Half-width in pixels -> NDC offset. One NDC unit = half the viewport
  //    in pixels, so '1 / (viewportPx * 0.5)' is NDC-per-pixel; multiply by
  //    halfWidthPx for the half-width in NDC. corner.y in [0,1] maps to
  //    the +/- side via 'corner.y * 2 - 1'.
  let offsetNdc = perp * (halfWidthPx / (cam.viewportPx * 0.5)) * (corner.y * 2.0 - 1.0);

  // 6. Apply the offset to the chosen endpoint, re-multiplying by w to
  //    restore clip space (perspective-correct interpolation). z and w pass
  //    through untouched so the caller keeps full control of depth.
  return vec4<f32>(endpoint.xy + offsetNdc * endpoint.w, endpoint.z, endpoint.w);
}
