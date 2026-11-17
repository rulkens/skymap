// antiqueLook/shared/engraving.wesl — copperplate marks: burin hatching on a ladder of
// four line widths (no grey, no continuous swell), a second set only in the
// deepest shade, ring and water lines, and stipple for diffuse light. All in
// print units; every mark anti-aliases analytically from `pxUnits` (units per
// device px), so none takes a derivative and all may run inside a branch.

import package::antiqueLook::shared::paper::vnoise;
import package::lib::util::hash21Hq;

const BURIN = vec4<f32>(1.0, 1.6, 2.3, 3.0); // the four line widths, print units

// Bit-reversed rank of line k among each 8: the order in which lines arrive.
fn rank8(lineIndex: f32) -> f32 {
  let slot = i32(lineIndex) & 7;
  return f32(((slot & 1) << 2) | (slot & 2) | ((slot & 4) >> 2));
}

// A line never prints under one device pixel: thinner reads as grey, not ink.
fn inkLine(dUnits: f32, width: f32, pxUnits: f32) -> f32 {
  let drawnWidth = max(width, pxUnits);
  return 1.0 - smoothstep(0.5 * (drawnWidth - pxUnits), 0.5 * (drawnWidth + pxUnits), dUnits);
}

// Lines at phase = k*spacing; form = (phase, along, grad), grad = |d phase / d
// screen unit| (1 when straight). alive = lines per 8 that exist (0..9.7): they
// arrive in rank order, the fraction tapers the newest, the jitter staggers ends.
fn lineFamily(form: vec3<f32>, spacing: f32, alive: f32, width: f32, pxUnits: f32, seed: f32) -> f32 {
  let phase = form.x / spacing + 0.18 * (vnoise(vec2<f32>(form.y * 0.02 + seed, form.x * 0.04)) - 0.5);
  let lineIndex = floor(phase);
  let gradient = max(form.z, 1.0);
  let distUnits = abs(fract(phase) - 0.5) * spacing / max(form.z, 1e-3);
  // Crowded lines (a compressed limb) drop out by rank before they merge, and thin.
  let keep = min(alive, 13.6 / gradient);
  let presence = clamp(keep - rank8(lineIndex) - 0.7 * hash21Hq(vec2<f32>(lineIndex, seed)), 0.0, 1.0);
  let swell = 0.88 + 0.24 * vnoise(vec2<f32>(form.y * 0.04, lineIndex * 3.7 + seed));
  let local = spacing / gradient * 8.0 / clamp(keep, 1.0, 8.0);
  let halfWidth = min(0.5 * width * presence * swell, 0.36 * local);
  return (1.0 - smoothstep(halfWidth - 0.5 * pxUnits, halfWidth + 0.5 * pxUnits, distUnits)) * step(0.15 * pxUnits, halfWidth);
}

// Lines arrive over tone 0.06..0.42, then step through the four widths at 0.5,
// 0.63 and 0.76. The second set, 27° off, straight and only past 0.8, makes long
// lozenges, never a lattice. An ink DENSITY: a crossing prints darker (Beer's law).
fn crossHatch(form: vec3<f32>, point: vec2<f32>, tone: f32, spacing: f32, baseAngle: f32, pxUnits: f32) -> f32 {
  let widthSteps = smoothstep(vec3<f32>(0.465, 0.595, 0.725), vec3<f32>(0.535, 0.665, 0.795), vec3<f32>(tone));
  let primaryWidth = BURIN.x + dot(widthSteps, BURIN.yzw - BURIN.xyz);
  // The families run only where their lines exist: most of a lit globe is paper.
  var ink = 0.0;
  if (tone > 0.06) {
    ink = lineFamily(form, spacing, clamp((tone - 0.06) / 0.04, 0.0, 9.7), primaryWidth, pxUnits, 0.0);
  }
  if (tone > 0.8) {
    let angle = baseAngle + 0.47;
    let crossNormal = vec2<f32>(-sin(angle), cos(angle));
    let crossWidth = mix(BURIN.x, BURIN.y, smoothstep(0.92, 0.97, tone));
    ink += lineFamily(vec3<f32>(dot(point, crossNormal), dot(point, vec2<f32>(crossNormal.y, -crossNormal.x)), 1.0), spacing * 1.15,
                      clamp((tone - 0.8) / 0.025, 0.0, 9.7), crossWidth, pxUnits, 5.3);
  }
  return min(ink, 1.05);
}

// Tone from the form: paper on the lit crown, full past the terminator but for the
// reflected light along the limb, the period convention that keeps a dark side round.
fn formTone(ndl: f32, ndv: f32) -> f32 {
  let rim = 1.0 - smoothstep(0.0, 0.5, ndv);
  return 1.0 - smoothstep(-0.1, 0.5, ndl) - 0.5 * rim * smoothstep(0.05, -0.25, ndl);
}

