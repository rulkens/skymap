// compositor/fxaa.wesl — FXAA 3.11 (quality-12) as the 'fxaa' fragment variant
// of the 'foreground:0 -> hdr' composite: that target holds only bodies and
// terrain, so their silhouettes (ray-cast limbs are 'discard' edges MSAA would
// miss) get AA without smearing point sources. textureLoad only: rgba16float
// isn't guaranteed filterable, so the edge-search taps lerp by hand.
// The source is STRAIGHT alpha (the 'over' blend multiplies by src-alpha), so
// the final blend runs premultiplied and un-premultiplies, or a rim against
// empty space would darken.

import package::compositor::io::VSOut;

@group(0) @binding(0) var srcTex: texture_2d<f32>;

const EDGE_THRESHOLD_MIN: f32 = 0.0312;
const EDGE_THRESHOLD_MAX: f32 = 0.125;
const SUBPIXEL_QUALITY: f32 = 0.75;
const SEARCH_STEPS: u32 = 12u;
// Per-step search distance in texels, increasing outward — the standard
// FXAA quality-12 table: five 1-texel steps to resolve fine edges cheaply,
// then coarsening (1.5, four 2s, 4, 8) to reach thick edges without paying
// 26 uniform-cost taps on every fragment.
const SEARCH_DIST: array<f32, 12> = array<f32, 12>(
  1.0, 1.0, 1.0, 1.0, 1.0, 1.5, 2.0, 2.0, 2.0, 2.0, 4.0, 8.0
);
const ALPHA_EPS: f32 = 1e-4;
const ALPHA_EDGE_WEIGHT: f32 = 0.25;

fn clampTexel(p: vec2<i32>, dims: vec2<i32>) -> vec2<i32> {
  return clamp(p, vec2<i32>(0), dims - vec2<i32>(1));
}

// Luma of c/(1+c) because the source is linear HDR (raw luma misses dim limbs
// and saturates on the Sun); max-channel to match 'bloom/bright.wesl'. Alpha is
// ADDED, not max'd: a max would pin every opaque pixel to 1 and erase edges
// between two opaque surfaces, while a dark limb against empty space still
// needs a step to detect.
fn edgeSignal(texel: vec2<i32>, dims: vec2<i32>) -> f32 {
  let c = textureLoad(srcTex, clampTexel(texel, dims), 0);
  let pm = c.rgb * c.a;
  let compressed = pm / (vec3<f32>(1.0) + pm);
  return max(compressed.r, max(compressed.g, compressed.b)) + ALPHA_EDGE_WEIGHT * c.a;
}

