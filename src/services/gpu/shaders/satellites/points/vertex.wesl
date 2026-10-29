// satellites/points/vertex.wesl — one screen-sized dot per satellite, placed by 'projectSatellite'.

import package::satellites::points::io::SatelliteInstance;
import package::satellites::points::io::SatelliteUniforms;
import package::satellites::points::io::VSOut;
import package::satellites::points::project::projectSatellite;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(2) var<uniform> u: SatelliteUniforms;

// Clip w is in near-plane units (near0OverlayClipScale: the near plane sits at w = 1), so
// this only catches a dot at or behind the eye, which is dropped rather than folded.
const W_EPS: f32 = 0.01;

@vertex
fn vs(@builtin(vertex_index) vid: u32, sat: SatelliteInstance) -> VSOut {
  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let p = projectSatellite(u, sat);
  if (p.centre.w < W_EPS) {
    return out;
  }
  let corner = quadCorner(vid);
  let offset = expandBillboardScreen(u.cam, p.centre, u.sizePx, corner);
  // Depthless HDR target: pin z mid-range so no near/far plane clips the dot.
  out.clip = vec4<f32>(p.centre.xy + offset, 0.5 * p.centre.w, p.centre.w);
  out.relKm = p.relKm;
  out.corner = corner;
  out.opacity = u.opacity * u.classOpacity[min(sat.classCode, 2u)];
  return out;
}
