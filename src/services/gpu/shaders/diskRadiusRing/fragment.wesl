// diskRadiusRing/fragment.wesl — solid premultiplied-cyan debug ring.
//
// ## Output colour
//
// A constant high-visibility cyan, distinct from selectionRing's white
// halo so the two overlays are never confused when both are on screen.
// Emitted PREMULTIPLIED ('rgb * alpha, alpha') to match the
// premultiplied-OVER blend the pipeline descriptor sets — same
// convention as selectionRing/fragment.wesl and pickDebugOverlay.  This
// is a post-tone-map UI overlay, so no HDR boost is available or needed.
//
// Bindings: this stage reads no uniforms and no varyings beyond the
// implicit '@builtin(position)', so no '@group/@binding' declarations
// are needed.

import package::diskRadiusRing::io::VsOut;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let alpha = 0.9;
  return vec4<f32>(vec3<f32>(0.0, 1.0, 1.0) * alpha, alpha);
}
