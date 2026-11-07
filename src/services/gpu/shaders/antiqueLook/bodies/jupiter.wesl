// antiqueLook/bodies/jupiter.wesl — Jupiter as the 1660s telescopes showed it: a few
// smooth belts of hatching along the latitude, denser on the darker belt, dusky poles,
// and the spot Hooke (1664) and Cassini (1665) recorded as a hatched oval with a firm
// outline, set off by a paper collar and laid with a thin carmine wash. The belts sit
// where the plain texture's zonal mean darkens; its storms are past a period telescope.

import package::antiqueLook::plateBodies::BodyPrint;
import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::inkLine;
import package::antiqueLook::engraving::stipple;
import package::antiqueLook::paper::vnoise;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::pigmentAt;

// Belts in degrees of latitude: south edge, north edge, tone. A belt's darkness is
// its line weight (`crossHatch` widens lines past tone 0.5), ranked by the plain
// texture's zonal luma: the North Equatorial (0.27), the South Equatorial's southern
// half (0.35) then northern (0.42), the North Temperate (0.37).
const BELTS = array<vec3<f32>, 4>(
  vec3<f32>(-19.5, -14.5, 0.66),
  vec3<f32>(-16.0, -7.5, 0.5),
  vec3<f32>(6.5, 17.5, 0.7),
  vec3<f32>(22.0, 25.0, 0.48),
);
// The temperate dusk: from these latitudes (S, N) at 0.56, deepening by 0.1 to 45°.
const DUSK = vec2<f32>(-31.0, 31.0);
// Past 58° the rings would close on the pole as a target: there they break up and give
// way to flicks of stipple drawn out along the latitude.
const CAP = vec2<f32>(58.0, 70.0);
// The shade lays thin strokes over a zone and swells a belt's own.
const SHADE = vec3<f32>(0.46, 0.4, 0.79); // zone share, belt swell, cap below the crossing set
// The spot's oval out to its pale collar on the plain texture, radians east and north;
// its north side drawn flatter, as the plain texture has it.
const SPOT_AXES = vec2<f32>(0.155, 0.084);
const SPOT_NORTH_POWER: f32 = 2.35;
const SPOT_TONE = vec2<f32>(0.58, 0.36); // core, rim
const SPOT_COLLAR: f32 = 1.2;
const SPOT_WASH: f32 = 0.3;

struct JupiterPrintIn {
  form: vec3<f32>, // along the bands (the shade's family too)
  spacing: f32,
  lat: f32, // radians
  shade: f32, // the plate's form tone
  ndv: f32,
  spotQ: f32, // `redSpotRadius`
  qPerUnit: f32, // its change per print unit
  p: vec2<f32>,
  pxUnits: f32,
}

// Radius of the Red Spot at the ball normal `n`, 1 on its outline, in its tangent plane
// at the spot's centre `spot` (`pole` the north pole). Far side: huge.
fn redSpotRadius(n: vec3<f32>, pole: vec3<f32>, spot: vec3<f32>) -> f32 {
  let east = normalize(cross(pole, spot));
  let facing = dot(n, spot);
  let o = abs(vec2<f32>(dot(n, east), dot(n, cross(spot, east))) / max(facing, 1e-3) / SPOT_AXES);
  let e = select(2.0, SPOT_NORTH_POWER, dot(n, cross(spot, east)) > 0.0);
  return select(1e3, pow(pow(o.x, e) + pow(o.y, e), 1.0 / e), facing > 0.2);
}

// Edges are sharp, so a belt's strokes start whole, never as one broken arriving line.
fn beltTone(latDeg: f32) -> f32 {
  let south = step(latDeg, DUSK.x) * (0.56 + 0.1 * smoothstep(DUSK.x, -45.0, latDeg));
  let north = step(DUSK.y, latDeg) * (0.56 + 0.1 * smoothstep(DUSK.y, 45.0, latDeg));
  var tone = max(south, north);
  for (var i = 0; i < 4; i++) {
    let b = BELTS[i];
    tone = max(tone, b.z * step(b.x, latDeg) * step(latDeg, b.y));
  }
  return tone;
}

fn jupiterPrint(col: vec3<f32>, cover: f32, j: JupiterPrintIn) -> BodyPrint {
  let q = j.spotQ * (1.0 + 0.03 * (vnoise(j.p * 0.008) - 0.5));
  let inside = 1.0 - smoothstep(0.97, 1.0, q);
  let latDeg = degrees(j.lat);
  // The cap's edge wanders, so the last rings fall apart along an uneven line.
  let cap = smoothstep(CAP.x, CAP.y, abs(latDeg) + 6.0 * (vnoise(j.p * 0.06) - 0.5));
  // The burin lifts out toward the lit limb.
  var belt = beltTone(latDeg) * smoothstep(1.0, SPOT_COLLAR, q) * mix(smoothstep(0.02, 0.2, j.ndv), 1.0, j.shade);
  belt = max(belt, mix(SPOT_TONE.x, SPOT_TONE.y, smoothstep(0.35, 0.95, q)) * inside);
  let swell = select(0.0, belt + SHADE.y * j.shade, belt > 0.0);
  let tone = min(max(SHADE.x * j.shade, swell), SHADE.z) * (1.0 - cap);
  var ink = crossHatch(j.form, j.p, tone, j.spacing, 0.0, j.pxUnits);
  ink = max(ink, stipple(j.p * vec2<f32>(0.6, 1.0), 2.6, cap * (0.15 + 0.3 * j.shade)));
  // The outline cut with the burin's pressure wandering along it.
  let width = 1.2 + 0.9 * vnoise(j.p * 0.04);
  ink = max(ink, inkLine(abs(q - 1.0) / max(j.qPerUnit, 1e-6), width, j.pxUnits));
  // A flat wash laid by hand: its edge wanders over the outline and it pools unevenly.
  let edge = 1.0 + 0.06 * (vnoise(j.p * 0.05) - 0.3);
  let wash = (1.0 - smoothstep(edge - 0.04, edge, q)) * (0.8 + 0.4 * vnoise(j.p * 0.02 + 7.0));
  return BodyPrint(applyWash(col, pigmentAt(4.0), SPOT_WASH * wash * cover), ink);
}
