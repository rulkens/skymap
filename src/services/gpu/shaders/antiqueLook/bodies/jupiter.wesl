// antiqueLook/bodies/jupiter.wesl — Jupiter as a careful 1660s hand drew what the
// plain render shows: burin lines along the latitude whose weight follows the texture's
// own darkness (belts swell, zones keep a light ruling, the night limb fills), the ovals
// and festoons a belt holds outlined where they stand out from their own latitude, and
// the spot Hooke (1664) and Cassini (1665) recorded: a hatched oval with a darker rim
// collar inside a firm outline, laid with rose madder pooling toward its core.

import package::antiqueLook::plateBodies::BodyPrint;
import package::antiqueLook::engraving::crossHatch;
import package::antiqueLook::engraving::inkLine;
import package::antiqueLook::paper::vnoise;
import package::antiqueLook::pigments::applyWash;
import package::antiqueLook::pigments::luma;
import package::antiqueLook::pigments::pigmentAt;

// The plain's lightness over the light round it (the brightest of a ring LIGHT_REACH of
// the radius out, so the limb's darkening divides out and the form's shade lays it back
// by convention): a zone's (1) and a belt's (0.85), and the tones they print at. Capped
// short of the widest burin and the crossing set: on a small globe they close into
// black, and a straight second set reads as a grid on the bands.
const TONE_OF_LUMA = vec4<f32>(0.97, 0.85, 0.12, 0.52); // zone, belt lightness; zone, belt tone
const LIGHT_REACH: f32 = 0.45;
const TONE_CAP = vec4<f32>(0.6, 0.72, 150.0, 400.0); // on a small globe, a large one; their disc px
// The plain already darkens toward the terminator: the form's shade only carries the
// night side past it, at this share.
const SHADE_SHARE: f32 = 0.55;
// The ring's light comes from nearer the centre, so the plain's limb darkening sinks a
// limb pixel's ratio: lifted by up to LIMB_LIFT.z from ndv LIMB_LIFT.x out to LIMB_LIFT.y.
// LIMB keeps the globe round: from ndv LIMB.x in to LIMB.y, LIMB.z more tone at the edge.
const LIMB_LIFT = vec3<f32>(0.4, 0.05, 0.06);
const LIMB = vec3<f32>(0.35, 0.05, 0.12);
// The burin drifts: a line wanders off true by up to WAVE.x of the spacing, over about
// 1 / WAVE.y units along the band, its neighbours with it.
const WAVE = vec2<f32>(0.8, 0.005);
// A feature is told from its belt by its luma against the band either side of it along
// the latitude, FEATURE_REACH × its scale away; the scale follows the disc (FEATURE_SCALE
// of the apparent radius), so a disc and a close-up outline the same ovals.
const FEATURE_SCALE = vec2<f32>(0.022, 3.0); // of the radius, at least this many px
const OUTLINE_SCALE = vec2<f32>(4.0, 7.0); // px: smaller, an outline would be a fleck
const FEATURE_REACH = vec2<f32>(1.6, 3.2);
const FEATURE_EDGE: f32 = 0.06; // a pale oval's lightness step its outline follows
// How much a feature's step over its band adds to its tone, so the lines swell and thin
// through a belt's own detail, not just with the belt's mean.
const FEATURE_RELIEF: f32 = 2.5;
// The spot's oval out to its pale collar on the plain texture, radians east and north;
// its north side drawn flatter, as the plain texture has it.
const SPOT_AXES = vec2<f32>(0.155, 0.084);
const SPOT_NORTH_POWER: f32 = 2.35;
const SPOT_CORE = vec2<f32>(0.4, 0.5); // the core's tone, and its share of the plain's
// The dark collar, rings cut round the oval as an engraver follows a form: from q
// SPOT_COLLAR.x out to .y, SPOT_RING_GAP of the hatching's spacing apart, swelling outward.
const SPOT_COLLAR = vec2<f32>(0.55, 1.0);
const SPOT_RING_GAP: f32 = 1.0;
const SPOT_WASH = vec2<f32>(0.1, 0.28); // rose madder at the collar, at the core
const ROSE_MADDER: f32 = 7.0; // `pigments.wesl`

