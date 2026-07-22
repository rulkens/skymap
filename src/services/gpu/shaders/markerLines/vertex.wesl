// markerLines/vertex.wesl — instanced-quad thick-line vertex stage.
//
// One instance per line segment.  The two endpoints come in via the
// 'fromAndWidth' / 'toAndAlpha' per-instance attributes; the unit-quad
// 'uv' per-vertex attribute selects (a) which endpoint a corner sits
// at (uv.x -> 0/1) and (b) which side of the line it offsets toward
// (uv.y -> +/-half-width along the screen-space perpendicular).
//
// The instanced-quad expansion itself is done by the shared
// 'lib::segmentQuad' helper (see that file for why we can't use
// WebGPU's topology 'line-list' directly — 1-pixel-wide only, no
// setLineWidth exists by spec). This shader owns only the far-plane
// z-clamp applied to the helper's result (see 'CLIP_Z_EPS').
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
import package::lib::segmentQuad::expandSegmentQuad;

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

  // Expand this corner into a clip-space vertex via the shared
  // segment-quad helper. 'pixelWidth' is a FULL width (the helper takes a
  // half-width), so we pass 'pixelWidth * 0.5'.
  let p = expandSegmentQuad(u.cam, fromWorld, toWorld, input.uv, pixelWidth * 0.5);

  // Clamp z to survive any far plane. The NEAR0 foreground connectors keep
  // endpoints far beyond the adaptive far plane ('foregroundFrustum'
  // collapses it to camDist * 100 on a deep descent) and would frustum-clip
  // without this, mirroring the star-point backdrop's clamp in
  // 'starPoints/vertex.wesl'. Inert for depth on every path this shader
  // serves (the COSMO director connectors included): the marker-line pass is
  // a depthless OVER composite — no depth test or write — so a clamped z
  // perturbs no depth comparison. We clamp the helper's returned z/w and
  // leave x/y/w untouched.
  var out: VsOut;
  out.pos = vec4<f32>(p.xy, min(p.z, p.w * (1.0 - CLIP_Z_EPS)), p.w);
  out.uv = input.uv;
  // Pre-multiply fadeAlpha into both rgb and a so the fragment stage
  // outputs a single premultiplied color * (edge-falloff) without an
  // extra varying for the alpha gate.
  out.color = input.color * fadeAlpha;
  return out;
}
