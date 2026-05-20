// selectionRing/vertex.wesl — project the selected galaxy's world
// position and expand a screen-aligned `ringRadiusPx`-radius quad.
//
// Bindings live here, not in io.wesl — WESL has no global state, so
// `@group/@binding` declarations are module-local.  We re-declare both
// uniforms using the structs imported from io.wesl.

import package::selectionRing::io::SelectionRingUniforms;
import package::selectionRing::io::VsOut;
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<uniform> sel: SelectionRingUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  // Project the selected galaxy's world position to clip space.  The
  // shared helper makes the camera path identical to every other
  // billboard renderer in the project.
  let center = worldToClip(cam, sel.worldPos);

  // Look up this vertex's unit-quad corner in [-1, +1]² via the shared
  // billboard helper.  Six vertices per quad (non-indexed triangle-list).
  let corner = quadCorner(vi);

  // Expand the centre by `ringRadiusPx` pixels.  The CPU already baked
  // the 8× halo factor into `ringRadiusPx`, so the helper returns the
  // final clip-space delta with no per-instance sizeScale.
  let offset = expandBillboardScreen(cam, center, sel.ringRadiusPx, corner);

  var out: VsOut;
  out.pos = center + vec4<f32>(offset, 0.0, 0.0);
  out.uv = corner;
  out.ringRadiusPx = sel.ringRadiusPx;
  return out;
}
