// satellites/points/illumination.wesl — how much sunlight one dot catches: Earth's shadow, the
// sunset colour of light that grazed the atmosphere, the phase of a sunlit sphere, and the flashes
// of a sun-tracking panel and an Earth-facing body. Every path returns a finite value, because one
// NaN in the additive HDR target poisons the frame.

import package::lib::math::PI;

const EARTH_RADIUS_KM: f32 = 6378.0;
const SUN_HALF_ANGLE_TAN: f32 = 0.00466;
// smoothstep is indeterminate when its edges meet, and they do just behind the terminator.
const MIN_PENUMBRA_HALF_WIDTH_KM: f32 = 1.0;
const GLINT_LOBE_EXP: f32 = 3000.0;
// Rounding leaves about 1e-3 on the cross of parallel km-scale vectors; real orbits exceed 1e4.
const MIN_ORBIT_NORMAL_LEN2: f32 = 1.0;
// Squared sine of 0.06 degrees: nearer than that, the projected direction is rounding noise.
const MIN_UNIT_LEN2: f32 = 1e-6;
// Crude slant optical depth (R, G, B) of a ray grazing the surface, falling off with the height
// of its closest approach; Rayleigh scattering takes blue first, so grazing light turns red.
const GRAZING_DEPTH: vec3<f32> = vec3<f32>(2.0, 5.0, 12.0);
const GRAZING_SCALE_KM: f32 = 8.0;

// 1 in full sun, 0 in umbra. Cylinder along -sunDir, radius EARTH_RADIUS_KM, widened by
// SUN_HALF_ANGLE_TAN times the distance behind Earth, smoothstepped across it.
fn earthShadowLit(earthRelKm: vec3<f32>, sunDir: vec3<f32>) -> f32 {
  let alongSunKm = dot(earthRelKm, sunDir);
  if (alongSunKm >= 0.0) {
    return 1.0;
  }
  let offAxisKm = length(earthRelKm - sunDir * alongSunKm);
  let halfWidthKm = max(-alongSunKm * SUN_HALF_ANGLE_TAN, MIN_PENUMBRA_HALF_WIDTH_KM);
  return smoothstep(EARTH_RADIUS_KM - halfWidthKm, EARTH_RADIUS_KM + halfWidthKm, offAxisKm);
}

// The colour of the sunlight reaching a dot: white, unless its ray from the Sun skimmed past
// Earth first, which happens only behind Earth's terminator plane. Refraction is ignored.
fn sunlightTint(earthRelKm: vec3<f32>, sunDir: vec3<f32>) -> vec3<f32> {
  let alongSunKm = dot(earthRelKm, sunDir);
  if (alongSunKm >= 0.0) {
    return vec3<f32>(1.0);
  }
  let grazeHeightKm = max(length(earthRelKm - sunDir * alongSunKm) - EARTH_RADIUS_KM, 0.0);
  return exp(-GRAZING_DEPTH * exp(-grazeHeightKm / GRAZING_SCALE_KM));
}

// Lambert sphere: ((PI - a) cos a + sin a) / PI. Floored at 0 because rounding near a = PI can
// dip below it, and the caller raises this to a fractional power.
fn lambertPhase(cosPhase: f32) -> f32 {
  let a = acos(clamp(cosPhase, -1.0, 1.0));
  return max(((PI - a) * cos(a) + sin(a)) / PI, 0.0);
}

// A panel turns about the orbit normal to face the Sun as nearly as it can, so its normal is the
// Sun projected into the orbit plane. 0 for a zero orbit normal or a Sun along it.
fn panelGlint(orbitNormal: vec3<f32>, sunDir: vec3<f32>, viewDir: vec3<f32>) -> f32 {
  let normalLen2 = dot(orbitNormal, orbitNormal);
  if (normalLen2 < MIN_ORBIT_NORMAL_LEN2) {
    return 0.0;
  }
  let h = orbitNormal / sqrt(normalLen2);
  let inPlane = sunDir - h * dot(sunDir, h);
  let inPlaneLen2 = dot(inPlane, inPlane);
  let halfwaySum = sunDir + viewDir;
  let halfwayLen2 = dot(halfwaySum, halfwaySum);
  if (inPlaneLen2 < MIN_UNIT_LEN2 || halfwayLen2 < MIN_UNIT_LEN2) {
    return 0.0;
  }
  let n = inPlane / sqrt(inPlaneLen2);
  let halfway = halfwaySum / sqrt(halfwayLen2);
  return pow(max(dot(n, halfway), 0.0), GLINT_LOBE_EXP);
}

// A flat body face pointing at Earth's centre. It is lit only once the Sun is below the
// satellite's horizon, and then mirrors it up and away from the Sun: the twilight flash seen
// from the night side. Near the lobe's peak both Sun and eye are on the face's side, so a back
// face can never flash. 0 for a dot at Earth's centre or Sun and eye exactly opposed.
fn plateGlint(earthRelKm: vec3<f32>, sunDir: vec3<f32>, viewDir: vec3<f32>) -> f32 {
  let rangeLen2 = dot(earthRelKm, earthRelKm);
  let halfwaySum = sunDir + viewDir;
  let halfwayLen2 = dot(halfwaySum, halfwaySum);
  if (rangeLen2 < MIN_ORBIT_NORMAL_LEN2 || halfwayLen2 < MIN_UNIT_LEN2) {
    return 0.0;
  }
  let n = -earthRelKm / sqrt(rangeLen2);
  let halfway = halfwaySum / sqrt(halfwayLen2);
  return pow(max(dot(n, halfway), 0.0), GLINT_LOBE_EXP);
}
