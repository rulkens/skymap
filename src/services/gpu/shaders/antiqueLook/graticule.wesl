// antiqueLook/graticule.wesl — the celestial rulings, per pixel from the view ray.
// The world frame is equatorial (+z the north pole, RA = atan2(y, x)), so the
// ray IS the chart coordinate. Widths are in device px; spacing follows the
// zoom so rulings stay ~a hand's width apart, as on a printed plate.

const DEG: f32 = 57.29577951;
// Ecliptic north pole (RA 270°, Dec 66.56°) — J2000 obliquity 23.44°.
const ECLIPTIC_POLE: vec3<f32> = vec3<f32>(0.0, -0.39777716, 0.91748206);

// x = RA [0,360), y = Dec [-90,90], both degrees.
fn raDec(d: vec3<f32>) -> vec2<f32> {
  let ra = atan2(d.y, d.x) * DEG;
  return vec2<f32>(select(ra, ra + 360.0, ra < 0.0), asin(clamp(d.z, -1.0, 1.0)) * DEG);
}

// Coverage of the rulings `coord = k·step`, `halfPx` wide either side.
fn ruling(coord: f32, step: f32, halfPx: f32, perPx: f32) -> f32 {
  let d = abs(fract(coord / step + 0.5) - 0.5) * step / max(perPx, 1e-6);
  return 1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, d);
}

// The smallest "round" step (from the list) at least `minPx` wide on screen.
fn niceStep(perPx: f32, minPx: f32) -> f32 {
  let want = perPx * minPx;
  var s = 90.0;
  let steps = array<f32, 8>(1.0, 2.0, 5.0, 10.0, 15.0, 20.0, 30.0, 45.0);
  for (var i = 7; i >= 0; i--) {
    if (steps[i] >= want) {
      s = steps[i];
    }
  }
  return s;
}

// Graduated band along a great circle (latitude `lat` from its pole, longitude
// `lon` around it): two rules `gapPx` apart, cells alternately inked by degree.
fn graduatedCircle(lat: f32, lon: f32, latPerPx: f32, lonPerPx: f32, gapPx: f32, rulePx: f32) -> f32 {
  let dPx = lat / max(latPerPx, 1e-6);
  let rules = max(
    1.0 - smoothstep(rulePx - 0.5, rulePx + 0.5, abs(dPx - gapPx * 0.5)),
    1.0 - smoothstep(rulePx - 0.5, rulePx + 0.5, abs(dPx + gapPx * 0.5)),
  );
  let cellDeg = niceStep(lonPerPx, 9.0);
  let cellOn = f32(i32(floor(lon / cellDeg)) % 2 == 0);
  let inside = 1.0 - smoothstep(gapPx * 0.5 - 0.5, gapPx * 0.5, abs(dPx));
  return max(rules, cellOn * inside);
}

// RA/Dec rulings plus graduated equator and ecliptic. `unitPx` = device px per unit.
fn graticule(d: vec3<f32>, unitPx: f32) -> f32 {
  let rd = raDec(d);
  // RA's derivative jumps at its 0/360 seam; the shifted copy is continuous there.
  let raPerPx = min(fwidth(rd.x), fwidth(fract(rd.x / 360.0 + 0.5) * 360.0));
  let decPerPx = fwidth(rd.y);
  let decStep = niceStep(decPerPx, 110.0 * unitPx);
  // RA rulings converge at the poles: thin them out above ±75°.
  let raStep = niceStep(raPerPx * cos(rd.y / DEG), 110.0 * unitPx) * select(1.0, 6.0, abs(rd.y) > 75.0);
  let thin = 0.42 * unitPx;
  var ink = max(ruling(rd.x, raStep, thin, raPerPx), ruling(rd.y, decStep, thin, decPerPx)) * 0.75;

  let gap = 4.2 * unitPx;
  let rule = 0.38 * unitPx;
  ink = max(ink, graduatedCircle(rd.y, rd.x, decPerPx, raPerPx, gap, rule));
  let beta = asin(clamp(dot(d, ECLIPTIC_POLE), -1.0, 1.0)) * DEG;
  // Ecliptic longitude from the vernal equinox (+x), counted toward the summer solstice.
  let east = normalize(cross(ECLIPTIC_POLE, vec3<f32>(1.0, 0.0, 0.0)));
  var lambda = atan2(dot(d, east), dot(d, vec3<f32>(1.0, 0.0, 0.0))) * DEG;
  lambda = select(lambda, lambda + 360.0, lambda < 0.0);
  let lamPerPx = min(fwidth(lambda), fwidth(fract(lambda / 360.0 + 0.5) * 360.0));
  ink = max(ink, graduatedCircle(beta, lambda, fwidth(beta), lamPerPx, gap, rule));
  return ink;
}
