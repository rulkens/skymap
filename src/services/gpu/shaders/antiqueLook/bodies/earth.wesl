// antiqueLook/bodies/earth.wesl — Earth as a globe-maker engraved it: land and sea
// left as paper and washed, every coast cut as one continuous line with water
// lines off it. Reads the land share its ocean mask fed the land row; Earth alone
// has water edges.

import package::antiqueLook::plateBodies::BodyPrint;
import package::antiqueLook::engraving::seaDistance;
import package::antiqueLook::engraving::waterLines;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::pigmentAt;

// What the plate hands the module, in print units but for the shares.
struct EarthPrintIn {
  p: vec2<f32>,
  pxUnits: f32,
  unit: f32,
  tone: f32,
  // The land share at the pixel, and its change per device px.
  landShare: f32,
  landPerPx: f32,
  // The share a little displaced by the colourist's slip, for the washes.
  washShare: f32,
  // The blurred share, and its inversion to a distance off the coast.
  blurredShare: f32,
  seaD: f32,
  seaPerUnit: f32,
  // The geography row's texel: r realm code (0 none, else pigment + 1), g border
  // band, b border and river ink, a sign ink.
  geo: vec4<f32>,
}

// `cover` scales the washes: body coverage times the plate's inside.
fn earthPrint(col: vec3<f32>, cover: f32, e: EarthPrintIn) -> BodyPrint {
  let ocean = 1.0 - smoothstep(0.35, 0.65, e.landShare);
  let coastPx = abs(e.landShare - 0.5) / e.landPerPx;
  let coast = 1.0 - smoothstep(0.55 * e.unit, 0.55 * e.unit + 1.0, coastPx);
  let waterFade = ocean * (1.0 - smoothstep(0.35, 0.8, e.tone));
  var water = 0.0;
  if (waterFade > 0.0) {
    water = waterLines(e.p, e.seaD, e.seaPerUnit, e.pxUnits) * waterFade;
  }
  // Seas mostly paper, as Dutch colourists left them, smalt pooled along the
  // shore; land in Dutch outline colour, a band along each coast fading inward
  // to paper. The colourist's wash stops a little off the cut coast, by a slow wander.
  let near = clamp(1.0 - e.seaD / 16.0, 0.0, 1.0);
  let inland = seaDistance(1.0 - e.blurredShare);
  let seaWash = (0.03 + 0.17 * pow(near, 1.5)) * (1.0 - smoothstep(0.35, 0.65, e.washShare));
  // Each realm takes its own pigment along its coasts and its borders alike.
  let code = i32(round(e.geo.r * 255.0));
  let realm = code >= 1 && code <= 7;
  let land = smoothstep(0.35, 0.6, e.washShare);
  let coastBand = clamp(1.0 - inland / 14.0, 0.0, 1.0);
  let band = select(coastBand, max(coastBand, e.geo.g * e.geo.g), realm);
  let pigment = select(pigmentAt(2.0), pigmentAt(f32(code - 1)), realm);
  var washed = applyWash(col, pigmentAt(5.0), seaWash * cover);
  washed = applyWash(washed, pigment, 0.5 * land * band * cover);
  // A sign's alpha is half its paper plus half its ink (`sign.wesl`): the paper clears
  // the engraving under the sign, the ink prints over it.
  let signInk = clamp(2.0 * e.geo.a - 1.0, 0.0, 1.0);
  let signPaper = clamp(2.0 * e.geo.a, 0.0, 1.0);
  let lines = max(max(coast, water * 0.9), e.geo.b * smoothstep(0.2, 0.5, e.landShare));
  return BodyPrint(washed, max(lines * (1.0 - signPaper), signInk));
}
