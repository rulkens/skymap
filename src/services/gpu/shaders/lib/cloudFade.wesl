// lib/cloudFade.wesl — per-cloud opacity fade helper.
//
// Each renderable cloud uniform has an 'opacity' field at offset 0 in
// [0, 1] that drives the smoothstep tier-swap fade animation. The
// animation itself lives on the CPU (see services/gpu/cloudFade.ts);
// this lib is just the apply step.
//
// We DON'T extract a shared 'CloudUniforms' struct because the
// points and filaments renderers' uniforms genuinely diverge after
// the opacity slot — points packs a 5-bit 'sourceCode' (used to
// compose the pick-output's packed identity), filaments has nothing
// to put there. Forcing a shared struct would either bloat the
// filaments uniform with an unused 'sourceCode' field or invent a
// synthetic 'cloudId' that neither side actually uses. The honest
// shape is: each renderer keeps its own struct; both call
// 'applyCloudFade(color, opacity)' for the actual fade math.
//
// Why a fn at all if it's a one-liner? Because 'color * opacity'
// would mistakenly attenuate RGB; we only want to fade the alpha.
// Newcomers to the codebase have made this mistake before. Taking
// a 'vec4' and returning a 'vec4' makes the contract explicit at
// the type level: RGB passes through, only the alpha channel is
// scaled. The signature itself documents the invariant.
//
// Call this BEFORE the premultiplied-alpha output step (i.e. before
// 'rgb * alpha' is folded into the return value). Both points.wesl
// and filaments.wesl render with 'alphaMode: premultiplied' on the
// canvas, so each fragment ends with 'vec4(faded.rgb * faded.a,
// faded.a)'. The cloud fade is one of several scalar alpha
// modulations applied along the way; lifting it into a helper
// doesn't change the math (multiplication is commutative) but does
// localise the docblock on what the opacity uniform actually means.

fn applyCloudFade(color: vec4<f32>, opacity: f32) -> vec4<f32> {
  return vec4<f32>(color.rgb, color.a * opacity);
}
