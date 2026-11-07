// antiqueLook/bodies/earth.wesl — Earth as a globe-maker engraved it: land and sea
// left as paper and washed, every coast cut as one continuous line with water
// lines off it. Reads the land share its ocean mask fed the land row; Earth alone
// has water edges.

import package::antiqueLook::plateBodies::BodyPrint;
import package::antiqueLook::engraving::isoLines;
import package::antiqueLook::engraving::ISO_K;
import package::antiqueLook::engraving::ISO_SPACING;
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

// Its ground up close (`relief.wesl`'s texel `relief`, b its height phase), cut as the
// engravers of the 1600s shaded a form: lines that follow it round (Mellan's Moon, 1635;
// Merian's mountains), evenly spaced and swelling with the shade, the lit side and the
// plains left paper. Not contours: no line exists where the slope is lit. Below the mesh's
// ~km facets the relief lives in the imagery's own shading, so where the plain render
// `plain` is darker than its surroundings `around` a shaded slope cuts heavier; an engraver
// toned what he saw. The sea is the coast's and the water lines'.
const EARTH_SHADE_INK: f32 = 0.75;
const EARTH_DETAIL_INK: f32 = 0.3;
// The shade's share over which lines arrive and swell to their full width.
const EARTH_SHADE_BAND = vec2<f32>(0.08, 0.55);

fn earthRelief(field: texture_2d<f32>, px: vec2<f32>, relief: vec4<f32>, unit: f32, plain: f32, around: f32) -> f32 {
  if (relief.a <= 0.0) {
    return 0.0;
  }
  let detail = clamp((around - plain) / max(around, 1e-3) * 2.0, 0.0, 1.0);
  let share = EARTH_SHADE_INK * relief.a + EARTH_DETAIL_INK * detail * min(relief.a * 4.0, 1.0);
  let tone = 0.85 * smoothstep(EARTH_SHADE_BAND.x, EARTH_SHADE_BAND.y, share);
  let ip = vec2<i32>(px);
  let hx = wrapStep(textureLoad(field, ip + vec2<i32>(1, 0), 0).b, textureLoad(field, ip - vec2<i32>(1, 0), 0).b);
  let hy = wrapStep(textureLoad(field, ip + vec2<i32>(0, 1), 0).b, textureLoad(field, ip - vec2<i32>(0, 1), 0).b);
  let hPerUnit = 0.5 * length(vec2<f32>(hx, hy)) * unit;
  // A face seen edge-on crowds even the coarsest lines past ISO_SPACING: fade them rather
  // than alias. A zero tone would still leave isoLines' sub-pixel hairline.
  let crowd = hPerUnit * ISO_K * ISO_SPACING;
  let keep = smoothstep(0.0, 0.15, tone) * (1.0 - smoothstep(1.0, 2.0, crowd));
  if (keep <= 0.0) {
    return 0.0;
  }
  return min(isoLines(relief.b, max(hPerUnit, 1e-6), tone, 1.0 / unit), 1.0) * keep;
}

// The step between two height phases across their wrap.
fn wrapStep(a: f32, b: f32) -> f32 {
  let d = a - b;
  return d - round(d);
}
