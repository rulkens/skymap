// skyGrid/vertex.wesl — one fullscreen quad; the fragment builds each
// pixel's view ray from its NDC (the horizonShell pattern).
import package::skyGrid::io::VsOut;

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
  out.clipPos = vec4<f32>(c, 0.0, 1.0);
  out.ndc = c;
  return out;
}
