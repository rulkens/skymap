// satellites/points/illumination.wesl — how much sunlight one dot catches: Earth's shadow, the
// phase of a sunlit sphere and the flash of a sun-tracking panel. Every path returns a finite
// value, because one NaN in the additive HDR target poisons the frame.

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
