// atmosphere/shell/vertex.wesl — vertex stage for the atmosphere in-scatter
// shell.
//
// Identical projection wiring to 'cloudShell/vertex.wesl' and the other sphere
// bodies: multiply each unit-sphere local position by the combined MVP from
// 'AtmosphereUniforms'. The caller's 'composeBodyMvp' scales the unit sphere to
// the ATMOSPHERE-TOP radius and places it in Earth's frame, so in this mesh's
// local frame the atmosphere top is the UNIT sphere and the ground sphere has
// radius 'u.bottomRadius' in (0, 1). This stage stays a plain matrix multiply
// and forwards the unit-atmosphere-top LOCAL position to the fragment, which
// reconstructs the view ray from it and 'u.camPosLocal'.
//
// ## Both-wall draw (the renderer's 'cullMode:\'none\'')
//
// The pipeline draws BOTH walls, and the fragment splits duty by
// '@builtin(front_facing)': the NEAR (front) wall carries the over-disc aerial
// perspective (haze on the lit disc), the FAR (back) wall the limb + sky.
// Depth-testing each wall against the already-stamped opaque scene keeps
// cross-body occlusion for both. This vertex stage is unaware of that -- it just
// projects; the split is pure pipeline + fragment geometry.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'AtmosphereUniforms' (176 bytes: the mat4x4<f32>
// MVP, body-local sun direction, bottomRadius, camPosLocal, exposure, ring
// ratios, and the inverse MVP), visible in BOTH stages. The vertex reads only
// 'u.mvp'; the fragment reads the rest. The '@group/@binding' declaration is
// module-local (WESL has no global state), so we declare 'u' here and pass
// 'u.mvp' into the imported 'clip_from_local' helper -- the 'pass cam, don't
// capture' idiom.
//
// ## Attribute layout
//
//   @location(0) position: vec3<f32>  — unit-sphere local-space vertex
//                                       ('uvSphereMesh', tightly-packed f32x3).
// The mesh also carries an equirectangular uv at @location(1); the atmosphere
// shell samples no surface texture, so it does not declare that input (an unused
// vertex-buffer attribute is legal).
//
// ## Inter-stage contract (matched by @location, NOT a shared struct)
//
// 'VsOut.localPos' at @location(0) MUST match 'fragment.wesl's input at
// @location(0). Kept as two independent structs (not a shared 'io.wesl') to stay
// within this task's six-file budget; the pairing is by location, which WGSL
// guarantees. If you reorder or renumber here, mirror it in the fragment.

import package::lib::sphere::AtmosphereUniforms;
import package::lib::sphere::clip_from_local;
import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

@group(0) @binding(0) var<uniform> u: AtmosphereUniforms;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  // Unit-atmosphere-top local-space vertex position, interpolated across the
  // face. The fragment builds its view ray as 'normalize(localPos - camPosLocal)'
  // (renormalized -- the house trap after a scaled model transform).
  @location(0) localPos: vec3<f32>,
};

@vertex
fn vs(@location(0) position: vec3<f32>) -> VsOut {
  var out: VsOut;
  out.clip = clip_from_local(u.mvp, position);
  out.localPos = position;
  return out;
}

// Inside-shell path (Task 6's froxel-adjacent full-screen pass): no proxy
// mesh, no vertex buffer -- just the covering triangle. The fragment
// reconstructs the view ray by unprojecting through 'u.invMvp' instead of
// reading an interpolated local position.
@vertex
fn insideVs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}
