// satellites/points/vertex.wesl — one screen-sized dot per satellite, placed by 'projectSatellite'.

import package::satellites::points::io::SatelliteInstance;
import package::satellites::points::io::SatelliteUniforms;
import package::satellites::points::io::SatelliteProfile;
import package::satellites::points::io::VSOut;
import package::satellites::points::project::projectSatellite;
import package::satellites::points::illumination::earthShadowLit;
import package::satellites::points::illumination::lambertPhase;
import package::satellites::points::illumination::panelGlint;
import package::satellites::points::illumination::plateGlint;
import package::satellites::points::illumination::sunlightTint;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(2) var<uniform> uniforms: SatelliteUniforms;
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
const GLINT_PEAK: f32 = 12.0;
const PLATE_PEAK: f32 = 8.0;
const GLINT_SIZE_MAX: f32 = 3.0;
const GLINT_WHITE: vec3<f32> = vec3<f32>(1.0, 0.97, 0.9);
// Keeps the view direction and the range weight finite with the eye on top of a dot.
const MIN_RANGE_KM: f32 = 0.001;

@vertex
fn vs(@builtin(vertex_index) vid: u32, sat: SatelliteInstance) -> VSOut {
  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let projected = projectSatellite(uniforms, sat);
  if (projected.centre.w < W_EPS) {
    return out;
  }
  let color = profiles[sat.profileCode].color;
  let areaM2 = profiles[sat.profileCode].areaM2;
  let glintGain = profiles[sat.profileCode].glintGain;

  let rangeKm = max(length(projected.relKm), MIN_RANGE_KM);
  let viewDir = -projected.relKm / rangeKm;
  let cosPhase = dot(uniforms.sunDir, viewDir);
  let lit = earthShadowLit(projected.earthRelKm, uniforms.sunDir);
  let sunlight = lit * sunlightTint(projected.earthRelKm, uniforms.sunDir);
  let lobe = panelGlint(projected.orbitNormal, uniforms.sunDir, viewDir);
  let plate = plateGlint(projected.earthRelKm, uniforms.sunDir, viewDir);

  let areaWeight = pow(areaM2 / AREA_REF_M2, AREA_EXP);
  let rangeWeight = min(pow(RANGE_REF_KM / rangeKm, RANGE_EXP), RANGE_WEIGHT_MAX);
  let phase = pow(lambertPhase(cosPhase), PHASE_EXP);
  let diffuse = color * areaWeight * rangeWeight * (uniforms.ambient + phase * sunlight);
  // glintGain also gates the plate: a group with no panels is treated as having no flat body
  // either. The plate has no published area, so it takes one strength for every group.
  let flash = glintGain * (areaWeight * lobe * GLINT_PEAK + plate * PLATE_PEAK);
  let glint = GLINT_WHITE * sunlight * flash;
  let growth = min((lobe + plate) * glintGain * lit, 1.0);
  let sizePx = uniforms.sizePx * (1.0 + growth * (GLINT_SIZE_MAX - 1.0));

  let corner = quadCorner(vid);
  let offset = expandBillboardScreen(uniforms.cam, projected.centre, sizePx, corner);
  // Depthless HDR target: pin z mid-range so no near/far plane clips the dot.
  out.clip = vec4<f32>(projected.centre.xy + offset, 0.5 * projected.centre.w, projected.centre.w);
  out.relKm = projected.relKm;
  out.corner = corner;
  out.radiance = (diffuse + glint) * uniforms.opacity * uniforms.classOpacity[min(sat.classCode, 2u)];
  return out;
}
