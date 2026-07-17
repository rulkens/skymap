// bodyGlint/fragment.wesl — additive soft-dot fragment for sub-pixel bodies.
//
// Byte-for-byte the star-point soft dot ('exp(-r2 * 4.0)' Gaussian falloff —
// bright centre, ~0.018 at the billboard edge), so a body glint and a scene
// star read as the same species of glowing point. The per-body brightness was
// already folded into 'color' in the vertex stage, so this stage carries no
// brightness term of its own.
//
// ## Blend target
//
// PREMULTIPLIED output, '(rgb * alpha, alpha)', into the depthless rgba16float
// HDR accumulation with one/one additive blending (configured pipeline-side in
// bodyGlintRenderer.ts) — the same convention as the survey points and the
// scene stars, so overlapping glints brighten long-exposure style.

import package::bodies::bodyGlint::io::VSOut;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard the billboard's corners so the dot is round.
  if (r2 > 1.0) { discard; }
  // Gaussian-like falloff, matching the survey-point / star-point dot profile.
  let alpha = exp(-r2 * 4.0);
  return vec4<f32>(in.color * alpha, alpha);
}
