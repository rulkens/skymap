// toneMap/fragment.wesl — five-curve tone-map fragment stage.
//
// Samples the HDR offscreen target, applies exposure, then branches
// on 'u.curve' to pick one of five tone-mapping curves before
// emitting an LDR-clamped pixel.  The actual curve formulas live in
// 'lib/tonemap.wesl' so the same math can be unit-tested via
// JS-mirror functions in 'postProcess.ts'.
//
// Curves, branched on 'u.curve':
//   curve=0 — Linear / Clamp.  Pre-HDR baseline, no tone mapping.
//             Cluster cores blow out, filaments invisible.  Reference.
//   curve=1 — Reinhard-extended 'c·(1 + c/W²) / (1+c)'.  Smooth
//             roll-off near 1.0, 'natural' look.  Default.
//   curve=2 — Asinh / Lupton 2004 'asinh(k·c) / asinh(k)'.  Linear
//             near zero, log-like at high values.  Aggressively lifts
//             dim regions — what SDSS's pipeline uses for filaments.
//   curve=3 — Gamma 2.0 'sqrt(clamp(c, 0, 1))'.  Simple midtone
//             lift; cheap, less surgical than asinh.
//   curve=4 — ACES filmic (Narkowicz 2015 approximation):
//             '(c·(2.51·c+0.03)) / (c·(2.43·c+0.59)+0.14)', clamped.
//             Cinematic S-curve with shoulder + toe.
//
// ## Why bindings are declared here, not in io.wesl
//
// WESL has no global state — '@group(N) @binding(M) var X' is a
// module-local declaration that cannot be exported across modules.
// The texture, sampler, and uniform buffer are fragment-only
// resources (the vertex stage doesn't read any of them), so
// declaring them here keeps the visibility scope tight while still
// importing 'ToneMapUniforms' from io.wesl as the single
// authoritative struct definition.

import package::toneMap::io::ToneMapUniforms;
import package::toneMap::io::VSOut;
import package::lib::tonemap::applyLinear;
import package::lib::tonemap::applyReinhard;
import package::lib::tonemap::applyAsinh;
import package::lib::tonemap::applyGamma2;
import package::lib::tonemap::applyAces;

@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var hdrSamp: sampler;
@group(0) @binding(2) var<uniform> u: ToneMapUniforms;

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
