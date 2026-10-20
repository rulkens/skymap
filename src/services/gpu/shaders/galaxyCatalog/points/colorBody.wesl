// points/colorBody.wesl — the galaxy point visual fragment as one function:
// elliptical mask, Gaussian falloff, colour ramp, source fade, premultiplied
// output. Each pipeline's fragment entry point calls it with its own fade
// opacity ('colorFragment.wesl' binds fade at @group(1), the pooled
// 'pooledColorFragment.wesl' at @group(2) @binding(3)). Every other per-instance
// value arrives folded into the VSOut varyings (see 'instanceTint' in io.wesl).

import package::galaxyCatalog::points::io::VSOut;
import package::lib::colorIndex::rampRadial;
import package::lib::fadeUniforms::applyFade;

// ─── visual fragment stage ─────────────────────────────────────────────
//
// The fragment shader runs once per pixel covered by a rasterised
// triangle. 'in.uv' has been interpolated from the three vertices,
// but since our quad corners all share the same tint and intensity,
// only uv varies meaningfully.

fn galaxyPointColor(in: VSOut, opacity: f32) -> vec4<f32> {
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
  // interpolated, saving millions of trig calls per frame. safeAB
  // (the validated ellipse minor-axis ratio) rides alongside them in
  // 'in.ellipse.z', so the fragment does zero per-pixel axis-ratio work.
  let cs = in.ellipse.x;
  let sn = in.ellipse.y;
  let rotated = vec2<f32>(
    cs * in.uv.x - sn * in.uv.y,
    sn * in.uv.x + cs * in.uv.y,
  );
  let elliptic = vec2<f32>(rotated.x, rotated.y / in.ellipse.z);
  let r2 = dot(elliptic, elliptic);
  // ────────────────────────────────────────────────────────────────────────

  // Discard fragments outside the oriented ellipse.
  if (r2 > 1.0) { discard; }

  // Gaussian-like falloff: bright at centre (r²=0 → e⁰=1), fading to
  // e⁻⁴ ≈ 0.018 at the edge (r²=1). All per-instance modulators
  // (intensity scalar, angular reweight, depth fade,
  // procedural-disk crossfade-out, provenance highlight) are folded into
  // 'in.instanceTint.rgb' by the vertex stage — see vertex.wesl. Galaxies
  // culled by a provenance filter ('orientationFilter' / 'sizeFilter') are
  // dropped at the vertex stage too, so this fragment never sees them.
  var alpha = exp(-r2 * 4.0);
  // Warm-core / cool-rim gradient. 'r2' is the ELLIPTIC squared radius
  // from the transform above — already axis-ratio corrected — so
  // 'sqrt(r2)' is the normalised galactocentric radius in the galaxy's
  // own plane, the same quantity the procedural-disk pass reads as
  // 'length(in.uv)'. 'rampRadial' takes that radius alongside the
  // galaxy's colour index (forwarded unchanged in 'in.instanceTint.w')
  // and returns the per-fragment ramp colour directly — see
  // 'lib/colorIndex.wesl' for why a single radius-shifted lookup is the
  // form used, and io.wesl's 'VSOut has no fifth @location' comment for
  // why that call lives here instead of in the vertex stage. The
  // result is then scaled by the per-instance modulator to get the
  // final colour.
  //
  // The match to the procedural-disk pass's own gradient is not exact,
  // and this is a known, accepted approximation rather than a claim of
  // agreement: the point sprite's billboard is padded relative to the
  // galaxy's true apparent extent (see 'PerVertex.radiusMpc' in
  // io.wesl), while the disk impostor's 'r = 1' sits at the disk's true
  // edge. So the same gradient reads somewhat radially compressed on
  // the point relative to the disk. Because the two passes are
  // cross-faded over the 8-14 px band rather than swapped instantly,
  // this reads as the gradient gaining definition on approach rather
  // than as a seam.
  //
  // A NEGATIVE colour index is the provenance-highlight sentinel (see the
  // 'instanceTint' field comment in io.wesl): the vertex stage has already
  // written the flat audit colour into '.rgb', so the ramp collapses to a
  // no-op multiply by white and the debug overlay stays flat rather than
  // gradient-modulated. Note WGSL's argument order — 'select(falseVal,
  // trueVal, cond)' — so the ramp lookup is the FIRST argument here.
  let ci = in.instanceTint.w;
  let rampRgb = select(rampRadial(ci, sqrt(r2)), vec3<f32>(1.0), ci < 0.0);
  let rgb = in.instanceTint.rgb * rampRgb;

  // ── Source fade-in ─────────────────────────────────────────────────────────
  //
  // Multiply alpha by the per-source opacity uniform (set per-frame from
  // the JS side based on time-since-upload). 'applyFade' is the
  // documented place that says 'never multiply opacity into RGB' — it
  // takes the scalar alpha alongside opacity and returns the faded
  // scalar alpha, leaving 'rgb' untouched.
  alpha = applyFade(alpha, opacity);

  // ── PREMULTIPLIED ALPHA ──────────────────────────────────────────────────
  //
  // We output (rgb * alpha, alpha) — premultiplied — because the canvas
  // is configured with 'alphaMode: premultiplied'. The additive blend
  // mode is configured in the pipeline descriptor on the JS side.
  return vec4<f32>(rgb * alpha, alpha);
}