struct JupiterPrintIn {
  form: vec3<f32>, // along the bands
  spacing: f32,
  shade: f32, // the plate's form tone
  spotQ: f32, // `redSpotRadius`
  qPerUnit: f32, // its change per print unit
  p: vec2<f32>,
  pxUnits: f32,
  ndv: f32,
  uv: vec2<f32>,
  pxUv: vec2<f32>, // one device px in uv
  across: vec2<f32>, // unit screen direction across the bands, toward the north
  discPx: f32, // apparent radius, device px
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

// The lightness an engraver reads off the colour: the belts' ochre and brown sit near
// the zones' white in luma, so the weakest channel weighs in, as saturation reads dark;
// the wash is linear, and its square root stands in for the eye's response.
fn plainLuma(wash: texture_2d_array<f32>, samp: sampler, layer: i32, uv: vec2<f32>) -> f32 {
  let c = textureSampleLevel(wash, samp, uv, layer, 0.0).rgb;
  return sqrt(max(mix(luma(c), min(c.r, min(c.g, c.b)), 0.5), 0.0));
}

fn jupiterPrint(col: vec3<f32>, cover: f32, j: JupiterPrintIn, wash: texture_2d_array<f32>, samp: sampler,
                layer: i32) -> BodyPrint {
  let scale = max(FEATURE_SCALE.x * j.discPx, FEATURE_SCALE.y);
  let along = vec2<f32>(-j.across.y, j.across.x) * scale * j.pxUv;
  // The feature's own lightness, smoothed at its scale, and its slope from the same taps.
  let e = scale * j.pxUv;
  let c = plainLuma(wash, samp, layer, j.uv);
  let xp = plainLuma(wash, samp, layer, j.uv + vec2<f32>(e.x, 0.0));
  let xm = plainLuma(wash, samp, layer, j.uv - vec2<f32>(e.x, 0.0));
  let yp = plainLuma(wash, samp, layer, j.uv + vec2<f32>(0.0, e.y));
  let ym = plainLuma(wash, samp, layer, j.uv - vec2<f32>(0.0, e.y));
  let l = (2.0 * c + xp + xm + yp + ym) / 6.0;
  let lPerUnit = length(vec2<f32>(xp - xm, yp - ym)) / scale * j.pxUnits;
  let band = 0.25 * (plainLuma(wash, samp, layer, j.uv + along * FEATURE_REACH.x)
    + plainLuma(wash, samp, layer, j.uv - along * FEATURE_REACH.x)
    + plainLuma(wash, samp, layer, j.uv + along * FEATURE_REACH.y)
    + plainLuma(wash, samp, layer, j.uv - along * FEATURE_REACH.y));
  var light = l;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    light = max(light, plainLuma(wash, samp, layer, j.uv + vec2<f32>(cos(a), sin(a)) * LIGHT_REACH * j.discPx * j.pxUv));
  }
  let feature = (l - band) / light;

  let ratio = c / light * (1.0 + LIMB_LIFT.z * smoothstep(LIMB_LIFT.x, LIMB_LIFT.y, j.ndv));
  let t = (TONE_OF_LUMA.x - ratio) / (TONE_OF_LUMA.x - TONE_OF_LUMA.y);
  let plain = TONE_OF_LUMA.z + t * (TONE_OF_LUMA.w - TONE_OF_LUMA.z) - FEATURE_RELIEF * feature;
  // A pale oval lies open in its belt.
  var tone = max(plain, TONE_OF_LUMA.z) * (1.0 - 0.8 * smoothstep(FEATURE_EDGE, FEATURE_EDGE + 0.05, feature));
  tone = max(tone + LIMB.z * smoothstep(LIMB.x, LIMB.y, j.ndv), SHADE_SHARE * j.shade);

