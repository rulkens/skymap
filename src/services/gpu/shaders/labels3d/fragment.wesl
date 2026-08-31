// labels3d/fragment.wesl — shared world-geometry text fragment stage.
// Single-band MSDF fill (no outline — passes a zero-alpha outline colour
// and zero outline width into shadeMsdf). Additive, not premultiplied
// OVER, though both draw into the same pre-tone-map HDR target: OVER's
// dst-alpha read hit a documented Apple-Silicon coherency bug across
// pass.end/pass.begin splits on this target (passes/index.ts's
// "OVER-blend coherency"); additive sidesteps it.

import package::labels3d::io::VsOut;
import package::lib::msdf::shadeMsdf;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeMsdf(input.uv, input.fontIndex, input.color, vec4<f32>(0.0), 0.0);
}