// A ring as four ellipses: edges = (C inner, B inner, Cassini mid, A outer) in body
// radii, rhoPerUnit = |d rho / d screen unit|; the dim C ring is one dotted hairline.
fn ringLines(rho: f32, rhoPerUnit: f32, edges: vec4<f32>, point: vec2<f32>, pxUnits: f32) -> f32 {
  let unitsPerRho = 1.0 / max(rhoPerUnit, 1e-6);
  var ink = inkLine(abs(rho - edges.x) * unitsPerRho, 0.6, pxUnits);
  ink = max(ink, inkLine(abs(rho - edges.y) * unitsPerRho, 1.0, pxUnits));
  ink = max(ink, inkLine(abs(rho - edges.w) * unitsPerRho, 1.3, pxUnits));
  ink = max(ink, inkLine(abs(rho - edges.z) * unitsPerRho, 2.0, pxUnits));
  let dots = step(fract((point.x + point.y) * 0.33), 0.5);
  return max(ink, inkLine(abs(rho - 0.5 * (edges.x + edges.y)) * unitsPerRho, 0.6, pxUnits) * dots);
}

// The land-blur pass's sigma, print units (`landBlur.wesl`).
const LAND_SIGMA: f32 = 6.0;

// `wash.a` on a body no land map covers (`reduce.wesl`): above any share, so
// `landWeight` drops it as it drops the sky's −1, and no coast is cut there.
const LAND_UNMAPPED: f32 = 2.0;

fn landWeight(landShare: f32) -> f32 {
  return step(0.0, landShare) * step(landShare, 1.0);
}

// Blurring a straight coast gives a normal CDF, so the blurred land share inverts
// to a distance off the coast: d = -sigma * probit(share), with Giles' erfinv
// (central branch, share >= 0.01). Positive at sea; land is seaDistance(1 - share).
fn seaDistance(share: f32) -> f32 {
  let signedShare = 2.0 * clamp(share, 0.01, 0.5) - 1.0;
  let erfLog = -log((1.0 - signedShare) * (1.0 + signedShare)) - 2.5;
  var erfPoly = 2.81022636e-08;
  erfPoly = 3.43273939e-07 + erfPoly * erfLog;
  erfPoly = -3.5233877e-06 + erfPoly * erfLog;
  erfPoly = -4.39150654e-06 + erfPoly * erfLog;
  erfPoly = 0.00021858087 + erfPoly * erfLog;
  erfPoly = -0.00125372503 + erfPoly * erfLog;
  erfPoly = -0.00417768164 + erfPoly * erfLog;
  erfPoly = 0.246640727 + erfPoly * erfLog;
  erfPoly = 1.50140941 + erfPoly * erfLog;
  return -LAND_SIGMA * 1.41421356 * erfPoly * signedShare;
}

const WATER_D = vec4<f32>(2.0, 4.6, 7.8, 11.8); // offsets off the coast, units
const WATER_W = vec4<f32>(0.9, 0.75, 0.6, 0.5);

// The Dutch water lines: four lines following the coast out to sea, spaced wider
// and thinner seaward, wobbling by hand, the outer ones breaking up.
fn waterLines(point: vec2<f32>, seaD: f32, dPerUnit: f32, pxUnits: f32) -> f32 {
  let warpedSeaD = seaD + (vnoise(point * 0.06) - 0.5) * (0.3 + 0.08 * seaD);
  let offsets = WATER_D;
  let widths = WATER_W;
  var ink = 0.0;
  for (var lineIndex = 0; lineIndex < 4; lineIndex++) {
    let whole = step(0.15 * f32(lineIndex), vnoise(point * 0.09 + vec2<f32>(f32(lineIndex) * 13.1, 0.0)));
    ink = max(ink, inkLine(abs(warpedSeaD - offsets[lineIndex]) / max(dPerUnit, 0.3), widths[lineIndex], pxUnits) * whole);
  }
  return ink;
}

// Jittered-grid dots: the dot AREA tracks the tone, as in stipple engraving.
fn stipple(point: vec2<f32>, cell: f32, tone: f32) -> f32 {
  let gridCell = floor(point / cell);
  var ink = 0.0;
  for (var cellRow = 0; cellRow <= 1; cellRow++) {
    for (var cellCol = 0; cellCol <= 1; cellCol++) {
      let corner = gridCell + vec2<f32>(f32(cellCol), f32(cellRow)) - vec2<f32>(0.5);
      let cornerCell = floor(corner + 0.5);
      let centre = (cornerCell + vec2<f32>(hash21Hq(cornerCell), hash21Hq(cornerCell + 17.3))) * cell;
      let dotRadius = sqrt(clamp(tone, 0.0, 1.0)) * cell * 0.52;
      let dotDist = length(point - centre);
      ink = max(ink, 1.0 - smoothstep(dotRadius - 0.45, dotRadius + 0.45, dotDist));
    }
  }
  return ink * step(0.02, tone);
}

