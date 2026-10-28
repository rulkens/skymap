// satellites/points/vertex.wesl — one screen-sized dot per satellite. The sweep is up to a second
// old, so the position is carried forward here: p + v dt minus the central pull, half GM p / r^3
// dt^2, which holds LEO to under a metre over a second (spec section 4). Positions stay
// Earth-relative km until the last step, so f32 never carries the heliocentric distance.

import package::satellites::points::io::SatelliteInstance;
import package::satellites::points::io::SatelliteUniforms;
import package::satellites::points::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(2) var<uniform> u: SatelliteUniforms;

const GM_KM3_S2: f32 = 398600.4418;
const MPC_TO_KM: f32 = 3.0856775814913673e19;
// Clip metres: a dot this close to, or behind, the eye is dropped rather than folded.
const W_EPS: f32 = 0.01;

@vertex
fn vs(@builtin(vertex_index) vid: u32, sat: SatelliteInstance) -> VSOut {
  let r = length(sat.posKm);
  let pullKm = sat.posKm * (-0.5 * GM_KM3_S2 / (r * r * r) * u.dtSec * u.dtSec);
  let tKm = sat.posKm + sat.velKmS * u.dtSec + pullKm;
  let rot = mat3x3<f32>(u.temeToWorld0, u.temeToWorld1, u.temeToWorld2);
  let relKm = u.earthKm + rot * tKm;

  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let centre = worldToClip(u.cam, relKm / MPC_TO_KM);
  if (centre.w < W_EPS) {
    return out;
  }
  let corner = quadCorner(vid);
  let offset = expandBillboardScreen(u.cam, centre, u.sizePx, corner);
  // Depthless HDR target: pin z mid-range so no near/far plane clips the dot.
  out.clip = vec4<f32>(centre.xy + offset, 0.5 * centre.w, centre.w);
  out.relKm = relKm;
  out.corner = corner;
  out.opacity = u.opacity * u.classOpacity[min(sat.classCode, 2u)];
  return out;
}
