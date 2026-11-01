// missionTrail/vertex.wesl — one segment of a craft's trail as a screen-space
// quad. Endpoints arrive as f32 hi/lo pairs of world Mpc; the camera's own pair
// is subtracted FIRST, so the huge near-equal terms cancel exactly and only the
// small remainders carry f32 rounding. The vp is rebased about the camera and
// emits near-plane clip units (near0OverlayVpF32), so it consumes that eye-relative Mpc.

import package::bodies::missionTrail::io::TrailSegment;
import package::bodies::missionTrail::io::TrailUniforms;
import package::bodies::missionTrail::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::segmentQuad::expandSegmentQuad;

@group(0) @binding(2) var<uniform> u: TrailUniforms;

const MPC_TO_KM: f32 = 3.0856775814913673e19;

@vertex
fn vs(@builtin(vertex_index) vid: u32, seg: TrailSegment) -> VSOut {
  var cornerX = array<f32, 6>(0.0, 0.0, 1.0, 1.0, 0.0, 1.0);
  var cornerY = array<f32, 6>(0.0, 1.0, 0.0, 0.0, 1.0, 1.0);
  let corner = vec2<f32>(cornerX[vid], cornerY[vid]);

  let a = (seg.aHi - u.camHi) + (seg.aLo - u.camLo);
  let b = (seg.bHi - u.camHi) + (seg.bLo - u.camLo);
  let aClip = worldToClip(u.cam, a);
  let bClip = worldToClip(u.cam, b);

  // A zero-length segment (a head on a vertex) has no tangent; drop it. One
  // with an end behind the eye projects to a ray, never short on screen.
  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let dPx = (bClip.xy / bClip.w - aClip.xy / aClip.w) * 0.5 * u.cam.viewportPx;
  if (aClip.w > 0.0 && bClip.w > 0.0 && dot(dPx, dPx) < 1e-10) {
    return out;
  }

  let p = expandSegmentQuad(u.cam, a, b, corner, 0.5 * u.widthPx);
  // Depthless HDR target: pin z mid-range so no near/far plane clips the quad.
  out.clip = vec4<f32>(p.xy, 0.5 * p.w, p.w);
  // The occlusion test reads the eye-relative point. A corner whose end is
  // behind the eye sits off-screen along the trail, so it carries the point
  // where the trail crosses the eye plane: a ratio of w, with no slide to a
  // near-zero w that f32 cannot resolve at trail distances.
  let crossing = a + (b - a) * (aClip.w / (aClip.w - bClip.w));
  let aKm = select(crossing, a, aClip.w > 0.0);
  let bKm = select(crossing, b, bClip.w > 0.0);
  out.relKm = select(aKm, bKm, corner.x > 0.5) * MPC_TO_KM;
  out.side = corner.y * 2.0 - 1.0;
  return out;
}
