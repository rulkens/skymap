// Tone-mapping curves — HDR scene-referred floats to display-referred LDR.
//
// What tone mapping is, and why we need it
// ----------------------------------------
// Skymap renders into an rgba16float HDR target so that bright cluster
// cores, dim filaments, and everything in between can coexist as honest
// linear-light floats well above 1.0.  The swap chain, however, is an
// 8-bit sRGB surface that physically cannot display values >1.0 — every
// pixel above unity simply clips to white and loses all detail.  Tone
// mapping is the dimensionality-reducing step that squeezes the open-
// ended scene-referred range '[0, +infinity)' into the closed display-
// referred range '[0, 1]' while preserving as much perceptual structure
// as possible.
//
// Why several different curves?
// -----------------------------
// Galaxy imagery routinely spans many orders of magnitude — the brightest
// pixel in a cluster core can be 10000x dimmer than a foreground star
// and 10000x brighter than the faintest filament strand.  No single
// curve serves every intent.  The five curves below trade off different
// virtues so the viewer (or the renderer settings panel) can pick:
//
//   Linear   — debug bypass; lets you see exactly where the HDR clips.
//   Reinhard — soft natural-feeling shoulder; the default for general
//              viewing.  Reaches 1.0 exactly at the configured white
//              point so artists can dial 'how bright is white?'.
//   Asinh    — Lupton-style stretch tuned for astronomy.  Stellar and
//              galaxy brightness is fundamentally logarithmic
//              ('magnitudes' are a log scale by definition), so an
//              asinh curve aggressively lifts dim filaments without
//              destroying the dynamic range of bright cores.  Closest
//              to what SDSS' published colour images use.
//   Gamma2   — sqrt(c).  A cheap midtone-lift approximation; NOT a true
//              tone-map (no shoulder, no toe) but useful as a fast
//              fallback or A/B reference against the more expensive
//              curves above.
//   ACES     — the standard cinema S-curve (Narkowicz 2015 closed-form
//              approximation).  Toe + shoulder + midtone S — the most
//              'photographic' look, at the cost of slight colour-shift
//              in the highlights.
//
// All five clamp the final output to [0, 1] as a safety contract — even
// curves that nominally normalise to 1.0 at a chosen white point can
// exceed 1.0 for outlier inputs above the white point, and an
// unclamped pixel >1.0 written to bgra8unorm becomes a flat-white
// blow-out with no recoverable detail.

// Linear / Clamp — identity mapping with hard saturation at 1.0.
// Useful as a debug bypass: anything that ends up white here is
// genuinely clipping the HDR target, which tells you whether the
// 'looks blown out' problem is upstream (raw radiance too bright) or
// downstream (tone-map curve choice).
fn applyLinear(c: vec3<f32>) -> vec3<f32> {
  return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Reinhard-extended per channel: c * (1 + c/W²) / (1 + c).
// Reaches exactly 1.0 at the whitepoint W; above W the formula grows
// unboundedly toward c/W², so we clamp for safety (matches every other
// curve here and avoids a bgra8unorm flat-white blow-out at outlier
// peaks beyond the configured whitepoint).  The 'extended' variant
// (vs the textbook 'c / (1+c)') gives the artist explicit control over
// where white sits, instead of asymptoting to 1.0 only at infinity.
fn applyReinhard(c: vec3<f32>, wsq: f32) -> vec3<f32> {
  let y = c * (vec3<f32>(1.0) + c / vec3<f32>(wsq)) / (vec3<f32>(1.0) + c);
  return clamp(y, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Asinh stretch (Lupton-style): asinh(k·c) / asinh(k).
// Reaches exactly 1.0 at c=1; for c>1 grows logarithmically and
// (eventually) past 1.  We clamp at the end so an outlier peak never
// pushes a swap-chain pixel >1 — same safety contract as every other
// curve in this file.  The 'k' (softness) parameter controls the
// transition between near-linear behaviour at small c and logarithmic
// behaviour at large c — larger k means more aggressive lift of the
// dim end.  The natural fit for astronomical brightness because
// stellar magnitudes are themselves a log scale.
fn applyAsinh(c: vec3<f32>, k: f32) -> vec3<f32> {
  // WGSL has no vector asinh — hand-vectorise.
  let denom = asinh(k);
  let y = vec3<f32>(
    asinh(k * c.x) / denom,
    asinh(k * c.y) / denom,
    asinh(k * c.z) / denom,
  );
  return clamp(y, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Gamma 2.0 = sqrt of clamped input.  WGSL 'pow(c, 0.5)' works but
// 'sqrt' is the dedicated intrinsic and slightly faster.  Strictly
// speaking this is a gamma encoding, not a tone-map — there is no
// shoulder, no toe, and no shape parameter — but the sqrt curve does
// lift midtones cheaply, which is sometimes what you want for an A/B
// against the heavier curves above.
fn applyGamma2(c: vec3<f32>) -> vec3<f32> {
  return sqrt(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)));
}

// ACES filmic (Narkowicz 2015 closed-form approximation).  Lifts toe,
// rolls off shoulder, S-curves through midtone.  No exposure division
// — caller handles that via the exposure multiplier above.  The
// coefficients are Krzysztof Narkowicz' published fit to the full ACES
// reference transform; do NOT 're-derive' or 'tidy' them — small
// tweaks visibly change the curve and break the 'this looks like
// cinema' property the curve is chosen for.
fn applyAces(c: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let d = 2.43;
  let e = 0.59;
  let f = 0.14;
  return clamp(
    (c * (a * c + vec3<f32>(b))) / (c * (d * c + vec3<f32>(e)) + vec3<f32>(f)),
    vec3<f32>(0.0),
    vec3<f32>(1.0),
  );
}
