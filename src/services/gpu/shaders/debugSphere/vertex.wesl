// debugSphere/vertex.wesl — vertex stage for the debug-sphere overlay.
//
// The debug sphere is a unit-sphere mesh (generated CPU-side as a UV
// sphere or icosphere) drawn at a body's world-space position via an
// MVP matrix.  This shader has exactly one job: multiply each
// local-space vertex position by the MVP to produce clip-space output,
// and pass the local position through as a per-fragment interpolant so
// the fragment stage can compute a surface normal for shading.
//
// ## Bindings
//
// One binding: '@group(0) @binding(0)' holds 'SphereUniforms' (64
// bytes — one mat4x4<f32>).  A single uniform per draw is enough
// because the MVP folds model + view + projection; there is no
// per-instance data and no texture sampler at this stage.
//
// The choice of @group(0) is consistent with every other simple
// single-pass renderer in this project (selectionRing, foregroundComposite,
// markerLines), where @group(0) carries the renderer's primary per-draw
// uniform and further groups are added only if a second binding is
// needed (textures, fade, per-source data).
//
// ## Why WESL has no global state for the binding
//
// The '@group/@binding' declaration is module-local: WESL cannot
// export it or see it from an imported module.  We declare it here and
// pass 'u.mvp' into the imported 'clip_from_local' helper, matching
// the 'pass cam, don't capture' convention in 'lib/camera.wesl'.
//
// ## Attribute layout
//
//   @location(0) position: vec3<f32>  — unit-sphere local-space vertex
//                                       (CPU mesh builder writes this
//                                       as a tightly-packed f32x3 VBO;
//                                       stride = 12 bytes).

import package::lib::sphere::SphereUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: SphereUniforms;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Local-space position passed through for normal computation in the
  // fragment stage.  For a unit sphere, 'localPos == surfaceNormal',
  // so we don't need a separate normal attribute.
  @location(0) localPos: vec3<f32>,
};

@vertex
fn vs(@location(0) position: vec3<f32>) -> VSOut {
  var out: VSOut;
  // Transform local-space vertex to clip space via the combined MVP.
  // 'clip_from_local' mirrors 'worldToClip' in 'lib/camera.wesl':
  // it takes 'mvp' as an explicit parameter rather than capturing
  // the module-local binding, keeping the helper portable.
  out.clip = clip_from_local(u.mvp, position);
  // For a unit sphere the local-space position IS the surface normal.
  // Passing it as a flat interpolant lets the fragment stage shade
  // without a separate normal stream or a tangent-space reconstruction.
  out.localPos = position;
  return out;
}
