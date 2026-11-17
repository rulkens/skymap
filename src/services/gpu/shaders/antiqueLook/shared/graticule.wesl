// antiqueLook/shared/graticule.wesl — the rulings, per pixel, in a ruling frame (`antiqueLook/io.wesl`
// `RulingFrame`): the sky's read off the view ray, a globe's off where the ray
// meets it. Widths are in device px; each frame has one interval for the whole
// plate (`antiqueGraticuleSteps`), so meridians run edge to edge and meet the
// border's numbers.

import package::antiqueLook::io::RulingFrame;
import package::antiqueLook::shared::plateBodies::ballNormal;

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
// `direction` is a sky ray or a globe's surface normal. `rulingLonLat.ts` is the CPU twin.
fn frameLonLat(frame: RulingFrame, direction: vec3<f32>) -> vec2<f32> {
  let lon = atan2(dot(direction, frame.lon90.xyz), dot(direction, frame.lon0.xyz)) * DEG + frame.lon0.w;
  return vec2<f32>(lon - 360.0 * floor(lon / 360.0), asin(clamp(dot(direction, frame.pole.xyz), -1.0, 1.0)) * DEG);
}

// Where a view ray meets a globe frame's ball: xyz the surface normal (on a miss,
// the closest approach's, so derivatives stay smooth past the limb), w 1 on a hit.
fn globeNormal(frame: RulingFrame, ray: vec3<f32>) -> vec4<f32> {
  let globeCentre = frame.globe.xyz;
  let alongRay = dot(ray, globeCentre);
  let off = globeCentre - alongRay * ray;
  return vec4<f32>(ballNormal(ray, globeCentre), f32(alongRay > 0.0 && dot(off, off) < 1.0));
}

// Coverage of the rulings `coord = k·step`, `halfPx` wide either side.
fn ruling(coord: f32, step: f32, halfPx: f32, perPx: f32) -> f32 {
  let distPx = abs(fract(coord / step + 0.5) - 0.5) * step / max(perPx, 1e-6);
  return 1.0 - smoothstep(halfPx - 0.5, halfPx + 0.5, distPx);
}

// 1 on alternate cells of `cell` along `coord`, each boundary set off its true
// place by up to 15% of a cell, as an engraver spaced a ladder by eye; the
// offsets are fixed per boundary, so a cell keeps its shape as the view turns.
fn handCell(coord: f32, cell: f32) -> f32 {
  let cellCoord = coord / cell;
  let cellIndex = floor(cellCoord);
  let cellFrac = cellCoord - cellIndex;
  let here = (fract(sin(cellIndex * 12.9898) * 43758.547) - 0.5) * 0.3;
  let next = (fract(sin((cellIndex + 1.0) * 12.9898) * 43758.547) - 0.5) * 0.3;
  let index = cellIndex - f32(cellFrac < here) + f32(cellFrac > 1.0 + next);
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
    cells = handCell(lon, cellDeg) * inside * 0.6;
  }
  return max(rules, cells);
}

fn band(lonLat: vec2<f32>, cellDeg: f32, unitPx: f32) -> f32 {
  return graduatedCircle(lonLat.y, lonLat.x, fwidth(lonLat.y), cellDeg, 2.4 * unitPx, 0.26 * unitPx) * 0.7;
}

// A frame's meridians and parallels at its intervals (`steps` xy), and its
// equator as a band graduated in its ladder's cells (z). Line weights rise
// rulings < bands < neatline.
fn graticule(lonLat: vec2<f32>, steps: vec4<f32>, unitPx: f32) -> f32 {
  // Longitude's derivative jumps at its 0/360 seam; the shifted copy is continuous there.
  let lonPerPx = min(fwidth(lonLat.x), fwidth(fract(lonLat.x / 360.0 + 0.5) * 360.0));
  // Meridians crowd at the poles: past one fixed parallel only every third runs on.
  let meridian = steps.x * select(1.0, 3.0, abs(lonLat.y) > 75.0);
  let thin = 0.36 * unitPx;
  let ink = max(ruling(lonLat.x, meridian, thin, lonPerPx), ruling(lonLat.y, steps.y, thin, fwidth(lonLat.y))) * 0.8;
  return max(ink, band(lonLat, steps.z, unitPx));
}

// The sky's equator and ecliptic, graduated whichever frame rules it; a circle
// that is already the frame's own equator is not cut twice.
fn skyCircles(ray: vec3<f32>, frame: RulingFrame, unitPx: f32) -> f32 {
  var ink = 0.0;
  if (frame.pole.z < 0.9999) {
    ink = band(frameLonLat(EQUATORIAL, ray), frame.steps.z, unitPx);
  }
  if (dot(frame.pole.xyz, ECLIPTIC_POLE) < 0.9999) {
    ink = max(ink, band(frameLonLat(ECLIPTIC, ray), frame.steps.z, unitPx));
  }
  return ink;
}