// Jittered dots of one radius, each kept with probability `share`: density
// shows as dot count, thinning to bare paper, where `stipple` swells the dots.
fn scatter(point: vec2<f32>, cell: f32, share: f32, radius: f32) -> f32 {
  let gridCell = floor(point / cell - 0.5);
  var ink = 0.0;
  for (var dotIndex = 0; dotIndex < 4; dotIndex++) {
    let dotCell = gridCell + vec2<f32>(f32(dotIndex & 1), f32(dotIndex >> 1u));
    let centre = (dotCell + 0.2 + 0.6 * vec2<f32>(hash21Hq(dotCell), hash21Hq(dotCell + 17.3))) * cell;
    let kept = step(hash21Hq(dotCell + 41.7), share);
    ink = max(ink, kept * (1.0 - smoothstep(radius - 0.45, radius + 0.45, length(point - centre))));
  }
  return ink;
}

// Dots that thin out by count to bare paper and grow with the tone until they nearly
// merge, so a tone reads up to a dense core where `stipple`'s one dot per cell leaves
// paper; each dot's size varies by a quarter either way, as a punch's did.
fn stippleDense(point: vec2<f32>, cell: f32, tone: f32, pxUnits: f32) -> f32 {
  let gridCell = floor(point / cell - 0.5);
  let baseRadius = cell * (0.24 + 0.42 * tone * tone);
  var ink = 0.0;
  for (var dotIndex = 0; dotIndex < 4; dotIndex++) {
    let dotCell = gridCell + vec2<f32>(f32(dotIndex & 1), f32(dotIndex >> 1u));
    let centre = (dotCell + 0.1 + 0.8 * vec2<f32>(hash21Hq(dotCell), hash21Hq(dotCell + 17.3))) * cell;
    let kept = step(0.55 * hash21Hq(dotCell + 41.7), tone);
    let dotRadius = baseRadius * (0.75 + 0.5 * hash21Hq(dotCell + 63.1));
    ink = max(ink, kept * (1.0 - smoothstep(dotRadius - 0.5 * pxUnits, dotRadius + 0.5 * pxUnits, length(point - centre))));
  }
  return ink * step(0.02, tone);
}

// Iso-lines of a scalar field, after Mellan's single swelling line: ISO_K lines
// per unit of `fieldValue`, refined by octaves so they stay ~ISO_SPACING units apart at any
// gradient. Lines sit at integer multiples, so octave n+1 holds every line of n
// and the blend only fades the in-between ones: nothing pops on a zoom. Half-width
// swells with `tone` to ISO_WIDTH of the spacing (72% cover: paper always shows).
const ISO_K: f32 = 4.0;
const ISO_SPACING: f32 = 3.4;
const ISO_WIDTH: f32 = 0.36;

fn isoLines(fieldValue: f32, hPerUnit: f32, tone: f32, pxUnits: f32) -> f32 {
  let octaveFloat = clamp(log2(1.0 / (ISO_K * hPerUnit * ISO_SPACING)), 0.0, 6.0);
  let octaveBase = floor(octaveFloat);
  let halfWidth = tone * ISO_SPACING * ISO_WIDTH;
  var ink = 0.0;
  for (var octaveIndex = 0; octaveIndex < 2; octaveIndex++) {
    let linesPerUnit = ISO_K * exp2(octaveBase + f32(octaveIndex));
    let distUnits = abs(fract(fieldValue * linesPerUnit + 0.5) - 0.5) / (linesPerUnit * hPerUnit);
    let weight = select(1.0 - (octaveFloat - octaveBase), octaveFloat - octaveBase, octaveIndex == 1);
    ink += weight * (1.0 - smoothstep(halfWidth - 0.5 * pxUnits, halfWidth + 0.5 * pxUnits, distUnits));
  }
  return ink;
}

