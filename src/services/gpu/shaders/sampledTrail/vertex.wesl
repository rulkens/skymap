// sampledTrail/vertex.wesl — one segment of a sampled body's trail as a screen-space
// quad. Endpoints arrive as f32 hi/lo pairs of world Mpc; the camera's own pair
// is subtracted FIRST, so the huge near-equal terms cancel exactly and only the
// small remainders carry f32 rounding. The vp is rebased about the camera and
// emits near-plane clip units (near0OverlayVpF32), so it consumes that eye-relative Mpc.

import package::sampledTrail::io::TrailSegment;
import package::sampledTrail::io::TrailUniforms;
import package::sampledTrail::io::VSOut;
import package::lib::segmentQuad::expandSegmentQuad;

@group(0) @binding(2) var<uniform> uniforms: TrailUniforms;

const MPC_TO_KM: f32 = 3.0856775814913673e19;

@vertex
fn vs(@builtin(vertex_index) vid: u32, seg: TrailSegment) -> VSOut {
  var cornerX = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  var cornerY = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  let corner = vec2<f32>(cornerX[vid], cornerY[vid]);

  let startRelCam = (seg.aHi - uniforms.camHi) + (seg.aLo - uniforms.camLo);
  let endRelCam = (seg.bHi - uniforms.camHi) + (seg.bLo - uniforms.camLo);
  // A zero-length segment (a head on a vertex) comes back degenerate.
  var out: VSOut;
  let quad = expandSegmentQuad(uniforms.cam, startRelCam, endRelCam, corner, 0.5 * uniforms.widthPx);
  // Depthless HDR target: pin z mid-range so no near/far plane clips the quad.
  out.clip = vec4<f32>(quad.clip.xy, 0.5 * quad.clip.w, quad.clip.w);
  // The occlusion test reads the eye-relative point under each fragment.
  out.relKm = mix(startRelCam, endRelCam, quad.t) * MPC_TO_KM;
  out.side = corner.y * 2.0 - 1.0;
  return out;
}
