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
// by convention): a zone's (1) and a belt's (0.86), and the tones they print at. Capped
// short of the widest burin and the crossing set: on a small globe they close into
// black, and a straight second set reads as a grid on the bands.
const TONE_OF_LUMA = vec3<f32>(0.99, 0.86, 0.58); // zone, belt lightness; belt tone
const LIGHT_REACH: f32 = 0.45;
// A small globe (under SMALL_GLOBE.x disc px; a large one over .y) is cut plainer, or
// its lines shimmer and close up: up to SPARSE times wider set, its zones near paper.
const SMALL_GLOBE = vec2<f32>(150.0, 400.0);
const SPARSE: f32 = 1.6;
const ZONE_TONE = vec2<f32>(0.05, 0.12); // on a small globe, a large one
const TONE_CAP = vec2<f32>(0.68, 0.72);
// The plain already darkens toward the terminator: the form's shade only carries the
// night side past it, at this share.
const SHADE_SHARE: f32 = 0.55;
// The ring's light comes from nearer the centre, so the plain's limb darkening sinks a
// limb pixel's ratio: lifted by up to LIMB_LIFT.z from ndv LIMB_LIFT.x out to LIMB_LIFT.y.
// LIMB keeps the globe round: from ndv LIMB.x in to LIMB.y, LIMB.z more tone at the edge.
const LIMB_LIFT = vec3<f32>(0.4, 0.05, 0.06);
const LIMB = vec3<f32>(0.35, 0.05, 0.06);
// The burin drifts: a line wanders off true by up to WAVE.x of the spacing, over about
// 1 / WAVE.y units along the band, its neighbours with it; the gaps between lines open
// and close by up to WAVE.z of the spacing over a few lines; and a line bends round what stands
// out of the band, FLOW spacings per unit of the feature's lightness step, so the
// festoons and ovals show as the lines' own swirl.
const WAVE = vec3<f32>(0.8, 0.005, 1.4);
const FLOW: f32 = 6.0;
// A feature is told from its belt by its luma against the band either side of it along
// the latitude, FEATURE_REACH × its scale away; the scale follows the disc (FEATURE_SCALE
// of the apparent radius), so a disc and a close-up outline the same ovals.
const FEATURE_SCALE = vec2<f32>(0.022, 3.0); // of the radius, at least this many px
const DETAIL_SCALE = vec2<f32>(4.0, 7.0); // px: smaller, an outline is a fleck and a bend a tremor
const FEATURE_REACH: f32 = 2.4;
// The lightness step a pale oval's outline follows, and a dark one's: only the darkest
// (a barge, a ringed oval's rim) are outlined, the rest of a festoon is its lines' swelling.
const FEATURE_EDGE = vec2<f32>(0.07, 0.1);
// How much a feature's step over its band adds to its tone, so the lines swell and thin
// through a belt's own detail, not just with the belt's mean.
const FEATURE_RELIEF: f32 = 3.5;
// The spot's oval out to its pale collar on the plain texture, radians east and north;
// its north side drawn flatter, as the plain texture has it.
const SPOT_AXES = vec2<f32>(0.155, 0.084);
const SPOT_NORTH_POWER: f32 = 2.35;
const SPOT_CORE = vec2<f32>(0.56, 0.7); // the core's tone, and its share of the plain's
// The dark collar: a thin broken ring inside the outline, from q SPOT_COLLAR.x out to .y,
// SPOT_RING_GAP of the hatching's spacing apart.
const SPOT_COLLAR = vec2<f32>(0.9, 1.0);
const SPOT_RING_GAP: f32 = 1.3;
const SPOT_NEAR: f32 = 1.3; // past this q nothing of the spot's is drawn
const SPOT_WASH = vec2<f32>(0.05, 0.22); // rose madder at the collar, at the core
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
  let along = vec2<f32>(-j.across.y, j.across.x) * scale * FEATURE_REACH * j.pxUv;
  // The feature's own lightness, smoothed at its scale, and its slope from the same taps.
  let e = scale * j.pxUv;
  let c = plainLuma(wash, samp, layer, j.uv);
  let xp = plainLuma(wash, samp, layer, j.uv + vec2<f32>(e.x, 0.0));
  let xm = plainLuma(wash, samp, layer, j.uv - vec2<f32>(e.x, 0.0));
  let yp = plainLuma(wash, samp, layer, j.uv + vec2<f32>(0.0, e.y));
  let ym = plainLuma(wash, samp, layer, j.uv - vec2<f32>(0.0, e.y));
  let l = (2.0 * c + xp + xm + yp + ym) / 6.0;
  let lPerUnit = length(vec2<f32>(xp - xm, yp - ym)) / scale * j.pxUnits;
  let band = 0.5 * (plainLuma(wash, samp, layer, j.uv + along) + plainLuma(wash, samp, layer, j.uv - along));
  // The light is sought across the bands, where the zones are.
  let reach = j.across * LIGHT_REACH * j.discPx * j.pxUv;
  let light = max(max(l, max(plainLuma(wash, samp, layer, j.uv + reach), plainLuma(wash, samp, layer, j.uv - reach))),
    max(plainLuma(wash, samp, layer, j.uv + 0.5 * reach), plainLuma(wash, samp, layer, j.uv - 0.5 * reach)));
  let feature = (l - band) / light;

  let ratio = c / light * (1.0 + LIMB_LIFT.z * smoothstep(LIMB_LIFT.x, LIMB_LIFT.y, j.ndv));
  let big = smoothstep(SMALL_GLOBE.x, SMALL_GLOBE.y, j.discPx);
  let zone = mix(ZONE_TONE.x, ZONE_TONE.y, big);
  let t = (TONE_OF_LUMA.x - ratio) / (TONE_OF_LUMA.x - TONE_OF_LUMA.y);
  let plain = zone + t * (TONE_OF_LUMA.z - zone) - FEATURE_RELIEF * feature;
  // A pale oval lies open in its belt.
  var tone = max(plain, zone) * (1.0 - 0.8 * smoothstep(FEATURE_EDGE.x, FEATURE_EDGE.x + 0.05, feature));
  tone = max(tone + LIMB.z * smoothstep(LIMB.x, LIMB.y, j.ndv), SHADE_SHARE * j.shade);
  let detail = smoothstep(DETAIL_SCALE.x, DETAIL_SCALE.y, scale);
  let spacing = j.spacing * mix(SPARSE, 1.0, big);
  var form = j.form;
  form.x += spacing * (WAVE.x * (vnoise(vec2<f32>(form.y * WAVE.y, form.x * 0.01)) - 0.5)
    + WAVE.z * (vnoise(vec2<f32>(form.x / spacing * 0.15, 3.0)) - 0.5) + FLOW * detail * feature);

  // Near the spot only: its core, its collar's rings, its outline and its wash.
  let near = j.spotQ < SPOT_NEAR;
  var q = j.spotQ;
  var banded = 1.0;
  if (near) {
    q *= 1.0 + 0.03 * (vnoise(j.p * 0.008) - 0.5);
    let inside = 1.0 - smoothstep(0.97, 1.0, q);
    tone = mix(tone, SPOT_CORE.x + SPOT_CORE.y * (plain - SPOT_CORE.x), inside);
    // The pale ring round the spot keeps the lightest ruling; the core's own lines stop
    // at the collar's first ring.
    tone = mix(tone, zone, (1.0 - smoothstep(1.0, 1.2, q)) * (1.0 - inside));
    banded = 1.0 - inside * smoothstep(SPOT_COLLAR.x - 0.3 * SPOT_RING_GAP * spacing * j.qPerUnit, SPOT_COLLAR.x, q);
  }
  var ink = crossHatch(form, j.p, min(tone, mix(TONE_CAP.x, TONE_CAP.y, big)), spacing, 0.0, j.pxUnits) * banded;
  var laid = 0.0;
  if (near) {
    // The collar's rings swell outward, as the spot darkens to its rim.
    let gap = SPOT_RING_GAP * spacing * j.qPerUnit;
    let collar = smoothstep(SPOT_COLLAR.x - gap, SPOT_COLLAR.y, q) * step(q, SPOT_COLLAR.y + 0.5 * gap);
    let ring = abs(fract((SPOT_COLLAR.y - q) / gap + 0.5) - 0.5) * gap / max(j.qPerUnit, 1e-6);
    let lift = smoothstep(0.3, 0.45, vnoise(j.p * 0.03 + 11.0));
    ink = max(ink, inkLine(ring, (0.9 + 1.8 * collar) * (0.85 + 0.3 * vnoise(j.p * 0.06)) * lift, j.pxUnits) * collar);
    // The outline cut with the burin's pressure wandering and lifting along it.
    let width = (1.3 + 1.2 * vnoise(j.p * 0.03)) * smoothstep(0.15, 0.3, vnoise(j.p * 0.02 + 3.0)) * mix(0.5, 1.0, big);
    ink = max(ink, inkLine(abs(q - 1.0) / max(j.qPerUnit, 1e-6), width, j.pxUnits));
    // Rose madder laid by hand: it pools where the core is darkest and thins out over
    // the collar, granular as watercolour on laid paper.
    let grain = (0.6 + 0.8 * vnoise(j.p * 0.035)) * (0.7 + 0.6 * vnoise(j.p * 0.3));
    let pool = mix(SPOT_WASH.y, SPOT_WASH.x, smoothstep(0.2, 0.8, q)) * grain * (0.6 + 0.8 * clamp(t, 0.0, 1.0));
    laid = (1.0 - smoothstep(0.85, 1.0, q + 0.06 * (vnoise(j.p * 0.05) - 0.5))) * pool;
  }

  // The outlines of what stands out of its band, clear of the spot's own, the limb and
  // the terminator, where the light itself steps; the burin lifts off now and then.
  if (detail > 0.0 && q > 1.1 && j.ndv > 0.15 && j.shade < 0.4) {
    let wobble = (0.8 + 0.5 * vnoise(j.p * 0.05)) * smoothstep(0.25, 0.4, vnoise(j.p * 0.03 + 7.0));
    let offEdge = select(feature - FEATURE_EDGE.x, -feature - FEATURE_EDGE.y, feature < 0.0);
    let edge = abs(offEdge) / max(lPerUnit / light, 1e-5);
    ink = max(ink, inkLine(edge, wobble, j.pxUnits) * smoothstep(1.1, 1.3, q) * smoothstep(0.15, 0.3, j.ndv)
      * (1.0 - smoothstep(0.15, 0.4, j.shade)) * detail);
  }
  return BodyPrint(applyWash(col, pigmentAt(ROSE_MADDER), laid * cover), ink);
}
