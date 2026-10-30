// points/colorFragment.wesl — the flat points pipeline's visual fragment:
// the per-source fade at @group(1), handed to 'galaxyPointColor'
// (points/colorBody.wesl), which holds the whole fragment stage. Sister file to
// 'pickFragment.wesl'; the selection ring is a dedicated pass, not this file's.

import package::galaxyCatalog::points::io::VSOut;
import package::galaxyCatalog::points::colorBody::galaxyPointColor;
import package::lib::fadeUniforms::FadeUniforms;

@group(1) @binding(0) var<uniform> fade: FadeUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return galaxyPointColor(in, fade.opacity);
}
