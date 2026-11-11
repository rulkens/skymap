// satellites/points/vertex.wesl — one screen-sized dot per satellite, placed by 'projectSatellite'.

import package::satellites::points::io::SatelliteInstance;
import package::satellites::points::io::SatelliteUniforms;
import package::satellites::points::io::SatelliteProfile;
import package::satellites::points::io::VSOut;
import package::satellites::points::project::projectSatellite;
import package::satellites::points::illumination::earthShadowLit;
import package::satellites::points::illumination::lambertPhase;
import package::satellites::points::illumination::panelGlint;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(2) var<uniform> u: SatelliteUniforms;
@group(0) @binding(3) var<uniform> profiles: array<SatelliteProfile, 16>;

// Clip w is in near-plane units (near0OverlayClipScale: the near plane sits at w = 1), so
// this only catches a dot at or behind the eye, which is dropped rather than folded.
const W_EPS: f32 = 0.01;

const AREA_REF_M2: f32 = 22.68;
const AREA_EXP: f32 = 0.35;
const RANGE_REF_KM: f32 = 20000.0;
const RANGE_EXP: f32 = 0.4;
const RANGE_WEIGHT_MAX: f32 = 2.0;
const PHASE_EXP: f32 = 0.5;
const ECLIPSED_RESIDUAL: f32 = 0.04;
const GLINT_PEAK: f32 = 12.0;
const GLINT_SIZE_MAX: f32 = 3.0;
const GLINT_WHITE: vec3<f32> = vec3<f32>(1.0, 0.97, 0.9);
// Keeps the view direction and the range weight finite with the eye on top of a dot.
const MIN_RANGE_KM: f32 = 0.001;

@vertex
fn vs(@builtin(vertex_index) vid: u32, sat: SatelliteInstance) -> VSOut {
  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let p = projectSatellite(u, sat);
  if (p.centre.w < W_EPS) {
    return out;
  }
  let color = profiles[sat.profileCode].color;
  let areaM2 = profiles[sat.profileCode].areaM2;
  let glintGain = profiles[sat.profileCode].glintGain;

  let rangeKm = max(length(p.relKm), MIN_RANGE_KM);
  let viewDir = -p.relKm / rangeKm;
  let cosPhase = dot(u.sunDir, viewDir);
  let lit = earthShadowLit(p.earthRelKm, u.sunDir);
  let lobe = panelGlint(p.orbitNormal, u.sunDir, viewDir);

  let areaWeight = pow(areaM2 / AREA_REF_M2, AREA_EXP);
  let rangeWeight = min(pow(RANGE_REF_KM / rangeKm, RANGE_EXP), RANGE_WEIGHT_MAX);
  let phase = pow(lambertPhase(cosPhase), PHASE_EXP);
  // A mix, not a floor on `lit`: seen from the night side the phase is near zero as well.
  let diffuse = color * areaWeight * rangeWeight * mix(ECLIPSED_RESIDUAL, phase, lit);
  let glint = GLINT_WHITE * glintGain * areaWeight * lobe * lit * GLINT_PEAK;
  let sizePx = u.sizePx * (1.0 + min(lobe * glintGain * lit, 1.0) * (GLINT_SIZE_MAX - 1.0));

  let corner = quadCorner(vid);
  let offset = expandBillboardScreen(u.cam, p.centre, sizePx, corner);
  // Depthless HDR target: pin z mid-range so no near/far plane clips the dot.
  out.clip = vec4<f32>(p.centre.xy + offset, 0.5 * p.centre.w, p.centre.w);
  out.relKm = p.relKm;
  out.corner = corner;
  out.radiance = (diffuse + glint) * u.opacity * u.classOpacity[min(sat.classCode, 2u)];
  return out;
}
