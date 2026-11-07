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

// A star glyph centred at the origin, after the Bayer/Flamsteed ladder: a disc
// for the faintest, then `rays` tapered points over a small core (from 8 up,
// alternate rays run short). `glory` adds a ring of ticks. `r` = ray length.
fn starGlyph(q: vec2<f32>, r: f32, rays: f32, glory: f32) -> f32 {
  let d = length(q);
  let a = atan2(q.y, q.x) + 1.5707963;
  // Alternate rays run short when there are 8 or more (4 long + 4 short, Bode).
  let lobe = abs(cos(0.5 * rays * a));
  let alt = cos(0.25 * rays * a);
  let spike = pow(lobe, 10.0 + rays) * select(1.0, select(0.62, 1.0, alt * alt > 0.5), rays >= 8.0);
  let core = r * select(1.0, 0.38, rays > 0.0);
  let edge = core + (r - core) * spike;
  var ink = 1.0 - smoothstep(edge - 0.45, edge + 0.45, d);
  let ticks = pow(abs(cos(12.0 * a)), 24.0);
  let ring = smoothstep(1.12 * r, 1.2 * r, d) * (1.0 - smoothstep(1.42 * r, 1.5 * r, d));
  ink = max(ink, ticks * ring * glory);
  return ink;
}
