import package::lib::tonemap::applyLinear;
import package::lib::tonemap::applyReinhard;
import package::lib::tonemap::applyAsinh;
import package::lib::tonemap::applyGamma2;
import package::lib::tonemap::applyAces;

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
