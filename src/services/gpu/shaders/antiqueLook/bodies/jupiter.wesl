// antiqueLook/bodies/jupiter.wesl — Jupiter as the 1660s telescopes showed it: a few
// smooth belts of hatching along the latitude, denser on the darker belt, dusky poles,
// and the spot Hooke (1664) and Cassini (1665) recorded as a hatched oval with a firm
// outline, set off by a paper collar and laid with a thin carmine wash. The belts sit
// where the plain texture's zonal mean darkens; its storms are past a period telescope.

import package::antiqueLook::plateBodies::BodyPrint;
import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::inkLine;
import package::antiqueLook::paper::vnoise;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::pigmentAt;

// Belts in degrees of latitude: south edge, north edge, darkness, edge softness;
// darkness is smoothstep(0.62, 0.27) of the zonal luma, so the South Equatorial
// (0.35–0.43) prints lighter than the North (0.27).
const BELTS = array<vec4<f32>, 3>(
  vec4<f32>(-19.5, -7.5, 0.65, 1.5),
  vec4<f32>(6.5, 17.5, 1.0, 1.5),
  vec4<f32>(22.0, 25.0, 0.65, 1.0),
);
// The polar dusk deepens from these latitudes (S, N) to 45°, up to this darkness.
const POLES = vec3<f32>(-29.0, 30.0, 0.75);
const BELT_TONE: f32 = 0.6;
const BELT_HATCH: f32 = 3.2;
// The spot's oval out to its pale collar on the plain texture, radians east and north.
const SPOT_AXES = vec2<f32>(0.155, 0.084);
// Its tone from the core (heavy lines, never crossed) out to the rim.
const SPOT_TONE = vec2<f32>(0.76, 0.36);
const SPOT_COLLAR: f32 = 1.35;
const SPOT_WASH: f32 = 0.3;

// Elliptical radius of the Red Spot at the ball normal `n`: 1 on its outline, in its
// tangent plane at the spot's centre `spot` (`pole` the north pole). Far side: huge.
fn redSpotRadius(n: vec3<f32>, pole: vec3<f32>, spot: vec3<f32>) -> f32 {
  let east = normalize(cross(pole, spot));
  let facing = dot(n, spot);
  let off = vec2<f32>(dot(n, east), dot(n, cross(spot, east))) / max(facing, 1e-3);
  return select(1e3, length(off / SPOT_AXES), facing > 0.2);
}

fn beltDarkness(latDeg: f32) -> f32 {
  var dark = POLES.z * max(smoothstep(POLES.y, 45.0, latDeg), smoothstep(POLES.x, -45.0, latDeg));
  for (var i = 0; i < 3; i++) {
    let b = BELTS[i];
    dark = max(dark, b.z * smoothstep(b.x - b.w, b.x + b.w, latDeg) * (1.0 - smoothstep(b.y - b.w, b.y + b.w, latDeg)));
  }
  return dark;
}

// `form` hatches along the latitude `lat` (radians); `q` is `redSpotRadius`, `qPerUnit`
// its change per print unit; `cover` scales the wash.
fn jupiterPrint(col: vec3<f32>, cover: f32, form: vec3<f32>, lat: f32, q: f32, qPerUnit: f32,
                p: vec2<f32>, pxUnits: f32) -> BodyPrint {
  var tone = BELT_TONE * beltDarkness(degrees(lat)) * smoothstep(1.0, SPOT_COLLAR, q);
  let inside = 1.0 - smoothstep(0.97, 1.0, q);
  tone = max(tone, mix(SPOT_TONE.x, SPOT_TONE.y, smoothstep(0.35, 0.95, q)) * inside);
  var ink = crossHatch(form, p, tone, BELT_HATCH, 0.0, pxUnits);
  // The outline cut with the burin's pressure wandering along it.
  let width = 1.2 + 0.9 * vnoise(p * 0.04);
  ink = max(ink, inkLine(abs(q - 1.0) / max(qPerUnit, 1e-6), width, pxUnits));
  // A flat wash laid by hand: its edge wanders over the outline and it pools unevenly.
  let edge = 1.0 + 0.06 * (vnoise(p * 0.05) - 0.3);
  let wash = (1.0 - smoothstep(edge - 0.04, edge, q)) * (0.8 + 0.4 * vnoise(p * 0.02 + 7.0));
  return BodyPrint(applyWash(col, pigmentAt(4.0), SPOT_WASH * wash * cover), ink);
}
