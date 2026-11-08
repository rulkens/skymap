// antiqueLook/engraving.wesl — copperplate marks: burin hatching on a ladder of
// four line widths (no grey, no continuous swell), a second set only in the
// deepest shade, ring and water lines, and stipple for diffuse light. All in
// print units; every mark anti-aliases analytically from `pxUnits` (units per
// device px), so none takes a derivative and all may run inside a branch.

import package::antiqueLook::paper::vnoise;
import package::lib::util::hash21Hq;

const BURIN = vec4<f32>(1.0, 1.6, 2.3, 3.0); // the four line widths, print units

// Bit-reversed rank of line k among each 8: the order in which lines arrive.
fn rank8(k: f32) -> f32 {
  let m = i32(k) & 7;
  return f32(((m & 1) << 2) | (m & 2) | ((m & 4) >> 2));
}

// A line never prints under one device pixel: thinner reads as grey, not ink.
fn inkLine(dUnits: f32, width: f32, pxUnits: f32) -> f32 {
  let w = max(width, pxUnits);
  return 1.0 - smoothstep(0.5 * (w - pxUnits), 0.5 * (w + pxUnits), dUnits);
}

// Lines at phase = k*spacing; form = (phase, along, grad), grad = |d phase / d
// screen unit| (1 when straight). alive = lines per 8 that exist (0..9.7): they
// arrive in rank order, the fraction tapers the newest, the jitter staggers ends.
fn lineFamily(form: vec3<f32>, spacing: f32, alive: f32, width: f32, pxUnits: f32, seed: f32) -> f32 {
  let v = form.x / spacing + 0.18 * (vnoise(vec2<f32>(form.y * 0.02 + seed, form.x * 0.04)) - 0.5);
  let k = floor(v);
  let g = max(form.z, 1.0);
  let d = abs(fract(v) - 0.5) * spacing / max(form.z, 1e-3);
  // Crowded lines (a compressed limb) drop out by rank before they merge, and thin.
  let keep = min(alive, 13.6 / g);
  let t = clamp(keep - rank8(k) - 0.7 * hash21Hq(vec2<f32>(k, seed)), 0.0, 1.0);
  let swell = 0.88 + 0.24 * vnoise(vec2<f32>(form.y * 0.04, k * 3.7 + seed));
  let local = spacing / g * 8.0 / clamp(keep, 1.0, 8.0);
  let hw = min(0.5 * width * t * swell, 0.36 * local);
  return (1.0 - smoothstep(hw - 0.5 * pxUnits, hw + 0.5 * pxUnits, d)) * step(0.15 * pxUnits, hw);
}

// Lines arrive over tone 0.06..0.42, then step through the four widths at 0.5,
// 0.63 and 0.76. The second set, 27° off, straight and only past 0.8, makes long
// lozenges, never a lattice. An ink DENSITY: a crossing prints darker (Beer's law).
fn crossHatch(form: vec3<f32>, p: vec2<f32>, tone: f32, spacing: f32, baseAngle: f32, pxUnits: f32) -> f32 {
  let s = smoothstep(vec3<f32>(0.465, 0.595, 0.725), vec3<f32>(0.535, 0.665, 0.795), vec3<f32>(tone));
  let w1 = BURIN.x + dot(s, BURIN.yzw - BURIN.xyz);
  // The families run only where their lines exist: most of a lit globe is paper.
  var ink = 0.0;
  if (tone > 0.06) {
    ink = lineFamily(form, spacing, clamp((tone - 0.06) / 0.04, 0.0, 9.7), w1, pxUnits, 0.0);
  }
  if (tone > 0.8) {
    let a = baseAngle + 0.47;
    let n = vec2<f32>(-sin(a), cos(a));
    let w2 = mix(BURIN.x, BURIN.y, smoothstep(0.92, 0.97, tone));
    ink += lineFamily(vec3<f32>(dot(p, n), dot(p, vec2<f32>(n.y, -n.x)), 1.0), spacing * 1.15,
                      clamp((tone - 0.8) / 0.025, 0.0, 9.7), w2, pxUnits, 5.3);
  }
  return min(ink, 1.05);
}

