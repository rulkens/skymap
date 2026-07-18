// markerLines/vertex.wesl — instanced-quad thick-line vertex stage.
//
// One instance per line segment.  The two endpoints come in via the
// 'fromAndWidth' / 'toAndAlpha' per-instance attributes; the unit-quad
// 'uv' per-vertex attribute selects (a) which endpoint a corner sits
// at (uv.x -> 0/1) and (b) which side of the line it offsets toward
// (uv.y -> +/-half-width along the screen-space perpendicular).
//
// This is the same instanced-quad expansion pattern as
// 'filaments/vertex.wesl' -- see that file's docstring for why we
// can't use WebGPU's topology 'line-list' directly (1-pixel-wide
// only, no setLineWidth exists by spec).
//
// ## Why bindings live here, not in io.wesl
//
// WESL has no global state — '@group(0) @binding(0) var<uniform> u'
// is module-local, not exportable.  Each consuming file (vertex /
// fragment) redeclares its bindings using the structs imported from
// io.wesl so layout numbers cannot drift between stages.

import package::markerLines::io::Uniforms;
import package::markerLines::io::VsIn;
import package::markerLines::io::VsOut;
import package::lib::camera::worldToClip;

@group(0) @binding(0) var<uniform> u: Uniforms;

// Depth epsilon: pull the clamped clip-z this far inside the far plane (in
// ndc-z terms) so an endpoint sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

@vertex
fn vs(input: VsIn) -> VsOut {
  // Unpack the packed instance attributes.
  let fromWorld = input.fromAndWidth.xyz;
  let pixelWidth = input.fromAndWidth.w;
  let toWorld = input.toAndAlpha.xyz;
  let fadeAlpha = input.toAndAlpha.w;

  // Project both endpoints to clip space via the shared helper.
  // We need both clip vectors below to compute the screen-space
  // tangent + perpendicular AND to restore clip-space coordinates
  // after the pixel-space offset, so projecting twice (rather than
  // calling worldToNdc) is the right call.
  let fromClip = worldToClip(u.cam, fromWorld);
  let toClip = worldToClip(u.cam, toWorld);

  // Choose which endpoint this corner uses (uv.x = 0 → from, 1 → to).
  let endpoint = select(fromClip, toClip, input.uv.x > 0.5);

  // Compute the screen-space tangent + perpendicular for THIS segment.
  // Math is done in NDC (perspective-divided) so the perpendicular is
  // a true screen-aligned vector regardless of how foreshortened the
  // line is in world space.
  let fromNdc = fromClip.xy / fromClip.w;
  let toNdc = toClip.xy / toClip.w;
  let tangent = normalize(toNdc - fromNdc);
  let perp = vec2<f32>(-tangent.y, tangent.x);

  // Convert pixelWidth (CSS pixels, full width) to NDC.  One NDC unit
  // = half the viewport in pixels, so '1 / (viewport * 0.5)' is NDC
  // per pixel.  We expand by half-width on each side, hence the * 0.5.
  let halfWidthNdc = perp * (pixelWidth * 0.5 / (u.cam.viewportPx * 0.5));

  // uv.y in [0, 1] picks +halfWidth or -halfWidth.
  let sideSign = input.uv.y * 2.0 - 1.0;
  let offsetNdc = halfWidthNdc * sideSign;

  // Apply the offset to the chosen endpoint, then re-multiply by w to
  // restore clip space (perspective-correct interpolation across the
  // rasterised triangle).
  //
  // The z is clamped to survive any far plane. The NEAR0 foreground
  // connectors keep endpoints far beyond the adaptive far plane
  // ('foregroundFrustum' collapses it to camDist * 100 on a deep descent)
  // and would frustum-clip without this, mirroring the star-point
  // backdrop's clamp in 'starPoints/vertex.wesl'. Inert for depth on every
  // path this shader serves (the COSMO director connectors included): the
  // marker-line pass is a depthless OVER composite — no depth test or
  // write — so a clamped z perturbs no depth comparison.
  let clampedClipZ = min(endpoint.z, endpoint.w * (1.0 - CLIP_Z_EPS));
  var out: VsOut;
  out.pos = vec4<f32>(
    endpoint.xy + offsetNdc * endpoint.w,
    clampedClipZ,
    endpoint.w,
  );
  out.uv = input.uv;
  // Pre-multiply fadeAlpha into both rgb and a so the fragment stage
  // outputs a single premultiplied color * (edge-falloff) without an
  // extra varying for the alpha gate.
  out.color = input.color * fadeAlpha;
  return out;
}
