// lib/segmentQuad.wesl — instanced-quad thick-line expansion vocabulary.
//
// Four renderers draw screen-space thick lines the same way: filaments,
// markerLines, constellations and mission trails. Each emits one instance per
// segment and expands it into a screen-aligned rectangle in the vertex stage,
// because WebGPU's 'line-list' topology is always 1 pixel wide on most
// platforms (no 'setLineWidth' exists, by spec). Getting the expansion's order
// wrong (subtracting clip vectors with different w before dividing, or
// forgetting the w re-multiply) yields foreshortened or non-uniform widths that
// are hard to spot, so there is exactly one definition to audit.
//
// ## An endpoint behind the eye
//
// Dividing an endpoint with w < 0 flips its NDC, which folds the quad across
// the screen. No w threshold fixes that: one above the near plane cuts visible
// line near the eye, one far below it drowns in f32 noise. The homogeneous
// tangent below is valid for either sign, and a behind endpoint's corner goes
// off-screen along it: the visible part of such a segment projects to a ray.
//
// camera.wesl stays MINIMAL (the CameraUniforms layout and 'worldToClip'); this
// compound vocabulary is built on top of it, for thick-line renderers only.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;

// segmentScreenTangent — the unit NDC direction of a segment's projection,
// from a toward b, for any signs of the two clip w. d(x/w)/dt at an endpoint is
// (xb*wa - xa*wb) over a positive square, so this needs no divide; with both
// endpoints in front it equals normalize(bNdc - aNdc).
fn segmentScreenTangent(aClip: vec4<f32>, bClip: vec4<f32>) -> vec2<f32> {
  return normalize(bClip.xy * aClip.w - aClip.xy * bClip.w);
}

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
// Returns the offset clip-space vertex with the selected endpoint's z and w,
// so depth and perspective-correct interpolation are preserved. A corner whose
// endpoint is behind the eye takes the in-front endpoint's z and w instead, and
// a segment wholly behind the eye returns vec4(0): a degenerate, culled quad.
fn expandSegmentQuad(
  cam: CameraUniforms,
  aWorld: vec3<f32>,
  bWorld: vec3<f32>,
  corner: vec2<f32>,
  halfWidthPx: f32,
) -> vec4<f32> {
  let aClip = worldToClip(cam, aWorld);
  let bClip = worldToClip(cam, bWorld);
  let aFront = aClip.w > 0.0;
  let bFront = bClip.w > 0.0;
  if (!aFront && !bFront) {
    return vec4<f32>(0.0);
  }

  // The perpendicular comes from the homogeneous tangent, so it holds even
  // with one endpoint behind the eye.
  let tangent = segmentScreenTangent(aClip, bClip);
  let perp = vec2<f32>(-tangent.y, tangent.x);

  // This corner's endpoint. A behind one becomes a point past the screen edge
  // along the tangent from the in-front end: 'length(frontNdc) + 4' NDC units
  // leaves the [-1, 1] square from any start.
  let isB = corner.x > 0.5;
  let front = select(bClip, aClip, aFront);
  let frontNdc = front.xy / front.w;
  let offScreen = frontNdc + select(-tangent, tangent, aFront) * (length(frontNdc) + 4.0);
  let chosen = select(aClip, bClip, isB);
  let chosenFront = select(aFront, bFront, isB);
  let ndc = select(offScreen, chosen.xy / chosen.w, chosenFront);
  let zw = select(front.zw, chosen.zw, chosenFront);

  // Half-width in pixels -> NDC: one NDC unit is half the viewport in pixels.
  // corner.y in [0,1] maps to the +/- side; the result is re-multiplied by w
  // to return to clip space.
  let offsetNdc = perp * (halfWidthPx / (cam.viewportPx * 0.5)) * (corner.y * 2.0 - 1.0);
  return vec4<f32>((ndc + offsetNdc) * zw.y, zw.x, zw.y);
}
