// filaments/fragment.wesl — soft anti-aliased line fragment stage.
//
// The fragment stage carries the cosmic-web visual identity: a
// soft-edged glow whose brightness and tint vary along the segment
// according to local density. Three modulations:
//
//   - edgeBandMask(uv.y, 0.1) — a two-tailed smoothstep that produces
//     a 10%-on / 80%-flat / 10%-off shape across the line's
//     perpendicular axis. This is the screen-space anti-aliasing.
//   - densityBoost — gamma-stretched density 'pow(d, 0.6)' mapped
//     into [0.2, 1.0] so even sparse tendrils stay visible while
//     dense spines saturate.
//   - tint blend — cool-purple at low density to bright violet at
//     high density. Adds a hue axis on top of the brightness ramp.
//
// Then 'applyFade' folds in the per-cloud opacity uniform that
// lets the renderer ramp the entire skeleton in/out smoothly when a
// new tier loads. The CPU side now drives this through the unified
// FadeRegistry (state.subsystems.fades) — see filamentRenderer.ts
// and filamentSlot.ts for the wiring.
//
// ## Why bindings are declared here, not in io.wesl
//
// Same WESL no-global-state argument as elsewhere: 'Uniforms' is
// imported from io.wesl, the @group/@binding declarations live here,
// and the layout matches vertex.wesl's identical declaration.
// 'FadeUniforms' lives in 'lib/fadeUniforms.wesl' — a 16-byte
// struct with a single 'opacity' f32 (plus 12 bytes pad).

import package::filaments::io::Uniforms;
import package::filaments::io::VSOut;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;
// Shared fragment-stage mask shapes — see 'lib/masks.wesl' for the
// rationale (three smoothstep patterns recurred across four shaders,
// naming the shapes makes the intent visible at the call site).
// 'edgeBandMask(axis, fade)' is the two-tailed soft-window pattern
// previously spelled inline as 'smoothstep(0, fade, x) * (1 -
// smoothstep(1-fade, 1, x))' below.
import package::lib::masks::edgeBandMask;

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(1) @binding(0) var<uniform> fade : FadeUniforms;

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // Soft anti-aliased edge: uv.y ∈ [0, 1], peak at 0.5.
  // 'edgeBandMask(axis, fade)' carves a soft window around the centre
  // — fade=0.1 gives a 10%-on / 80%-flat / 10%-off shape. The two-tailed
  // smoothstep pattern lives in 'lib/masks.wesl' for the longer
  // rationale; this is the call site that motivated the helper's
  // existence.
  let edgeFade = edgeBandMask(in.uv.y, 0.1);

  // ── Density-aware brightness + tint ──────────────────────────────
  //
  // The per-vertex density attribute is min-max-normalised at build
  // time (see 'skeletonToFilamentCloud' in 'tools/parsers/ndskl.ts'),
  // so 'in.density' ∈ [0, 1] across the whole catalogue: 0 = the
  // sparsest filament vertex, 1 = the densest.  The vertex stage
  // already linearly interpolates 'startDensity' ↔ 'endDensity' along
  // the segment, so within a single filament the value rises smoothly
  // toward dense hub regions.
  //
  // Two simultaneous modulations:
  //
  // * 'densityBoost' ramps alpha from a visible floor (0.2) at
  //   low-density tendrils to full (1.0) at the brightest spine
  //   vertices.  The 'pow(d, 0.6)' gamma-correction stretches the
  //   low end of the curve — without it, a near-linear ramp would
  //   crush the dim 0.1–0.4 range to invisibility against the
  //   tone-mapped HDR background.  0.6 is empirical; the eye reads
  //   the resulting falloff as smooth.
  //
  // * 'tint' blends from a base soft purple at low density toward a
  //   brighter, slightly more white-blue purple at high density.
  //   This adds a second visual axis (hue, not just brightness) so
  //   the cosmic-web spine pops without needing the alpha alone to
  //   carry the contrast.  The two endpoints have similar luminance
  //   so the tint shift reads as colour temperature, not glare.
  //
  // Disclaimer: 'density' here is the DTFE field value at the vertex,
  // NOT the per-filament robustness in σ (which is what DisPerSE's
  // persistence cut threshold uses).  They're correlated — denser
  // ridges tend to be more persistent — but not identical.  See the
  // 'Phase 3' note in the DisPerSE plan for the proper σ-coded
  // visualisation, which would require capturing per-filament
  // robustness in the parser, bumping the FILA binary format to v2,
  // and adding a second per-segment vertex attribute.
  let densityBoost = mix(0.2, 1.0, pow(in.density, 0.6));

  // The tint-ramp endpoints are uniforms the CPU packs from 'FILAMENT_BASE_TINT'
  // and 'FILAMENT_HOT_TINT' in 'filamentsLayer.ts' (the one home for the layer's
  // palette): 'u.baseTint' the dim cool-purple tendrils, 'u.hotTint' the bright
  // near-white-violet spine.
  let tint = mix(u.baseTint, u.hotTint, in.density);

  // Per-cloud fade-in (opacity uniform written each frame from JS).
  // 'applyFade' (lib/fadeUniforms.wesl) is the documented place that
  // says 'never multiply opacity into RGB' — it's a scalar helper that
  // folds opacity into 'alpha' alongside the other modulators here.
  let alpha = applyFade(
    edgeFade * 0.6 * densityBoost * u.intensityScale,
    fade.opacity,
  );
  return vec4<f32>(tint * alpha, alpha);  // pre-multiplied alpha
}
