// satellites/points/project.wesl — where one satellite is this frame, shared by the draw and the
// pick so a click lands on the dot the screen shows. The sweep is up to a second old, so the
// position is carried forward: p + v dt minus the central pull, half GM p / r^3 dt^2, which holds
// LEO to under a metre over a second. Positions stay Earth-relative km until the last step, so
// f32 never carries the heliocentric distance.

import package::satellites::points::io::SatelliteInstance;
import package::satellites::points::io::SatelliteUniforms;
import package::lib::camera::worldToClip;

const GM_KM3_S2: f32 = 398600.4418;
const MPC_TO_KM: f32 = 3.0856775814913673e19;

struct Projected {
  centre: vec4<f32>,
  relKm: vec3<f32>,
  // From Earth's centre, not 'relKm - earthKm', which would cancel the eye distance in f32.
  earthRelKm: vec3<f32>,
  // Unnormalised; zero for a state with velocity along the radius.
  orbitNormal: vec3<f32>,
};

fn projectSatellite(uniforms: SatelliteUniforms, sat: SatelliteInstance) -> Projected {
  let radiusKm = length(sat.posKm);
  let pullKm = sat.posKm * (-0.5 * GM_KM3_S2 / (radiusKm * radiusKm * radiusKm) * uniforms.dtSec * uniforms.dtSec);
  let tKm = sat.posKm + sat.velKmS * uniforms.dtSec + pullKm;
  let rot = mat3x3<f32>(uniforms.temeToWorld0, uniforms.temeToWorld1, uniforms.temeToWorld2);
  let earthRelKm = rot * tKm;
  let relKm = uniforms.earthKm + earthRelKm;
  let orbitNormal = rot * cross(tKm, sat.velKmS);
  return Projected(worldToClip(uniforms.cam, relKm / MPC_TO_KM), relKm, earthRelKm, orbitNormal);
}
