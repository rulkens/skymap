// hiiSplat/vertex.wesl — silhouette-quad vertex stage shared by every HII
// pipeline (hiiYoung, hiiErosion, hiiExtras — #78's split). Every draw
// through this module IS an HII draw now, so splat.wesl's former shared vs
// used 'u.dustDetail.y > 0.0' as an is-HII proxy alongside the real
// fadeStart/fadeEnd window check; that proxy half is gone here — it is
// structurally always true for this module. The window check itself stays:
// fadeStart/fadeEnd (io.wesl's youngStars.zw) is a genuine live value this
// module's own header carries, independent of which draw family runs.

import package::milkyWay::field::hiiSplat::io::HiiSplatOut;
import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> HiiSplatOut {
  let corner = quadCorner(vi);
  let mOffBoundRadius = comps[4u * inst + 1u];
  let centerStarsWeight = comps[4u * inst + 3u];
  let center = centerStarsWeight.xyz;
  let boundRadius = mOffBoundRadius.w;

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  // View-space offset of the centre: zv along the gaze, xv/yv across it.
  let rel = center - eye;
  let zv = dot(rel, camFwd);
  let xv = dot(rel, camRight);
  let yv = dot(rel, camUp);

  var out: HiiSplatOut;
  out.inst = inst;
  out.corner = corner;

  // A component the eye has flown inside fades to nothing rather than
  // shading its fullscreen-fallback quad (splatSilhouette.wesl's SPLAT_CUT)
  // at full cost. GUARD: start <= end or start <= 0 disables the fade.
  let fadeStart = u.youngStars.z;
  let fadeEnd = u.youngStars.w;
  if (fadeStart > fadeEnd && fadeStart > 0.0) {
    let fade = smoothstep(fadeEnd * boundRadius, fadeStart * boundRadius, length(rel));
    if (fade <= 0.0) {
      // Same degenerate off-clip-volume corner splatSilhouette.wesl's own
      // fully-behind-camera branch collapses to: zero fragments.
      out.ndc = vec2<f32>(2.0, 2.0);
      out.pos = vec4<f32>(out.ndc, 0.0, 1.0);
      return out;
    }
  }

  let ndc = splatNdc(corner, xv, yv, zv, boundRadius, tanHalfFov, aspect, shift, u.perf.x);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}
