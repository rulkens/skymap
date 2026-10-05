// missionTrail/vertex.wesl — one segment of a craft's trail as a screen-space
// quad. Endpoints arrive as f32 hi/lo pairs of world Mpc; the camera's own pair
// is subtracted FIRST, so the huge near-equal terms cancel exactly and only the
// small remainders carry f32 rounding. The vp is rebased about the camera and
// emits clip metres (near0OverlayVpF32), so it consumes that eye-relative Mpc.

import package::bodies::missionTrail::io::TrailSegment;
import package::bodies::missionTrail::io::TrailUniforms;
import package::bodies::missionTrail::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::segmentQuad::expandSegmentQuad;

@group(0) @binding(2) var<uniform> u: TrailUniforms;

// Clip metres: a segment end behind the eye is slid along the segment to this w,
// since a quad built from a negative-w endpoint folds across the screen.
const W_EPS: f32 = 0.01;
const MPC_TO_KM: f32 = 3.0856775814913673e19;

@vertex
fn vs(@builtin(vertex_index) vid: u32, seg: TrailSegment) -> VSOut {
  var cornerX = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  var cornerY = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  let corner = vec2<f32>(cornerX[vid], cornerY[vid]);

  var a = (seg.aHi - u.camHi) + (seg.aLo - u.camLo);
  var b = (seg.bHi - u.camHi) + (seg.bLo - u.camLo);
  let wa = worldToClip(u.cam, a).w;
  let wb = worldToClip(u.cam, b).w;

  var out: VSOut;
  if (wa < W_EPS && wb < W_EPS) {
    out.clip = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    out.relKm = vec3<f32>(0.0);
    out.side = 0.0;
    return out;
  }
  if (wa < W_EPS) {
    a = a + (b - a) * ((W_EPS - wa) / (wb - wa));
  } else if (wb < W_EPS) {
    b = b + (a - b) * ((W_EPS - wb) / (wa - wb));
  }

  let p = expandSegmentQuad(u.cam, a, b, corner, 0.5 * u.widthPx);
  // Depthless HDR target: pin z mid-range so no near/far plane clips the quad.
  out.clip = vec4<f32>(p.xy, 0.5 * p.w, p.w);
  out.relKm = select(a, b, corner.x > 0.5) * MPC_TO_KM;
  out.side = corner.y * 2.0 - 1.0;
  return out;
}