// Tone from the form: paper on the lit crown, full past the terminator but for the
// reflected light along the limb, the period convention that keeps a dark side round.
fn formTone(ndl: f32, ndv: f32) -> f32 {
  let rim = 1.0 - smoothstep(0.0, 0.5, ndv);
  return 1.0 - smoothstep(-0.1, 0.5, ndl) - 0.5 * rim * smoothstep(0.05, -0.25, ndl);
}

// A ring as four ellipses: e = (C inner, B inner, Cassini mid, A outer) in body
// radii, rhoPerUnit = |d rho / d screen unit|; the dim C ring is one dotted hairline.
fn ringLines(rho: f32, rhoPerUnit: f32, e: vec4<f32>, p: vec2<f32>, pxUnits: f32) -> f32 {
  let s = 1.0 / max(rhoPerUnit, 1e-6);
  var ink = inkLine(abs(rho - e.x) * s, 0.6, pxUnits);
  ink = max(ink, inkLine(abs(rho - e.y) * s, 1.0, pxUnits));
  ink = max(ink, inkLine(abs(rho - e.w) * s, 1.3, pxUnits));
  ink = max(ink, inkLine(abs(rho - e.z) * s, 2.0, pxUnits));
  let dots = step(fract((p.x + p.y) * 0.33), 0.5);
  return max(ink, inkLine(abs(rho - 0.5 * (e.x + e.y)) * s, 0.6, pxUnits) * dots);
}

// The land-blur pass's sigma, print units (`landBlur.wesl`).
const LAND_SIGMA: f32 = 6.0;

// `wash.a` on a body no land map covers (`reduce.wesl`): above any share, so
// `landWeight` drops it as it drops the sky's −1, and no coast is cut there.
const LAND_UNMAPPED: f32 = 2.0;

fn landWeight(a: f32) -> f32 {
  return step(0.0, a) * step(a, 1.0);
}

// Blurring a straight coast gives a normal CDF, so the blurred land share inverts
// to a distance off the coast: d = -sigma * probit(share), with Giles' erfinv
// (central branch, share >= 0.01). Positive at sea; land is seaDistance(1 - share).
fn seaDistance(share: f32) -> f32 {
  let x = 2.0 * clamp(share, 0.01, 0.5) - 1.0;
  let w = -log((1.0 - x) * (1.0 + x)) - 2.5;
  var q = 2.81022636e-08;
  q = 3.43273939e-07 + q * w;
  q = -3.5233877e-06 + q * w;
  q = -4.39150654e-06 + q * w;
  q = 0.00021858087 + q * w;
  q = -0.00125372503 + q * w;
  q = -0.00417768164 + q * w;
  q = 0.246640727 + q * w;
  q = 1.50140941 + q * w;
  return -LAND_SIGMA * 1.41421356 * q * x;
}

const WATER_D = vec4<f32>(2.0, 4.6, 7.8, 11.8); // offsets off the coast, units
const WATER_W = vec4<f32>(0.9, 0.75, 0.6, 0.5);

// The Dutch water lines: four lines following the coast out to sea, spaced wider
// and thinner seaward, wobbling by hand, the outer ones breaking up.
fn waterLines(p: vec2<f32>, seaD: f32, dPerUnit: f32, pxUnits: f32) -> f32 {
  let d = seaD + (vnoise(p * 0.06) - 0.5) * (0.3 + 0.08 * seaD);
  let offsets = WATER_D;
  let widths = WATER_W;
  var ink = 0.0;
  for (var k = 0; k < 4; k++) {
    let whole = step(0.15 * f32(k), vnoise(p * 0.09 + vec2<f32>(f32(k) * 13.1, 0.0)));
    ink = max(ink, inkLine(abs(d - offsets[k]) / max(dPerUnit, 0.3), widths[k], pxUnits) * whole);
  }
  return ink;
}

