// lightTime/vertex.wesl — a quad over the spheres' NDC bounding rect, emitted
// straight in clip space; forwards NDC for the fragment stage's view ray.

import package::lightTime::io::Uniforms;
import package::lightTime::io::VsOut;

@group(0) @binding(0) var<uniform> u: Uniforms;

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
  let p = mix(u.rect.xy, u.rect.zw, CORNERS[vid] * 0.5 + 0.5);
  var out: VsOut;
  out.clipPos = vec4<f32>(p, 0.0, 1.0);
  out.ndc = p;
  return out;
}
