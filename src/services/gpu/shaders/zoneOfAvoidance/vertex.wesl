// zoneOfAvoidance/vertex.wesl — fullscreen-quad vertex stage for the
// galactic-plane dust-band guide layer.
//
// Emits a 6-vertex fullscreen triangle pair directly in clip space (no
// view-projection multiply, no large coordinates) and forwards the NDC for
// the fragment stage to build its view ray from the camera basis. Verbatim
// technique from horizonShell/vertex.wesl.

import package::zoneOfAvoidance::io::VsOut;

// Fullscreen quad corners in NDC, triangle-list order.
const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VsOut {
  let c = CORNERS[vid];
  var out: VsOut;
  // Depth 0 (near plane in ZO); the HDR pass has no depth test so the exact
  // value is irrelevant — it just needs to sit inside the clip volume so the
  // quad isn't culled.
  out.clipPos = vec4<f32>(c, 0.0, 1.0);
  out.ndc = c;
  return out;
}
