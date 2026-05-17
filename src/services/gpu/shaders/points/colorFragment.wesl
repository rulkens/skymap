// points/colorFragment.wesl — visual additive-blend fragment for points.
//
// Sister file to 'pickFragment.wesl'. Both consume the same VSOut
// produced by 'vertex.wesl'; this one writes RGBA to the swap-chain
// (additive-blended), the other writes a u32 instance ID to an
// r32uint pick texture. Splitting the two fragments into separate
// modules lets each renderer's pipeline build a strictly-smaller
// shader from disjoint sources, and structurally prevents the
// 'selection on wrong galaxy' class of bugs that came from a single
// shared module servicing two pipelines with diverging fragment paths.
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

  // ── Procedural-disk crossfade-OUT (applies to BOTH selected & normal) ────
  //
  // Hoisted out of the normal-point branch below so the selection-ring
  // path also fades. Without this, selecting a galaxy and then zooming
  // through the [pxFadeStart, pxFadeEnd] band leaves the selection's
  // 8× billboard rendered on top of the procedural-disk impostor.
  //
  // The fade trigger is the UNSCALED 'in.sizePx' (vertex stage forwards
  // 'sizePx' BEFORE applying the 8× sizeScale), so the fade band aligns
  // with the procedural-disk emission band on the underlying galaxy
  // footprint — not the inflated halo radius.
  let apparentDiameterPx = in.sizePx * 0.5;
  let fadeT = saturate(
    (apparentDiameterPx - u.pxFadeStart) / (u.pxFadeEnd - u.pxFadeStart),
  );
  let pointAlphaMult = 1.0 - fadeT * fadeT * (3.0 - 2.0 * fadeT);

  // ── SELECTION RING vs NORMAL DISK ─────────────────────────────────────────
  //
  // For the selected point we rendered a 8× larger billboard in 'vs', so
  // the UV space still spans [-1,+1]² but represents a physically bigger
  // area. We draw a hollow ring by:
  //   1. Discarding the outer region (r² > 1.0) → circular boundary.
  //   2. Discarding the inner region (r² < 0.4) → hollow centre.
  //   3. Applying a brighter colour on the ring band.
  if (in.selected == 1u) {
    // Selection halo stays circular for a clean ring regardless of disk
    // orientation. Recompute r2 with the round dot(uv, uv) so an edge-on
    // ellipse doesn't disappear into a discarded slot when selected.
    let r2_circ = dot(in.uv, in.uv);

    // Outside the outer edge of the scaled billboard — discard.
    if (r2_circ > 1.0) { discard; }

    // ── Inner disk (the point itself) ──────────────────────────────────────
    //
    // We scaled the billboard 8× in 'vs', so the original point's footprint
    // occupies the inner 1/8 in linear distance — i.e. r² ≤ (1/8)² = 1/64
    // ≈ 0.0156 in this scaled UV space. Inside that radius we render the
    // *normal* point disk so the user can still see the selected galaxy's
    // own brightness.
    //
    // CRITICAL: use the ELLIPTICAL 'r2' (computed above from the rotated +
    // squashed UV) here, NOT 'r2_circ'. With the round mask the selected
    // galaxy's inner shape would suddenly become a perfect circle, making
    // it look like the orientation collapsed on click.
    //
    // The alpha factor 'exp(-r2 * 256)' is the original 'exp(-r2 * 4)'
    // remapped: at r² = 1/64, we want the same 'exp(-4)' falloff the
    // unscaled point would have, so we multiply r² by 64 (= 8²) before
    // applying the original ×4 coefficient → 256.
    if (r2 < 0.0156) {
      let alpha = exp(-r2 * 256.0) * pointAlphaMult;
      let rgb   = in.tint * in.intensity;
      return vec4<f32>(rgb * alpha, alpha);
    }

    // ── Selection ring annulus ─────────────────────────────────────────────
    //
    // The ring is a UI element marking the user's selection: it must
    // stay visible at every zoom level (NOT fade through the
    // procedural-disk crossfade band) AND keep a roughly constant on-
    // screen stroke width so the band doesn't bloat into a wide bright
    // disc when zoomed in close.
    //
    // We pick a target stroke width in pixels and convert that into a
    // fraction of the billboard radius using 'in.sizePx * 8.0' (the
    // actual on-screen halo radius). 'min(0.15, …)' caps the band
    // fraction at the original 15 % so faint/far galaxies don't end up
    // with a stroke wider than the billboard itself.
    let HALO_RADIUS_PX = in.sizePx * 8.0;
    let TARGET_STROKE_PX = 4.0;
    let bandFraction = min(0.15, TARGET_STROKE_PX / max(HALO_RADIUS_PX, 1.0));

    let r_circ = sqrt(r2_circ);
    let innerR = 1.0 - bandFraction;
    if (r_circ > innerR) {
      // Soft-edge anti-aliasing on both sides of the band. The fade
      // window is a tenth of the band width on each side so we keep
      // most of the stroke at full intensity but avoid hard pixelation.
      //
      // We deliberately do NOT multiply by 'pointAlphaMult' here — the
      // ring is UI and stays at full intensity through the procedural-
      // disk crossfade band. The inner-disk case above DOES fade
      // because the procedural disk takes over rendering the galaxy
      // itself in that band; the ring has no equivalent replacement.
      let edgeFade = bandFraction * 0.1;
      let inEdge   = smoothstep(innerR, innerR + edgeFade, r_circ);
      let outEdge  = 1.0 - smoothstep(1.0 - edgeFade, 1.0, r_circ);
      let alpha    = inEdge * outEdge;

      // Brighten the ring relative to the natural point colour. 2.5×
      // plus a constant white floor (0.7) keeps it salient even when
      // the underlying galaxy is dim. Additive blending saturates
      // naturally toward white.
      let rgb = in.tint * (in.intensity * 2.5 + 0.7);

      return vec4<f32>(rgb * alpha, alpha);
    }

    // Gap between the inner point and the ring — fully transparent so
    // the selection is visually a 'point + halo' pair rather than a
    // giant disk.
    discard;
  }

  // ── NORMAL POINT — solid disk with Gaussian falloff (now ELLIPTICAL) ──────

  // Discard fragments outside the oriented ellipse.
  if (r2 > 1.0) { discard; }

  // Gaussian-like falloff: bright at centre (r²=0 → e⁰=1), fading to
  // e⁻⁴ ≈ 0.018 at the edge (r²=1).
  var alpha = exp(-r2 * 4.0);

  // ── Schechter density correction (mode 3) ────────────────────────────
  //
  // Modulate alpha by the per-galaxy ratio 'clamp(N_ref / n(d), 0, 10)'
  // baked at upload time into 'in.schechterRatio'. Originally a 200-step
  // trapezoidal integral evaluated PER FRAGMENT; now a single multiply.
  let schechterAlpha_ = select(1.0, in.schechterRatio, u.biasMode == 3u);
  alpha = alpha * schechterAlpha_;

  // ── HEALPix angular re-weight (mode 4) ────────────────────────────
  //
  // Modulate alpha by the per-galaxy ratio
  // 'clamp(medianCellCount / localCellCount, 0.1, 10)' baked at toggle
  // time into 'in.angularDensityWeight'. Down-weights galaxies in
  // over-dense angular cells and up-weights galaxies in sparse cells,
  // flattening radial pencil-beam-jet artefacts.
  let angWeight = select(1.0, in.angularDensityWeight, u.biasMode == 4u);
  alpha = alpha * angWeight;

  // ── Camera-distance depth fade ───────────────────────────────────────────
  //
  // Every line through the catalog origin under additive billboards
  // accumulates hundreds of overlapping galaxies in a single screen
  // pixel. The depth-fade multiplier is pre-computed in the vertex
  // stage and flat-interpolated as 'in.depthFade' (the vertex stage
  // already handles the 'u.depthFadeEnabled' gate, so this is
  // unconditionally a multiply).
  alpha = alpha * in.depthFade;

  // ── Procedural-disk crossfade-OUT ────────────────────────────────────────
  //
  // The thumbnail subsystem's procedural-disk pass fades IN across
  // [u.pxFadeStart, u.pxFadeEnd]; we fade the points-pass OUT with the
  // complementary curve. Sum of the two curves is 1.0 across the band,
  // so the additive HDR contribution stays constant per galaxy through
  // the transition.
  alpha = alpha * pointAlphaMult;

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