// `isoLines` over a height phase `heightPhase` (`relief.wesl`, `heightPeriodM`) at `pixelPos` in `field`,
// its gradient from the neighbours' phases. A face seen edge-on crowds even the coarsest
// lines past ISO_SPACING: fade them rather than alias. A zero tone would still leave
// isoLines' sub-pixel hairline. Below `resolvedPerPx` (> 0) of phase per px the stored
// phase's steps outrun its slope: a facet inside one step reads flat, and one sitting on
// a line's value inked solid, so the lines leave such ground to the paper.
fn contourLines(field: texture_2d<f32>, pixelPos: vec2<f32>, heightPhase: f32, unit: f32, tone: f32, resolvedPerPx: f32) -> f32 {
  let texel = vec2<i32>(pixelPos);
  let phaseStepX = wrapStep(textureLoad(field, texel + vec2<i32>(1, 0), 0).b, textureLoad(field, texel - vec2<i32>(1, 0), 0).b);
  let phaseStepY = wrapStep(textureLoad(field, texel + vec2<i32>(0, 1), 0).b, textureLoad(field, texel - vec2<i32>(0, 1), 0).b);
  let hPerUnit = 0.5 * length(vec2<f32>(phaseStepX, phaseStepY)) * unit;
  let crowd = hPerUnit * ISO_K * ISO_SPACING;
  let resolved = select(1.0, smoothstep(resolvedPerPx, 2.0 * resolvedPerPx, hPerUnit / unit), resolvedPerPx > 0.0);
  let keep = smoothstep(0.0, 0.15, tone) * (1.0 - smoothstep(1.0, 2.0, crowd)) * resolved;
  if (keep <= 0.0) {
    return 0.0;
  }
  return min(isoLines(heightPhase, max(hPerUnit, 1e-6), tone, 1.0 / unit), 1.0) * keep;
}

// The step between two height phases across their wrap.
fn wrapStep(phaseA: f32, phaseB: f32) -> f32 {
  let diff = phaseA - phaseB;
  return diff - round(diff);
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

fn fallLines(field: texture_2d<f32>, samp: sampler, pixelPos: vec2<f32>, unit: f32, across: bool) -> f32 {
  let res = vec2<f32>(textureDimensions(field));
  let centreTap = textureSampleLevel(field, samp, pixelPos / res, 0.0);
  var sum = centreTap.b;
  var weight = 1.0;
  for (var side = 0; side < 2; side++) {
    var streamPos = pixelPos;
    var direction = select(centreTap.rg, vec2<f32>(-centreTap.g, centreTap.r), across) * select(-1.0, 1.0, side == 1);
    for (var tapIndex = 1; tapIndex <= FALL_TAPS; tapIndex++) {
      streamPos += direction * (FALL_STEP * unit);
      let tap = textureSampleLevel(field, samp, streamPos / res, 0.0);
      let len = length(tap.rg);
      if (len < 0.5) {
        break;
      }
      let next = select(tap.rg, vec2<f32>(-tap.g, tap.r), across) / len;
      direction = select(next, -next, dot(next, direction) < 0.0);
      let tapWeight = 1.0 - f32(tapIndex) / f32(FALL_TAPS + 1);
      sum += tap.b * tapWeight;
      weight += tapWeight;
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

fn outward(field: texture_2d<f32>, samp: sampler, pixelPos: vec2<f32>, offset: vec2<f32>, res: vec2<f32>) -> vec2<f32> {
  let ahead = textureSampleLevel(field, samp, (pixelPos + offset) / res, 0.0);
  let behind = textureSampleLevel(field, samp, (pixelPos - offset) / res, 0.0);
  let axis = normalize(offset);
  let landform = step(0.5, min(length(ahead.rg), length(behind.rg))) * step(0.0, min(ahead.a, behind.a));
  return vec2<f32>(min(dot(ahead.rg, axis), -dot(behind.rg, axis)), landform);
}

fn fallCrest(field: texture_2d<f32>, samp: sampler, pixelPos: vec2<f32>, unit: f32) -> f32 {
  let res = vec2<f32>(textureDimensions(field));
  var crest = 0.0;
  for (var axisIndex = 0; axisIndex < 2; axisIndex++) {
    let axisOffset = vec2<f32>(f32(1 - axisIndex), f32(axisIndex)) * unit;
    let near = outward(field, samp, pixelPos, axisOffset * CREST_REACH, res);
    let far = outward(field, samp, pixelPos, axisOffset * CREST_PROBE, res);
    crest = max(crest, smoothstep(0.1, 0.4, near.x) * smoothstep(0.2, 0.5, far.x) * far.y);
  }
  return crest;
}

// Ink where a unit-spread field `field` tops its (1 − share) quantile (a logistic probit),
// so the marks cover about `share` of the paper.
fn quantileCut(field: f32, share: f32) -> f32 {
  let clampedShare = clamp(share, 0.005, 0.995);
  let cut = log((1.0 - clampedShare) / clampedShare) / 1.702;
  return smoothstep(cut - 0.3, cut + 0.3, field);
}
