// milkyWayField/field.wesl — the analytic smooth stellar field: one
// fullscreen pass that integrates a Gaussian mixture in closed form along
// the view ray, drawn ADDITIVELY into the same reduced-resolution target
// the sprite pass writes so the two can be compared or blended by eye.
//
// The disc pole is +Y and the disc plane is XZ — the convention
// galaxyGen/generate.wesl places every star in (buildDisk: x = R*cos, z =
// R*sin, y = vertical scatter), so every sigma below reads the same way.
//
// The generator's disc WARP rides in the components' inverse covariances,
// linearised per component into a volume-preserving shear (see
// discWarpShear). That is why nothing here rotates the ray into a
// component's own frame any more: a sheared blob has no such frame.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::gaussianIntegral::gaussianRayIntegral;
import package::milkyWayField::io::u;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  // fullscreenVertex hands back texture-space uv (v down); the ray wants NDC.
  let ndc = vec2<f32>(input.uv.x * 2.0 - 1.0, 1.0 - input.uv.y * 2.0);

  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  // The engine writes a lens shift into proj[8], which SUBTRACTS from x_ndc;
  // adding it back is the exact inverse of that projection, not a fudge.
  let shift = u.params.z;

  let d = normalize(
    u.camRight.xyz * ((ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  var sum = vec3<f32>(0.0, 0.0, 0.0);
  let count = u32(u.counts.x);
  for (var i = 0u; i < count; i = i + 1u) {
    let g0 = u.comps[4u * i];
    let g1 = u.comps[4u * i + 1u];
    let g2 = u.comps[4u * i + 2u];
    let g3 = u.comps[4u * i + 3u];
    // M is defined about the component's OWN centre, not the origin — shift
    // the ray origin into that frame; the direction is translation-invariant.
    let po = o - g3.xyz;
    sum = sum + g2.xyz * (g0.w * gaussianRayIntegral(po, d, g0.xyz, g1.xyz));
  }

  // Alpha 0: the aggregate's alpha channel feeds nothing — the additive
  // upsample folds it into HDR and the compositor forces 1.0 — and a
  // fullscreen quad writing coverage would swamp the sprites' own alpha for
  // no reader's benefit.
  return vec4<f32>(sum * u.params.w, 0.0);
}
