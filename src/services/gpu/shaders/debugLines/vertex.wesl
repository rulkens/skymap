// debugLines/vertex.wesl — instanced-quad thick-line vertex stage. The
// expansion is 'lib::segmentQuad' (WebGPU 'line-list' is 1 px wide, with no
// setLineWidth); this shader owns only the far-plane z clamp.

import package::debugLines::io::Uniforms;
import package::debugLines::io::VsIn;
import package::debugLines::io::VsOut;
import package::lib::segmentQuad::expandSegmentQuad;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Pull a clamped clip-z this far inside the far plane (ndc-z) so an endpoint
// sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

@vertex
fn vs(input: VsIn) -> VsOut {
  // 'fromAndWidth.w' is a FULL width; the helper takes a half-width.
  let clipPos = expandSegmentQuad(
    uniforms.cam,
    input.fromAndWidth.xyz,
    input.to,
    input.uv,
    input.fromAndWidth.w * 0.5,
  ).clip;
  // Clamp z to survive any far plane: the debug pass is a depthless OVER
  // composite, so a clamped z perturbs no depth comparison.
  var out: VsOut;
  out.pos = vec4<f32>(clipPos.xy, min(clipPos.z, clipPos.w * (1.0 - CLIP_Z_EPS)), clipPos.w);
  out.uv = input.uv;
  out.color = input.color;
  return out;
}
