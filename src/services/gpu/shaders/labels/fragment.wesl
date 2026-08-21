// labels/fragment.wesl — MSDF labels fragment stage. The shading body
// (median3 + shadeMsdf, plus the atlas bindings) lives in lib/msdf.wesl —
// shared with the depth-occluding variant in fragmentOcclude.wesl. This
// entry just unpacks VsOut into the scalar shadeMsdf call.

import package::labels::io::VsOut;
import package::lib::msdf::shadeMsdf;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
}
