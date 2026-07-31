// compositor/fragment.wesl — unified composite + optional tone-map.
//
// Samples the source offscreen target once, then splits on
// 'u.toneEnabled':
//
//   toneEnabled == 0 — raw pass-through. The source is already display-
//     ready, or is an additive HDR contribution whose values legitimately
//     exceed 1.0; either way we must NOT clamp or reshape it. The blend
//     hardware, not the shader, decides how it lands in the target.
//     (The planned foreground-galaxy 'over' composite is the exception:
//     it runs tone ENABLED, sharing the HDR composite's tone object, so
//     it does not take this branch.)
//   toneEnabled == 1 — apply exposure then one of five tone curves to
//     compress HDR into display range, exactly as the old toneMap pass.
//
// Curves, branched on 'u.curve' (unchanged from the tone-map pass this superseded):
//   curve=0 — Linear / Clamp.  Pre-HDR baseline, no tone mapping.
//   curve=1 — Reinhard-extended 'c·(1 + c/W²) / (1+c)'.  Default.
//   curve=2 — Asinh / Lupton 2004 'asinh(k·c) / asinh(k)'.  Lifts dim.
//   curve=3 — Gamma 2.0 'sqrt(clamp(c, 0, 1))'.  Cheap midtone lift.
//   curve=4 — ACES filmic (Narkowicz 2015).  Cinematic S-curve.
//
// The curve formulas live in 'lib/tonemap.wesl' so the same math can
// be unit-tested via the JS-mirror functions in 'compositor.ts'.
//
// ## Why bindings are declared here, not in io.wesl
//
// WESL has no global state — '@group(N) @binding(M) var X' is a
// module-local declaration that cannot be exported across modules.
// The texture, sampler, and uniform buffer are fragment-only resources
// (the vertex stage reads none of them), so declaring them here keeps
// the visibility scope tight while importing 'CompositorUniforms' from
// io.wesl as the single authoritative struct definition.

import package::compositor::io::CompositorUniforms;
import package::compositor::io::VSOut;
import package::lib::tonemap::applyLinear;
import package::lib::tonemap::applyReinhard;
import package::lib::tonemap::applyAsinh;
import package::lib::tonemap::applyGamma2;
import package::lib::tonemap::applyAces;

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSamp: sampler;
@group(0) @binding(2) var<uniform> u: CompositorUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Sample ONCE, unconditionally, at the top — keeping the texture read
  // out of any control flow avoids WGSL's non-uniform-control-flow
  // edge cases around 'textureSample' (which needs implicit derivatives
  // and so must not sit inside a branch that varies across a quad).
  let sample = textureSample(srcTex, srcSamp, in.uv);

  if (u.toneEnabled == 0u) {
    // Raw pass-through: no exposure, no curve, no clamp. Additive HDR
    // values above 1.0 are legitimate here, and a foreground LDR layer
    // is already display-ready. Alpha is carried straight so the blend
    // hardware can apply it (OVER) or ignore it (additive).
    return sample;
  }

  let scaled = sample.rgb * u.exposure;
  // Dynamic-uniform branch — 'curve' is identical across all fragments
  // in a frame, so the GPU's branch predictor handles this efficiently.
  // A chain of 'if's rather than a 'switch' because WGSL's 'switch'
  // must end in 'default' and the chain reads cleaner with fall-through-
  // impossible curves.
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

  // Every curve above clamps into [0,1], so 'mapped' can never exceed white and
  // a pixel past the curve's saturation point is indistinguishable from one far
  // past it. On an extended-range swap we hand those pixels back their
  // separation: energy ABOVE the knee is added on top, so bright sources (Sun,
  // bloom, star cores) climb into the display's headroom instead of flattening
  // to paper-white. hdrKnee defaults to the curve's own saturation point, so the
  // spill picks up exactly where the curve gives up. hdrHeadroom of 0 (every SDR
  // draw) adds nothing and the result is bit-identical to the curve alone.
  //
  // Brightness is the MAX CHANNEL, matching the bloom bright-pass ('bloom/
  // bright.wesl'), so the two passes agree on which pixels count as bright. The
  // spill then rides the pixel's own colour ratio rather than being added per
  // channel: a saturated red star gains brightness without drifting toward
  // white, upholding the hue contract 'lib/starKnee.wesl' establishes upstream.
  // A per-channel add would re-introduce exactly the channel-at-a-time distortion
  // that module exists to prevent, one stage later.
  let lum = max(scaled.r, max(scaled.g, scaled.b));
  let peak = max(0.0, lum - u.hdrKnee);
  let tint = scaled / max(lum, 0.0001);
  let out = mapped + tint * peak * u.hdrHeadroom;

  // Alpha depends on the blend the caller picked, packed into
  // 'preserveAlpha':
  //   preserveAlpha == 0 (replace) — force opaque 1.0. The swap chain
  //     is 'alphaMode: premultiplied' and the tone-map consumer relies
  //     on an opaque result (we just composited the entire scene).
  //   preserveAlpha == 1 (over / additive) — carry the source's
  //     straight-alpha coverage. It is un-premultiplied: the blend
  //     hardware applies the 'src-alpha' multiply itself, so
  //     premultiplying here too would double-multiply and darken edges.
  return vec4<f32>(out, select(1.0, sample.a, u.preserveAlpha == 1u));
}
