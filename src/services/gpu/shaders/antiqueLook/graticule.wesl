// antiqueLook/graticule.wesl — the rulings, per pixel, in a ruling frame (`io.wesl`
// `RulingFrame`): the sky's read off the view ray, a globe's off where the ray
// meets it. Widths are in device px; each frame has one interval for the whole
// plate (`antiqueGraticuleSteps`), so meridians run edge to edge and meet the
// border's numbers.

import package::antiqueLook::io::RulingFrame;
import package::antiqueLook::plateBodies::ballNormal;

const DEG: f32 = 57.29577951;
// Ecliptic north pole (RA 270°, Dec 66.56°) — J2000 obliquity 23.44°.
const ECLIPTIC_POLE: vec3<f32> = vec3<f32>(0.0, -0.39777716, 0.91748206);
// The sky's two great circles as frames: longitude from the vernal equinox (+x).
const EQUATORIAL: RulingFrame = RulingFrame(
  vec4<f32>(1.0, 0.0, 0.0, 0.0), vec4<f32>(0.0, 1.0, 0.0, 0.0), vec4<f32>(0.0, 0.0, 1.0, 0.0),
  vec4<f32>(0.0), vec4<f32>(0.0),
);
const ECLIPTIC: RulingFrame = RulingFrame(
  vec4<f32>(1.0, 0.0, 0.0, 0.0), vec4<f32>(0.0, 0.91748206, 0.39777716, 0.0),
  vec4<f32>(ECLIPTIC_POLE, 0.0), vec4<f32>(0.0), vec4<f32>(0.0),
);

// x longitude from the frame's prime meridian, [0, 360); y latitude; degrees.
// `d` is a sky ray or a globe's surface normal. `rulingLonLat.ts` is the CPU twin.
fn frameLonLat(f: RulingFrame, d: vec3<f32>) -> vec2<f32> {
  let lon = atan2(dot(d, f.lon90.xyz), dot(d, f.lon0.xyz)) * DEG + f.lon0.w;
  return vec2<f32>(lon - 360.0 * floor(lon / 360.0), asin(clamp(dot(d, f.pole.xyz), -1.0, 1.0)) * DEG);
}

// Where a view ray meets a globe frame's ball: xyz the surface normal (on a miss,
// the closest approach's, so derivatives stay smooth past the limb), w 1 on a hit.
fn globeNormal(f: RulingFrame, ray: vec3<f32>) -> vec4<f32> {
  let c = f.globe.xyz;
  let bc = dot(ray, c);
  let off = c - bc * ray;
  return vec4<f32>(ballNormal(ray, c), f32(bc > 0.0 && dot(off, off) < 1.0));
}

// Coverage of the rulings `coord = k·step`, `halfPx` wide either side.
fn ruling(coord: f32, step: f32, halfPx: f32, perPx: f32) -> f32 {
  let d = abs(fract(coord / step + 0.5) - 0.5) * step / max(perPx, 1e-6);
  return 1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, d);
}

// 1 on alternate cells of `cell` along `coord`, each boundary set off its true
// place by up to 15% of a cell, as an engraver spaced a ladder by eye; the
// offsets are fixed per boundary, so a cell keeps its shape as the view turns.
fn handCell(coord: f32, cell: f32) -> f32 {
  let c = coord / cell;
  let k = floor(c);
  let f = c - k;
  let here = (fract(sin(k * 12.9898) * 43758.547) - 0.5) * 0.3;
  let next = (fract(sin((k + 1.0) * 12.9898) * 43758.547) - 0.5) * 0.3;
  let index = k - f32(f < here) + f32(f > 1.0 + next);
  return f32(i32(index) % 2 == 0);
}

// Graduated band along a great circle (latitude `lat` from its pole, longitude
// `lon` around it): two rules `gapPx` apart, cells of `cellDeg` alternately inked.
fn graduatedCircle(lat: f32, lon: f32, latPerPx: f32, cellDeg: f32, gapPx: f32, rulePx: f32) -> f32 {
  let dPx = lat / max(latPerPx, 1e-6);
  let rules = max(
    1.0 - smoothstep(rulePx - 0.5, rulePx + 0.5, abs(dPx - gapPx * 0.5)),
    1.0 - smoothstep(rulePx - 0.5, rulePx + 0.5, abs(dPx + gapPx * 0.5)),
  );
  let inside = 1.0 - smoothstep(gapPx * 0.5 - 0.5, gapPx * 0.5, abs(dPx));
  var cells = 0.0;
  if (inside > 0.0) {
    cells = handCell(lon, cellDeg) * inside;
  }
  return max(rules, cells);
}

fn band(ll: vec2<f32>, cellDeg: f32, unitPx: f32) -> f32 {
  return graduatedCircle(ll.y, ll.x, fwidth(ll.y), cellDeg, 2.6 * unitPx, 0.3 * unitPx) * 0.75;
}

// A frame's meridians and parallels at its intervals (`steps` xy), and its
// equator as a band graduated in its ladder's cells (z). Line weights rise
// rulings < bands < neatline.
fn graticule(ll: vec2<f32>, steps: vec4<f32>, unitPx: f32) -> f32 {
  // Longitude's derivative jumps at its 0/360 seam; the shifted copy is continuous there.
  let lonPerPx = min(fwidth(ll.x), fwidth(fract(ll.x / 360.0 + 0.5) * 360.0));
  // Meridians crowd at the poles: past one fixed parallel only every third runs on.
  let meridian = steps.x * select(1.0, 3.0, abs(ll.y) > 75.0);
  let thin = 0.36 * unitPx;
  let ink = max(ruling(ll.x, meridian, thin, lonPerPx), ruling(ll.y, steps.y, thin, fwidth(ll.y))) * 0.8;
  return max(ink, band(ll, steps.z, unitPx));
}

// The sky's equator and ecliptic, graduated whichever frame rules it; a circle
// that is already the frame's own equator is not cut twice.
fn skyCircles(ray: vec3<f32>, f: RulingFrame, unitPx: f32) -> f32 {
  var ink = 0.0;
  if (f.pole.z < 0.9999) {
    ink = band(frameLonLat(EQUATORIAL, ray), f.steps.z, unitPx);
  }
  if (dot(f.pole.xyz, ECLIPTIC_POLE) < 0.9999) {
    ink = max(ink, band(frameLonLat(ECLIPTIC, ray), f.steps.z, unitPx));
  }
  return ink;
}
