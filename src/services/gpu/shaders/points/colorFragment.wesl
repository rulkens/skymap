// points/colorFragment.wesl — visual additive-blend fragment for points.
//
// Renders the normal galaxy disk: elliptical mask, Gaussian falloff,
// procedural-disk crossfade-out, source fade, premultiplied output to
// the swap chain. Sister file to 'pickFragment.wesl', which consumes
// the same VSOut and writes packed instance IDs to an r32uint pick
// texture. The selection ring is drawn by a dedicated pass and is not
// this file's concern.
//
// ## Why bindings appear here even though io.wesl already declared them
//
// They didn't — io.wesl declares only the STRUCT layouts. WESL has
// no global state, so '@group/@binding' declarations are module-local.
// This file re-declares 'u' (at @group(0), same as vertex.wesl) and
// 'fade' (at @group(1), declared only here — the vertex stage doesn't
// read opacity). The struct layouts come from io.wesl and
// fadeUniforms.wesl respectively, so drift is structurally impossible.
// WGSL accepts the same '@group/@binding' pair appearing in multiple
// compiled modules so long as the layouts agree.

import package::points::io::Uniforms;
import package::points::io::VSOut;
import package::lib::math::saturate;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<uniform> fade: FadeUniforms;

// ─── visual fragment stage ─────────────────────────────────────────────
//
// The fragment shader runs once per pixel covered by a rasterised
// triangle. 'in.uv' has been interpolated from the three vertices,
// but since our quad corners all share the same tint and intensity,
// only uv varies meaningfully.

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // ── Elliptical-mask transform ────────────────────────────────────────────
  //
  // The vertex shader hands us a UV in [-1, +1]² centred on the billboard.
  // We want to discard fragments outside an ELLIPSE oriented at PA with
  // semi-axes 1.0 (major) and axisRatio (minor). The cheapest way is to
  // rotate the UV by -PA (so PA-aligned axis becomes screen-x), then divide
  // y by axisRatio (so the unit-circle test in the rotated frame is the
  // ellipse test in the original frame), then apply the existing radial
  // cutoff.
  //
  // The cs/sn pair is pre-computed in the vertex stage and flat-
  // interpolated, saving millions of trig calls per frame.
  let cs = in.paCs;
  let sn = in.paSn;
  let rotated = vec2<f32>(
    cs * in.uv.x - sn * in.uv.y,
    sn * in.uv.x + cs * in.uv.y,
  );
  // axisRatio is guaranteed > 0 by the build pipeline, BUT the synthetic-
  // fallback source (loaded when every real .bin file fails to decode)
  // ships its axisRatio array filled with NaN. 'NaN > 0.0' is false in
  // WGSL, so this single comparison catches both NaN and zero/negative
  // — invalid → safeAB = 1.0 → circular r2 = original dot(uv, uv).
  let abIsValid = in.axisRatio > 0.0;
  let safeAB = select(1.0, max(in.axisRatio, 0.05), abIsValid);
  let elliptic = vec2<f32>(rotated.x, rotated.y / safeAB);
  let r2 = dot(elliptic, elliptic);
  // ────────────────────────────────────────────────────────────────────────

  // Real-only mode: discard fallback fragments entirely. The user
  // enabled this to see ONLY galaxies for which we have measured
  // photometric orientation.
  if (u.realOnlyMode == 1u && in.isFallback == 1u) { discard; }

  // ── Procedural-disk crossfade-OUT ────────────────────────────────────────
  //
  // The thumbnail subsystem's procedural-disk pass fades IN across
  // [u.pxFadeStart, u.pxFadeEnd]; we fade the points-pass OUT with the
  // complementary curve. Sum of the two curves is 1.0 across the band,
  // so the additive HDR contribution stays constant per galaxy through
  // the transition.
  let apparentDiameterPx = in.sizePx * 0.5;
  let fadeT = saturate(
    (apparentDiameterPx - u.pxFadeStart) / (u.pxFadeEnd - u.pxFadeStart),
  );
  let pointAlphaMult = 1.0 - fadeT * fadeT * (3.0 - 2.0 * fadeT);

  // Discard fragments outside the oriented ellipse.
  if (r2 > 1.0) { discard; }

  // Gaussian-like falloff: bright at centre (r²=0 → e⁰=1), fading to
  // e⁻⁴ ≈ 0.018 at the edge (r²=1). The per-instance modulators
  // (Schechter, angular reweight, depth fade) are folded into
  // 'in.intensity' by the vertex stage — see vertex.wesl.
  var alpha = exp(-r2 * 4.0) * pointAlphaMult;

  // Highlight fallback rows in magenta when the toggle is on. The 0.3
  // green keeps fallback galaxies recognisable as 'data-y' rather than
  // turning them into pure UI accents.
  let highlightActive = (u.highlightFallback == 1u) && (in.isFallback == 1u);
  let tintFinal = select(in.tint, in.tint * vec3<f32>(1.0, 0.3, 1.0), highlightActive);
  // Scale the colour by the per-point intensity.
  let rgb = tintFinal * in.intensity;

  // ── Source fade-in ─────────────────────────────────────────────────────────
  //
  // Multiply alpha by the per-source opacity uniform (set per-frame from
  // the JS side based on time-since-upload). 'applyFade' is the
  // documented place that says 'never multiply opacity into RGB' — it
  // takes the scalar alpha alongside opacity and returns the faded
  // scalar alpha, leaving 'rgb' untouched.
  alpha = applyFade(alpha, fade.opacity);

  // ── PREMULTIPLIED ALPHA ──────────────────────────────────────────────────
  //
  // We output (rgb * alpha, alpha) — premultiplied — because the canvas
  // is configured with 'alphaMode: premultiplied'. The additive blend
  // mode is configured in the pipeline descriptor on the JS side.
  return vec4<f32>(rgb * alpha, alpha);
}