// Bilinear mix of the scalar edge signal at a continuous coordinate in
// texel-centre units (p = (10.5, y) sits exactly on texel 10's centre, same
// convention as '@builtin(position)'). Mixing the four taps' SCALAR signal
// (rather than mixing colour and re-deriving luma) mirrors how hardware
// bilinear filtering would read a single-channel luma texture — the shape
// the classic algorithm assumes.
fn bilinearEdgeSignal(p: vec2<f32>, dims: vec2<i32>) -> f32 {
  let shifted = p - vec2<f32>(0.5);
  let base = vec2<i32>(floor(shifted));
  let frac = shifted - floor(shifted);
  let s00 = edgeSignal(base, dims);
  let s10 = edgeSignal(base + vec2<i32>(1, 0), dims);
  let s01 = edgeSignal(base + vec2<i32>(0, 1), dims);
  let s11 = edgeSignal(base + vec2<i32>(1, 1), dims);
  return mix(mix(s00, s10, frac.x), mix(s01, s11, frac.x), frac.y);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let dims = vec2<i32>(textureDimensions(srcTex));
  let texel = vec2<i32>(floor(in.clip.xy));
  let center = textureLoad(srcTex, clampTexel(texel, dims), 0);

  let lumaM = edgeSignal(texel, dims);
  let lumaN = edgeSignal(texel + vec2<i32>(0, -1), dims);
  let lumaS = edgeSignal(texel + vec2<i32>(0, 1), dims);
  let lumaE = edgeSignal(texel + vec2<i32>(1, 0), dims);
  let lumaW = edgeSignal(texel + vec2<i32>(-1, 0), dims);

  let lumaMin = min(lumaM, min(min(lumaN, lumaS), min(lumaE, lumaW)));
  let lumaMax = max(lumaM, max(max(lumaN, lumaS), max(lumaE, lumaW)));
  let range = lumaMax - lumaMin;

  // Local contrast below threshold: no edge here, skip the search entirely.
  // This early-out is most fragments' whole cost — the search below only
  // runs where a silhouette actually crosses.
  if (range < max(EDGE_THRESHOLD_MIN, lumaMax * EDGE_THRESHOLD_MAX)) {
    return center;
  }

  let lumaNW = edgeSignal(texel + vec2<i32>(-1, -1), dims);
  let lumaNE = edgeSignal(texel + vec2<i32>(1, -1), dims);
  let lumaSW = edgeSignal(texel + vec2<i32>(-1, 1), dims);
  let lumaSE = edgeSignal(texel + vec2<i32>(1, 1), dims);

  // Orientation: sum the horizontal and vertical second-derivatives of the
  // 3x3 neighbourhood. A HORIZONTAL edge (a roof ridge) shows up as strong
  // second-derivatives ACROSS rows sampled at fixed x — i.e. large
  // 'edgeHorz' — and its perpendicular (the direction to walk across it) is
  // vertical, N/S.
  let edgeHorz =
    abs(0.25 * lumaNW - 0.5 * lumaN + 0.25 * lumaNE) +
    abs(0.5 * lumaW - lumaM + 0.5 * lumaE) +
    abs(0.25 * lumaSW - 0.5 * lumaS + 0.25 * lumaSE);
  let edgeVert =
    abs(0.25 * lumaNW - 0.5 * lumaW + 0.25 * lumaSW) +
    abs(0.5 * lumaN - lumaM + 0.5 * lumaS) +
    abs(0.25 * lumaNE - 0.5 * lumaE + 0.25 * lumaSE);
  let isHorizontal = edgeHorz >= edgeVert;

  // The two perpendicular neighbours (N/S for a horizontal edge, W/E for a
  // vertical one). Whichever has the steeper gradient off the centre sets
  // both the crossing point's initial bias and the sign of every offset
  // below — walking toward the steeper side first tracks the true edge
  // rather than the shallow side's noise.
  let luma1 = select(lumaW, lumaN, isHorizontal);
  let luma2 = select(lumaE, lumaS, isHorizontal);
  let gradient1 = luma1 - lumaM;
  let gradient2 = luma2 - lumaM;
  let isSteepest = abs(gradient1) >= abs(gradient2);
  let gradientScaled = 0.25 * max(abs(gradient1), abs(gradient2));
  let lumaLocalAverage = select(0.5 * (luma2 + lumaM), 0.5 * (luma1 + lumaM), isSteepest);

  // +1 texel toward luma2's side (S / E), -1 toward luma1's side (N / W).
  let perpSign = select(1.0, -1.0, isSteepest);
  let perpAxis = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), isHorizontal);
  let tangentAxis = select(vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0), isHorizontal);
  let pixelCenter = vec2<f32>(texel) + vec2<f32>(0.5);
  // The crossing point sits half a texel off-centre, toward the steeper
  // side — the actual sub-texel edge boundary the two perpendicular taps
  // straddle.
  let crossing = pixelCenter + perpAxis * (perpSign * 0.5);

  // Walk outward along the edge (tangent axis) in both directions at once,
  // looking for where the luma stops tracking 'lumaLocalAverage' by more
  // than 'gradientScaled' — the edge's endpoint on that side.
  var distNeg = 0.0;
  var distPos = 0.0;
  var lumaEndNeg = 0.0;
  var lumaEndPos = 0.0;
  var reachedNeg = false;
  var reachedPos = false;
  var dist = 0.0;
  for (var i = 0u; i < SEARCH_STEPS; i = i + 1u) {
    dist = dist + SEARCH_DIST[i];
    if (!reachedNeg) {
      lumaEndNeg = bilinearEdgeSignal(crossing - tangentAxis * dist, dims) - lumaLocalAverage;
      reachedNeg = abs(lumaEndNeg) >= gradientScaled;
      if (reachedNeg) { distNeg = dist; }
    }
    if (!reachedPos) {
      lumaEndPos = bilinearEdgeSignal(crossing + tangentAxis * dist, dims) - lumaLocalAverage;
      reachedPos = abs(lumaEndPos) >= gradientScaled;
      if (reachedPos) { distPos = dist; }
    }
    if (reachedNeg && reachedPos) { break; }
  }
  // Neither side found its endpoint within the budget: treat the search as
  // having run the full distance, same as the reference algorithm.
  if (!reachedNeg) { distNeg = dist; }
  if (!reachedPos) { distPos = dist; }

  // Only trust the search if the NEARER endpoint's luma actually crossed
  // 'lumaLocalAverage' the same way the centre pixel did — otherwise this
  // is noise, not a real edge, and the directional blend is suppressed
  // (the subpixel term below still applies).
  let isLumaCenterSmaller = lumaM < lumaLocalAverage;
  let nearerIsNeg = distNeg < distPos;
  let correctVariation = select(
    (lumaEndPos < 0.0) != isLumaCenterSmaller,
    (lumaEndNeg < 0.0) != isLumaCenterSmaller,
    nearerIsNeg,
  );
  let edgeThickness = distNeg + distPos;
  let pixelOffset = select(0.0, -(min(distNeg, distPos) / edgeThickness) + 0.5, correctVariation);

  // Subpixel-aliasing term: a 12-tap neighbourhood average vs. the centre,
  // independent of the directional search — catches isolated bright/dark
  // single-texel features the edge search's 3x3 orientation test can miss.
  let lumaAverage =
    (1.0 / 12.0) * (2.0 * (lumaN + lumaS + lumaE + lumaW) + lumaNW + lumaNE + lumaSW + lumaSE);
  let subPixel1 = clamp(abs(lumaAverage - lumaM) / range, 0.0, 1.0);
  let subPixel2 = (-2.0 * subPixel1 + 3.0) * subPixel1 * subPixel1;
  let subPixelOffset = subPixel2 * subPixel2 * SUBPIXEL_QUALITY;

  let finalOffset = max(pixelOffset, subPixelOffset);

  // 'finalOffset' is a fraction of ONE texel along 'perpAxis', so the blend
  // is exactly the centre texel and its single perpendicular neighbour —
  // no second bilinear tap needed for the output itself.
  let step = vec2<i32>(perpAxis * perpSign);
  let neighbor = textureLoad(srcTex, clampTexel(texel + step, dims), 0);

  let centerPm = vec4<f32>(center.rgb * center.a, center.a);
  let neighborPm = vec4<f32>(neighbor.rgb * neighbor.a, neighbor.a);
  let blended = mix(centerPm, neighborPm, finalOffset);
  return vec4<f32>(blended.rgb / max(blended.a, ALPHA_EPS), blended.a);
}
