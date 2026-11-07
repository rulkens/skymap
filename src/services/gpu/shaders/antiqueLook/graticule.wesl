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

// Graduated band along a great circle (latitude `lat` from its pole, longitude
// `lon` around it): two rules `gapPx` apart, cells of `cellDeg` alternately inked.
fn graduatedCircle(lat: f32, lon: f32, latPerPx: f32, cellDeg: f32, gapPx: f32, rulePx: f32) -> f32 {
  let dPx = lat / max(latPerPx, 1e-6);
  let rules = max(
    1.0 - smoothstep(rulePx - 0.5, rulePx + 0.5, abs(dPx - gapPx * 0.5)),
    1.0 - smoothstep(rulePx - 0.5, rulePx + 0.5, abs(dPx + gapPx * 0.5)),
  );
  let cellOn = f32(i32(floor(lon / cellDeg)) % 2 == 0);
  let inside = 1.0 - smoothstep(gapPx * 0.5 - 0.5, gapPx * 0.5, abs(dPx));
  return max(rules, cellOn * inside);
}

// RA/Dec rulings, one interval each for the whole plate (`raStep`, `decStep`,
// chosen on the CPU so no meridian starts or stops mid-field), plus graduated
// equator and ecliptic. Line weights rise rulings < bands < neatline.
fn graticule(d: vec3<f32>, unitPx: f32, raStep: f32, decStep: f32) -> f32 {
  let rd = raDec(d);
  // RA's derivative jumps at its 0/360 seam; the shifted copy is continuous there.
  let raPerPx = min(fwidth(rd.x), fwidth(fract(rd.x / 360.0 + 0.5) * 360.0));
  let decPerPx = fwidth(rd.y);
  // Meridians crowd at the poles: past one fixed parallel only every third runs on.
  let meridian = raStep * select(1.0, 3.0, abs(rd.y) > 75.0);
  let thin = 0.36 * unitPx;
  var ink = max(ruling(rd.x, meridian, thin, raPerPx), ruling(rd.y, decStep, thin, decPerPx)) * 0.8;

  let gap = 3.6 * unitPx;
  let rule = 0.34 * unitPx;
  let cell = max(raStep / 5.0, 1.0);
  ink = max(ink, graduatedCircle(rd.y, rd.x, decPerPx, cell, gap, rule) * 0.9);
  let beta = asin(clamp(dot(d, ECLIPTIC_POLE), -1.0, 1.0)) * DEG;
  // Ecliptic longitude from the vernal equinox (+x), counted toward the summer solstice.
  let east = normalize(cross(ECLIPTIC_POLE, vec3<f32>(1.0, 0.0, 0.0)));
  var lambda = atan2(dot(d, east), dot(d, vec3<f32>(1.0, 0.0, 0.0))) * DEG;
  lambda = select(lambda, lambda + 360.0, lambda < 0.0);
  ink = max(ink, graduatedCircle(beta, lambda, fwidth(beta), cell, gap, rule) * 0.9);
  return ink;
}