// Jittered-grid dots: the dot AREA tracks the tone, as in stipple engraving.
fn stipple(p: vec2<f32>, cell: f32, tone: f32) -> f32 {
  let c = floor(p / cell);
  var ink = 0.0;
  for (var j = 0; j <= 1; j++) {
    for (var i = 0; i <= 1; i++) {
      let k = c + vec2<f32>(f32(i), f32(j)) - vec2<f32>(0.5);
      let kc = floor(k + 0.5);
      let centre = (kc + vec2<f32>(hash21Hq(kc), hash21Hq(kc + 17.3))) * cell;
      let r = sqrt(clamp(tone, 0.0, 1.0)) * cell * 0.52;
      let d = length(p - centre);
      ink = max(ink, 1.0 - smoothstep(r - 0.45, r + 0.45, d));
    }
  }
  return ink * step(0.02, tone);
}

// Jittered dots of one radius, each kept with probability `share`: density
// shows as dot count, thinning to bare paper, where `stipple` swells the dots.
fn scatter(p: vec2<f32>, cell: f32, share: f32, radius: f32) -> f32 {
  let c = floor(p / cell - 0.5);
  var ink = 0.0;
  for (var k = 0; k < 4; k++) {
    let kc = c + vec2<f32>(f32(k & 1), f32(k >> 1u));
    let centre = (kc + 0.2 + 0.6 * vec2<f32>(hash21Hq(kc), hash21Hq(kc + 17.3))) * cell;
    let kept = step(hash21Hq(kc + 41.7), share);
    ink = max(ink, kept * (1.0 - smoothstep(radius - 0.45, radius + 0.45, length(p - centre))));
  }
  return ink;
}

// Dots that thin out by count to bare paper and grow with the tone until they nearly
// merge, so a tone reads up to a dense core where `stipple`'s one dot per cell leaves
// paper; each dot's size varies by a quarter either way, as a punch's did.
fn stippleDense(p: vec2<f32>, cell: f32, tone: f32, pxUnits: f32) -> f32 {
  let c = floor(p / cell - 0.5);
  let r0 = cell * (0.24 + 0.42 * smoothstep(0.1, 1.0, tone));
  var ink = 0.0;
  for (var k = 0; k < 4; k++) {
    let kc = c + vec2<f32>(f32(k & 1), f32(k >> 1u));
    let centre = (kc + 0.1 + 0.8 * vec2<f32>(hash21Hq(kc), hash21Hq(kc + 17.3))) * cell;
    let kept = step(0.55 * hash21Hq(kc + 41.7), tone);
    let r = r0 * (0.75 + 0.5 * hash21Hq(kc + 63.1));
    ink = max(ink, kept * (1.0 - smoothstep(r - 0.5 * pxUnits, r + 0.5 * pxUnits, length(p - centre))));
  }
  return ink * step(0.02, tone);
}

// Iso-lines of a scalar field, after Mellan's single swelling line: ISO_K lines
// per unit of `h`, refined by octaves so they stay ~ISO_SPACING units apart at any
// gradient. Lines sit at integer multiples, so octave n+1 holds every line of n
// and the blend only fades the in-between ones: nothing pops on a zoom. Half-width
// swells with `tone` to ISO_WIDTH of the spacing (72% cover: paper always shows).
const ISO_K: f32 = 4.0;
const ISO_SPACING: f32 = 3.4;
const ISO_WIDTH: f32 = 0.36;

fn isoLines(h: f32, hPerUnit: f32, tone: f32, pxUnits: f32) -> f32 {
  let o = clamp(log2(1.0 / (ISO_K * hPerUnit * ISO_SPACING)), 0.0, 6.0);
  let o0 = floor(o);
  let hw = tone * ISO_SPACING * ISO_WIDTH;
  var ink = 0.0;
  for (var n = 0; n < 2; n++) {
    let k = ISO_K * exp2(o0 + f32(n));
    let d = abs(fract(h * k + 0.5) - 0.5) / (k * hPerUnit);
    let weight = select(1.0 - (o - o0), o - o0, n == 1);
    ink += weight * (1.0 - smoothstep(hw - 0.5 * pxUnits, hw + 0.5 * pxUnits, d));
  }
  return ink;
}

