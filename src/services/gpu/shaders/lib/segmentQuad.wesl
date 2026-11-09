// lib/segmentQuad.wesl — instanced-quad thick-line expansion vocabulary.
//
// Screen-space thick lines as instanced quads, expanded in the vertex stage
// because WebGPU 'line-list' is 1 px wide (no 'setLineWidth'). One definition
// to audit: dividing before subtracting clip vectors, then re-multiplying by w,
// is easy to get subtly wrong.
//
// An endpoint behind the eye (w < 0) flips its NDC and folds the quad, and no w
// threshold fixes it: above the near plane it cuts visible line, far below it
// drowns in f32 noise. The homogeneous tangent holds for either sign, and the
// behind corner is the real segment point projecting off-screen along it, so
// world attributes interpolate perspective-correct by t. That w is tiny next to
// the front end's, so callers declare across-width varyings (uv.y, a side)
// @interpolate(linear), or the line vanishes.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;

// SegmentCorner — a corner's clip-space vertex, its parameter t along the
// segment (0 at a, 1 at b) and the segment's unit screen tangent. A caller
// carrying a world attribute per corner writes mix(a, b, t): t is a world
// parameter, never a screen one.
struct SegmentCorner {
  clip: vec4<f32>,
  t: f32,
  tangent: vec2<f32>,
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
// Returns the offset clip-space vertex, its t and the tangent. A corner in
// front is its endpoint's, z and w untouched. A segment wholly behind the eye,
// or one with no screen direction (zero length, or end-on), returns all zeros:
// a degenerate, culled quad.
fn expandSegmentQuad(
  cam: CameraUniforms,
  aWorld: vec3<f32>,
  bWorld: vec3<f32>,
  corner: vec2<f32>,
  halfWidthPx: f32,
) -> SegmentCorner {
  let aRaw = worldToClip(cam, aWorld);
  let bRaw = worldToClip(cam, bWorld);
  let aFront = aRaw.w > 0.0;
  let bFront = bRaw.w > 0.0;
  if (!aFront && !bFront) {
    return SegmentCorner(vec4<f32>(0.0), 0.0, vec2<f32>(0.0));
  }
  // Work at unit scale: H multiplies two clip coordinates, which underflows f32
  // on a slab whose clip is in Mpc, metres from the eye. Clip is homogeneous
  // and k is shared by all six vertices, so neither the image nor any
  // interpolation changes; the result is scaled back.
  let k = max(abs(aRaw.w), abs(bRaw.w));
  let aClip = aRaw / k;
  let bClip = bRaw / k;

  // H, the screen tangent from a toward b for any signs of the two w:
  // d(x/w)/dt at an endpoint is (xb*wa - xa*wb) over a positive square, so it
  // needs no divide; with both in front it is parallel to bNdc - aNdc.
  let h = bClip.xy * aClip.w - aClip.xy * bClip.w;
  let hLen = length(h);
  if (!(hLen > 0.0)) {
    return SegmentCorner(vec4<f32>(0.0), 0.0, vec2<f32>(0.0));
  }
  let tangent = h / hLen;
  let perp = vec2<f32>(-tangent.y, tangent.x);

  let isB = corner.x > 0.5;
  var clip = select(aClip, bClip, isB);
  var t = select(0.0, 1.0, isB);
  if (!select(aFront, bFront, isB)) {
    // Walk s from the front end toward this one until the projection is d NDC
    // out, past the [-1, 1] square from any start. Solving
    // s|H| = d·wF·w(s) gives the forms below: all terms positive, so neither
    // s nor w(s) cancels even when the point lies metres from an eye whose
    // front end is 10⁹ m away.
    let front = select(bClip, aClip, isB);
    let frontNdc = front.xy / front.w;
    let d = length(frontNdc) + 4.0;
    let denom = hLen + d * front.w * (front.w - clip.w);
    let s = d * front.w * front.w / denom;
    let w = front.w * hLen / denom;
    // From b, t = 1 - s, written so its terms stay positive (clip.w < 0 here).
    t = select((hLen - d * front.w * clip.w) / denom, s, aFront);
    let ndc = frontNdc + select(-tangent, tangent, aFront) * d;
    // Depth keeps the front end's z/w: the real point's z would cancel in f32
    // on a standard-Z slab. A caller that depth-tests gets that depth on the
    // walked corner (stellarStreams/ribbonPick/vertex.wesl accepts it).
    clip = vec4<f32>(ndc * w, front.z / front.w * w, w);
  }

  // Half-width in pixels -> NDC: one NDC unit is half the viewport in pixels.
  // corner.y in [0,1] maps to the +/- side; re-multiplying by w returns to clip.
  let offsetNdc = perp * (halfWidthPx / (cam.viewportPx * 0.5)) * (corner.y * 2.0 - 1.0);
  return SegmentCorner(vec4<f32>(clip.xy + offsetNdc * clip.w, clip.z, clip.w) * k, t, tangent);
}
