// lib/sourceUniforms.wesl — per-source 5-bit pick-ID uniform for the
// points pipeline.
//
// Carries this draw's 5-bit Source enum value (Synthetic=0, SDSS=1,
// TwoMRS=2, Glade=3, Famous=4). The points vertex stage reads
// 'source.sourceCode' and composes each instance's packed identity as
// '(sourceCode << 27u) | instance_index' for the selection-halo +
// pick-output paths.
//
// ## Why separated from FadeUniforms
//
// Two uniforms with different update cadences:
//   - fade.opacity:   written every frame, every consumer.
//   - source.sourceCode: written once at upload, points only.
//
// Co-locating them in one 16-byte uniform would force every per-frame
// fade write to read-modify-write the sourceCode bytes (or use a
// 4-byte-offset writeBuffer, coupling the layouts), and would give
// every non-points renderer (volumes, filaments, labels, overlays) a
// sourceCode slot they never read. Separating keeps each renderer
// paying only for the uniforms it actually needs.
//
// ## Why @group(2)
//
// @group(0) is the per-frame uniform (viewProj, viewport, …).
// @group(1) is FadeUniforms (universal).
// @group(2) is points-only — SourceUniforms.
//
// Non-points pipelines don't declare @group(2); their pipeline layouts
// list only @group(0) and @group(1).

struct SourceUniforms {
  // 5-bit Source enum value (Synthetic=0, SDSS=1, TwoMRS=2, Glade=3,
  // Famous=4). Stored as u32 because WGSL uniforms have no smaller
  // integer types and the pack-into-pickbuffer uses u32 arithmetic
  // anyway.
  sourceCode: u32,

  // Per-source floor of the points intensity formula
  // 'clamp((22 - mag) / 8, intensityFloor, 1)'. Replaces the prior
  // hardcoded 0.05. A lower floor (e.g. 0.02 for GLADE) reduces the
  // per-galaxy contribution that floored-faint galaxies make to the
  // additive HDR target, which tames center saturation in dense
  // regions. A higher floor (e.g. 0.15 for Milliquas) keeps faint
  // quasars visible since quasar apparent mags often sit past 22 and
  // would otherwise pin to the same floor as faint galaxies.
  intensityFloor: f32,

  // Per-source half-distance of the depth-fade curve
  // '1 / (1 + (d / falloffHalfMpc)^2)'. Replaces the prior hardcoded
  // FALLOFF_HALF_MPC = 1000. Set very large (effectively disables fade)
  // for sparse far-field catalogs like Milliquas; keep at 1000 for the
  // bulk galaxy catalogs where the curve was originally tuned.
  falloffHalfMpc: f32,

  // Remaining pad slot — kept named so a future field can repurpose
  // it without alignment churn.
  _pad2: u32,
};
