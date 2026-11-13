// earth/antiqueMap/molehill.wesl — the molehill relief sign, ported from the relief
// research (validated with naga there).
//
// Molehill glyph: engraved profile hill, light from the upper left (shade + hatching on the right).
// uv in [-1,1]^2, y up; the hill stands on uv.y = MH_BASE, so the anchor (lon/lat) maps to
// uv (0, MH_BASE): put the quad's bottom edge 0.1 x side below the projected anchor.
// pxPerUnit = screen px per uv unit (quad half-side in px). Returns (ink, paper knock-out).

const MH_BASE: f32 = -0.8;

fn mh_hash(n: f32) -> f32 { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

// Raised cosine with a fuller crown: rounded summit, concave flaring foot.
fn mh_profile(x: f32, w: f32, h: f32) -> f32 {
  let t = clamp(x / w, -1.0, 1.0);
  return h * pow(0.5 + 0.5 * cos(3.14159265 * t), 0.6);
}

fn mh_seg(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * k);
}

// Coverage of a stroke of half-width halfPx at uv distance d: 1 px linear AA ramp.
fn mh_cover(d: f32, halfPx: f32, pxPerUnit: f32) -> f32 {
  return clamp(halfPx - d * pxPerUnit + 0.5, 0.0, 1.0);
}

fn molehill(uv: vec2<f32>, seed: f32, pxPerUnit: f32) -> vec2<f32> {
  let height = mix(0.9, 1.25, mh_hash(seed));
  let peakX = mix(-0.08, 0.08, mh_hash(seed + 1.7));
  let wl = mix(0.62, 0.82, mh_hash(seed + 3.1));
  let wr = min(wl * mix(1.0, 1.2, mh_hash(seed + 5.3)), 0.92 - peakX); // shade flank a touch longer
  let p = vec2<f32>(uv.x - peakX, uv.y - MH_BASE);
  let w = select(wl, wr, p.x > 0.0);
  let inSpan = abs(p.x) < w;
  let h = mh_profile(p.x, w, height);
  let e = 0.01;
  let dh = (mh_profile(p.x + e, w, height) - mh_profile(p.x - e, w, height)) / (2.0 * e);
  let dOutline = select(1e3, abs(p.y - h) / sqrt(1.0 + dh * dh), inSpan && p.y > -0.02);
  // Swelling line: hairline on the lit flank, heavier on the shade flank.
  let outlinePx = mix(0.5, 0.95, smoothstep(-0.3, 0.6, p.x / w));
  var ink = mh_cover(dOutline, outlinePx, pxPerUnit);
  let inside = select(0.0, clamp((h - p.y) * pxPerUnit + 0.5, 0.0, 1.0), inSpan && p.y > 0.0);
  // 3-6 slope strokes on the shade side, dropped when they would sit < ~2 px apart.
  let n = min(floor(wr * 0.8 * pxPerUnit / 2.0), floor(mix(3.0, 6.99, mh_hash(seed + 7.9))));
  for (var i = 0.0; i < 6.0; i += 1.0) {
    if (i >= n) { break; }
    let f = (i + 1.0) / (n + 1.0);
    let hx = wr * mix(0.05, 0.8, pow(f, 0.8));
    let top = mh_profile(hx, wr, height) - 1.6 / pxPerUnit;
    let a = vec2<f32>(hx, top);
    let b = vec2<f32>(hx + 0.1 * f, 0.05);
    ink = max(ink, mh_cover(mh_seg(p, a, b), 0.38, pxPerUnit) * inside);
  }
  // Short ground stroke under the shade side.
  let g = mh_seg(p, vec2<f32>(0.15 * wr, 0.0), vec2<f32>(min(wr * 1.15, 0.95 - peakX), 0.0));
  ink = max(ink, mh_cover(g, 0.4, pxPerUnit));
  return vec2<f32>(ink, max(ink, inside));
}