// Hachures by line-integral convolution (Cabral & Leedom 1993): `field.b`, a noise
// pinned to the ground, averaged along the streamline of the screen fall line
// `field.rg`, FALL_TAPS each way FALL_STEP print units apart, tent-weighted. A streamline stops
// where the field has no line (a halo, the sky), so no stroke crosses a profile.
// `across` follows the contour instead: the deep shade's second set. In units of the
// convolved noise's spread on `relief.wesl`'s lattice, FALL_SIGMA (simulated: 8 taps
// 2.25 apart spread as 12 taps 1.5 apart did, so the strokes keep their 18-unit reach).
const FALL_TAPS: i32 = 8;
const FALL_STEP: f32 = 2.25;
const FALL_SIGMA: f32 = 0.123;

fn fallLines(field: texture_2d<f32>, samp: sampler, px: vec2<f32>, unit: f32, across: bool) -> f32 {
  let res = vec2<f32>(textureDimensions(field));
  let c = textureSampleLevel(field, samp, px / res, 0.0);
  var sum = c.b;
  var weight = 1.0;
  for (var side = 0; side < 2; side++) {
    var q = px;
    var d = select(c.rg, vec2<f32>(-c.g, c.r), across) * select(-1.0, 1.0, side == 1);
    for (var k = 1; k <= FALL_TAPS; k++) {
      q += d * (FALL_STEP * unit);
      let s = textureSampleLevel(field, samp, q / res, 0.0);
      let len = length(s.rg);
      if (len < 0.5) {
        break;
      }
      let next = select(s.rg, vec2<f32>(-s.g, s.r), across) / len;
      d = select(next, -next, dot(next, d) < 0.0);
      let w = 1.0 - f32(k) / f32(FALL_TAPS + 1);
      sum += s.b * w;
      weight += w;
    }
  }
  return sum / weight / FALL_SIGMA;
}

// A crest or a rim: the fall line `field.rg` points out of the pixel both ways along a
// screen axis, CREST_REACH units off (so the line is ~2 × CREST_REACH wide) and again
// CREST_PROBE units off, where both taps lie on a landform (`field.a` > 0; the crest
// itself is too flat to be one), so the ground's noise on a plain draws none. The line
// runs on unbroken where hachures, cut from noise, would leave gaps. Two axes suffice:
// a crest at 45° crosses both.
const CREST_REACH: f32 = 0.7;
const CREST_PROBE: f32 = 3.0;

fn outward(field: texture_2d<f32>, samp: sampler, px: vec2<f32>, e: vec2<f32>, res: vec2<f32>) -> vec2<f32> {
  let ahead = textureSampleLevel(field, samp, (px + e) / res, 0.0);
  let behind = textureSampleLevel(field, samp, (px - e) / res, 0.0);
  let d = normalize(e);
  let landform = step(0.5, min(length(ahead.rg), length(behind.rg))) * step(0.0, min(ahead.a, behind.a));
  return vec2<f32>(min(dot(ahead.rg, d), -dot(behind.rg, d)), landform);
}

fn fallCrest(field: texture_2d<f32>, samp: sampler, px: vec2<f32>, unit: f32) -> f32 {
  let res = vec2<f32>(textureDimensions(field));
  var crest = 0.0;
  for (var k = 0; k < 2; k++) {
    let e = vec2<f32>(f32(1 - k), f32(k)) * unit;
    let near = outward(field, samp, px, e * CREST_REACH, res);
    let far = outward(field, samp, px, e * CREST_PROBE, res);
    crest = max(crest, smoothstep(0.1, 0.4, near.x) * smoothstep(0.2, 0.5, far.x) * far.y);
  }
  return crest;
}

// Ink where a unit-spread field `v` tops its (1 − share) quantile (a logistic probit),
// so the marks cover about `share` of the paper.
fn quantileCut(v: f32, share: f32) -> f32 {
  let s = clamp(share, 0.005, 0.995);
  let cut = log((1.0 - s) / s) / 1.702;
  return smoothstep(cut - 0.3, cut + 0.3, v);
}