  let q = j.spotQ * (1.0 + 0.03 * (vnoise(j.p * 0.008) - 0.5));
  let inside = 1.0 - smoothstep(0.97, 1.0, q);
  let core = SPOT_CORE.x + SPOT_CORE.y * (plain - SPOT_CORE.x);
  tone = mix(tone, core, inside);
  // The pale ring round the spot keeps the lightest ruling.
  tone = mix(tone, TONE_OF_LUMA.z, (1.0 - smoothstep(1.0, 1.2, q)) * (1.0 - inside));
  var form = j.form;
  form.x += WAVE.x * j.spacing * (vnoise(vec2<f32>(form.y * WAVE.y, form.x * 0.01)) - 0.5);
  let cap = mix(TONE_CAP.x, TONE_CAP.y, smoothstep(TONE_CAP.z, TONE_CAP.w, j.discPx));
  // The collar's rings swell outward, as the spot darkens to its rim; the core's own
  // lines stop at the first.
  let gap = SPOT_RING_GAP * j.spacing * j.qPerUnit;
  let collar = smoothstep(SPOT_COLLAR.x - gap, SPOT_COLLAR.y, q) * step(q, SPOT_COLLAR.y + 0.5 * gap);
  let banded = 1.0 - inside * smoothstep(SPOT_COLLAR.x - 0.3 * gap, SPOT_COLLAR.x, q);
  var ink = crossHatch(form, j.p, min(tone, cap), j.spacing, 0.0, j.pxUnits) * banded;
  let ring = abs(fract((SPOT_COLLAR.y - q) / gap + 0.5) - 0.5) * gap / max(j.qPerUnit, 1e-6);
  let lift = smoothstep(0.2, 0.32, vnoise(j.p * 0.025 + 11.0));
  ink = max(ink, inkLine(ring, (0.5 + 2.2 * collar) * (0.85 + 0.3 * vnoise(j.p * 0.06)) * lift, j.pxUnits) * collar);

  // The outlines of what stands out of its band, clear of the spot's own, the limb and
  // the terminator, where the light itself steps; the burin lifts off now and then.
  let wobble = (0.8 + 0.5 * vnoise(j.p * 0.05)) * smoothstep(0.25, 0.4, vnoise(j.p * 0.03 + 7.0));
  // Only the pale ones: a dark festoon or barge is cut as the swelling of its lines.
  let edge = abs(feature - FEATURE_EDGE) / max(lPerUnit / light, 1e-5);
  ink = max(ink, inkLine(edge, wobble, j.pxUnits) * smoothstep(1.1, 1.3, q) * smoothstep(0.15, 0.3, j.ndv)
    * (1.0 - smoothstep(0.15, 0.4, j.shade)) * smoothstep(OUTLINE_SCALE.x, OUTLINE_SCALE.y, scale));
  // The spot's outline cut with the burin's pressure wandering and lifting along it.
  let width = (0.8 + 0.8 * vnoise(j.p * 0.04)) * smoothstep(0.2, 0.35, vnoise(j.p * 0.02 + 3.0));
  ink = max(ink, inkLine(abs(q - 1.0) / max(j.qPerUnit, 1e-6), width, j.pxUnits));
  // Rose madder laid by hand: it pools at the core and thins out over the collar.
  let pool = mix(SPOT_WASH.y, SPOT_WASH.x, smoothstep(0.2, 0.8, q)) * (0.75 + 0.5 * vnoise(j.p * 0.035));
  let laid = (1.0 - smoothstep(0.85, 1.0, q + 0.06 * (vnoise(j.p * 0.05) - 0.5))) * pool;
  return BodyPrint(applyWash(col, pigmentAt(ROSE_MADDER), laid * cover), ink);
}
