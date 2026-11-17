// earth/antiqueMap/molehill.wesl — the molehill relief sign, ported from the relief
// research (validated with naga there).
//
// Molehill glyph: engraved profile hill, light from the upper left (shade + hatching on the right).
// uv in [-1,1]^2, y up; the hill stands on uv.y = MH_BASE, so the anchor (lon/lat) maps to
// uv (0, MH_BASE): put the quad's bottom edge 0.1 x side below the projected anchor.
// pxPerUnit = screen px per uv unit (quad half-side in px). Returns (ink, paper knock-out).

const MH_BASE: f32 = -0.8;

fn mh_hash(value: f32) -> f32 { return fract(sin(value * 127.1 + 311.7) * 43758.5453); }

// Raised cosine with a fuller crown: rounded summit, concave flaring foot.
fn mh_profile(offsetX: f32, halfWidth: f32, crownHeight: f32) -> f32 {
  let edgeT = clamp(offsetX / halfWidth, -1.0, 1.0);
  return crownHeight * pow(0.5 + 0.5 * cos(3.14159265 * edgeT), 0.6);
}

fn mh_seg(point: vec2<f32>, segStart: vec2<f32>, segEnd: vec2<f32>) -> f32 {
  let toPoint = point - segStart;
  let segVec = segEnd - segStart;
  let alongT = clamp(dot(toPoint, segVec) / dot(segVec, segVec), 0.0, 1.0);
  return length(toPoint - segVec * alongT);
}

// Coverage of a stroke of half-width halfPx at uv distance uvDist: 1 px linear AA ramp.
fn mh_cover(uvDist: f32, halfPx: f32, pxPerUnit: f32) -> f32 {
  return clamp(halfPx - uvDist * pxPerUnit + 0.5, 0.0, 1.0);
}

fn molehill(uv: vec2<f32>, seed: f32, pxPerUnit: f32) -> vec2<f32> {
  let height = mix(0.9, 1.25, mh_hash(seed));
  let peakX = mix(-0.08, 0.08, mh_hash(seed + 1.7));
  let leftHalfWidth = mix(0.62, 0.82, mh_hash(seed + 3.1));
  let rightHalfWidth = min(leftHalfWidth * mix(1.0, 1.2, mh_hash(seed + 5.3)), 0.92 - peakX); // shade flank a touch longer
  let local = vec2<f32>(uv.x - peakX, uv.y - MH_BASE);
  let flankHalfWidth = select(leftHalfWidth, rightHalfWidth, local.x > 0.0);
  let inSpan = abs(local.x) < flankHalfWidth;
  let hillY = mh_profile(local.x, flankHalfWidth, height);
  let slopeStep = 0.01;
  let slope = (mh_profile(local.x + slopeStep, flankHalfWidth, height) - mh_profile(local.x - slopeStep, flankHalfWidth, height)) / (2.0 * slopeStep);
  let dOutline = select(1e3, abs(local.y - hillY) / sqrt(1.0 + slope * slope), inSpan && local.y > -0.02);
  // Swelling line: hairline on the lit flank, heavier on the shade flank.
  let outlinePx = mix(0.5, 0.95, smoothstep(-0.3, 0.6, local.x / flankHalfWidth));
  var ink = mh_cover(dOutline, outlinePx, pxPerUnit);
  let inside = select(0.0, clamp((hillY - local.y) * pxPerUnit + 0.5, 0.0, 1.0), inSpan && local.y > 0.0);
  // 3-6 slope strokes on the shade side, dropped when they would sit < ~2 px apart.
  let strokeCount = min(floor(rightHalfWidth * 0.8 * pxPerUnit / 2.0), floor(mix(3.0, 6.99, mh_hash(seed + 7.9))));
  for (var strokeIndex = 0.0; strokeIndex < 6.0; strokeIndex += 1.0) {
    if (strokeIndex >= strokeCount) { break; }
    let strokeFrac = (strokeIndex + 1.0) / (strokeCount + 1.0);
    let strokeX = rightHalfWidth * mix(0.05, 0.8, pow(strokeFrac, 0.8));
    let top = mh_profile(strokeX, rightHalfWidth, height) - 1.6 / pxPerUnit;
    let strokeStart = vec2<f32>(strokeX, top);
    let strokeEnd = vec2<f32>(strokeX + 0.1 * strokeFrac, 0.05);
    ink = max(ink, mh_cover(mh_seg(local, strokeStart, strokeEnd), 0.38, pxPerUnit) * inside);
  }
  // Short ground stroke under the shade side.
  let groundDist = mh_seg(local, vec2<f32>(0.15 * rightHalfWidth, 0.0), vec2<f32>(min(rightHalfWidth * 1.15, 0.95 - peakX), 0.0));
  ink = max(ink, mh_cover(groundDist, 0.4, pxPerUnit));
  return vec2<f32>(ink, max(ink, inside));
}
