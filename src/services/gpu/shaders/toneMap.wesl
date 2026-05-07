// Fullscreen tone-map post-process — five selectable curves.
//
// Uses the "covering triangle" trick: a single triangle whose three
// vertices sit at (-1,-1), (3,-1), (-1,3) in clip space covers the
// entire viewport [-1,1]² with a 50 % overdraw budget that's free
// because we never sample those off-screen pixels.  No vertex buffer
// required — the vertex shader synthesises positions directly from
// 'vertex_index'.
//
// Curves, branched on 'u.curve':
//   curve=0 — Linear / Clamp.  Pre-HDR baseline, no tone mapping.
//             Cluster cores blow out, filaments invisible.  Reference.
//   curve=1 — Reinhard-extended 'c·(1 + c/W²) / (1+c)'.  Smooth
//             roll-off near 1.0, "natural" look.  Default.
//   curve=2 — Asinh / Lupton 2004 'asinh(k·c) / asinh(k)'.  Linear
//             near zero, log-like at high values.  Aggressively lifts
//             dim regions — what SDSS's pipeline uses for filaments.
//   curve=3 — Gamma 2.0 'sqrt(clamp(c, 0, 1))'.  Simple midtone
//             lift; cheap, less surgical than asinh.
//   curve=4 — ACES filmic (Narkowicz 2015 approximation):
//             '(c·(2.51·c+0.03)) / (c·(2.43·c+0.59)+0.14)', clamped.
//             Cinematic S-curve with shoulder + toe.

struct ToneMapUniforms {
  exposure: f32,
  // whitepoint² (pre-squared CPU-side) for Reinhard-extended.
  whitepointSq: f32,
  // softening constant for asinh stretch — controls where the curve
  // transitions from linear to logarithmic.  Default 10.
  asinhSoftness: f32,
  // 0..4 — see header comment for the curve→value mapping.
  curve: u32,
}

@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var hdrSamp: sampler;
@group(0) @binding(2) var<uniform> u: ToneMapUniforms;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Standard "big triangle" trick: vertex indices 0,1,2 produce UVs
  // (0,0), (2,0), (0,2) which map to clip-space positions (-1,1),
  // (3,1), (-1,-3) — a single triangle that covers [-1,1]² with the
  // off-screen corners safely clipped.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}

// Linear / Clamp — no tone map.  Saturates at 1.0.
fn applyLinear(c: vec3<f32>) -> vec3<f32> {
  return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Reinhard-extended per channel: c * (1 + c/W²) / (1 + c).
// Reaches exactly 1.0 at the whitepoint W; above W the formula grows
// unboundedly toward c/W², so we clamp for safety (matches every other
// curve here and avoids a bgra8unorm flat-white blow-out at outlier
// peaks beyond the configured whitepoint).
fn applyReinhard(c: vec3<f32>, wsq: f32) -> vec3<f32> {
  let y = c * (vec3<f32>(1.0) + c / vec3<f32>(wsq)) / (vec3<f32>(1.0) + c);
  return clamp(y, vec3<f32>(0.0), vec3<f32>(1.0));
}

// Asinh stretch (Lupton-style): asinh(k·c) / asinh(k).
// Reaches exactly 1.0 at c=1; for c>1 grows logarithmically and
// (eventually) past 1.  We clamp at the end so an outlier peak never
// pushes a swap-chain pixel >1 — same safety contract as every other
// curve in this file.
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
// 'sqrt' is the dedicated intrinsic and slightly faster.
fn applyGamma2(c: vec3<f32>) -> vec3<f32> {
  return sqrt(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)));
}

// ACES filmic (Narkowicz 2015 closed-form approximation).  Lifts toe,
// rolls off shoulder, S-curves through midtone.  No exposure division
// — caller handles that via the exposure multiplier above.
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

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let hdr = textureSample(hdrTex, hdrSamp, in.uv).rgb;
  let scaled = hdr * u.exposure;
  // Dynamic-uniform branch — 'curve' is identical across all fragments
  // in a frame, so the GPU's branch predictor handles this efficiently.
  // We use a chain of 'if's rather than a 'switch' because WGSL's
  // 'switch' semantics are slightly stricter (must end in 'default')
  // and the chain is cleaner with fall-through-impossible curves.
  var mapped: vec3<f32>;
  if (u.curve == 0u) {
    mapped = applyLinear(scaled);
  } else if (u.curve == 1u) {
    mapped = applyReinhard(scaled, u.whitepointSq);
  } else if (u.curve == 2u) {
    mapped = applyAsinh(scaled, u.asinhSoftness);
  } else if (u.curve == 3u) {
    mapped = applyGamma2(scaled);
  } else {
    // curve == 4u (Aces) or any unknown value — fall through to ACES
    // as the most cinematic-looking default.
    mapped = applyAces(scaled);
  }
  // Output is opaque — alpha doesn't matter because the swap-chain
  // is configured 'alphaMode: 'premultiplied'' and we just composited
  // the entire scene already.
  return vec4<f32>(mapped, 1.0);
}
