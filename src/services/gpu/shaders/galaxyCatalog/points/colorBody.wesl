// points/colorBody.wesl — the galaxy point fragment as one function: elliptical mask,
// Gaussian falloff, colour ramp, source fade, premultiplied output. Each pipeline's
// fragment entry point calls it with its own fade opacity ('colorFragment.wesl' binds
// fade at @group(1), 'pooledColorFragment.wesl' at @group(2) @binding(3)). Every other
// per-instance value arrives folded into the VSOut varyings (see 'instanceTint' in io.wesl).

import package::galaxyCatalog::points::io::VSOut;
import package::lib::colorIndex::rampRadial;
import package::lib::fadeUniforms::applyFade;

fn galaxyPointColor(in: VSOut, opacity: f32) -> vec4<f32> {
  // Rotate the UV by -PA, then divide y by axisRatio: the unit-circle test in that
  // frame is the oriented-ellipse test. cs/sn and the validated ratio ('ellipse.z')
  // are flat-interpolated from the vertex stage, so no per-pixel trig.
  let cs = in.ellipse.x;
  let sn = in.ellipse.y;
  let rotated = vec2<f32>(
    cs * in.uv.x - sn * in.uv.y,
    sn * in.uv.x + cs * in.uv.y,
  );
  let elliptic = vec2<f32>(rotated.x, rotated.y / in.ellipse.z);
  let r2 = dot(elliptic, elliptic);

  if (r2 > 1.0) { discard; }

  // e^-4 ~ 0.018 at the edge. Every per-instance modulator is already in instanceTint.rgb.
  var alpha = exp(-r2 * 4.0);
  // 'sqrt(r2)' is the axis-ratio-corrected radius, the same quantity the procedural-disk
  // pass reads as 'length(in.uv)'. The match is approximate: the point billboard is padded
  // past the galaxy's true extent (PerVertex.radiusMpc), so the gradient reads compressed
  // against the disk's, hidden by the 8-14 px cross-fade. A NEGATIVE colour index is the
  // provenance sentinel (io.wesl): the vertex stage wrote a flat audit colour into .rgb,
  // so the ramp collapses to white. 'select' takes (false, true, cond).
  let ci = in.instanceTint.w;
  let rampRgb = select(rampRadial(ci, sqrt(r2)), vec3<f32>(1.0), ci < 0.0);
  let rgb = in.instanceTint.rgb * rampRgb;

  // 'applyFade' scales alpha only: opacity never multiplies into RGB.
  alpha = applyFade(alpha, opacity);

  // Premultiplied: the canvas is alphaMode 'premultiplied', the blend is additive.
  return vec4<f32>(rgb * alpha, alpha);
}
