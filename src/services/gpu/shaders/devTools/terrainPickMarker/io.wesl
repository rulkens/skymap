// terrainPickMarker/io.wesl — byte-layout contract for the terrain-pick debug
// marker (exceeds the usual header budget on that basis, per lib/camera.wesl's
// precedent). Everything here is in EYE-RELATIVE body-fixed METRES, the same
// frame 'surfaceTile/vertex.wesl' hands its own positions to the same 'vp', so
// the marker's analytic depth and the drawn terrain's depth are commensurable.
//
// 'vp' is the body-m slab's own view-projection, uploaded unchanged: body rows
// build it about the eye, so it already carries no world translation and the
// f32 cancellation 'lib/analyticSphere.wesl's depth section warns about cannot
// arise -- there is no large magnitude left to subtract.
//
// ## Byte layout (uniform address space)
//
//   offset   0..63:  vp            (mat4x4<f32>, column-major)
//   offset  64..75:  centreRelEyeM (vec3<f32> -- pick point minus eye, metres)
//   offset  76..79:  radiusM       (f32 -- fills centreRelEyeM's 4th slot)
//   offset  80..91:  camRight      (vec3<f32> -- billboard axis, body-fixed)
//   offset  92..95:  _pad0         (f32)
//   offset  96..107: camUp         (vec3<f32> -- billboard axis, body-fixed)
//   offset 108..111: _pad1         (f32)
//   total: 112 bytes.
//
// The CPU side uploads 28 f32s; 'terrainPickMarkerRenderer.ts' is the one
// matching statement of this layout.

struct TerrainPickMarkerUniforms {
  vp: mat4x4<f32>,
  centreRelEyeM: vec3<f32>,
  radiusM: f32,
  camRight: vec3<f32>,
  _pad0: f32,
  camUp: vec3<f32>,
  _pad1: f32,
};

// The billboard's half-extent in marker radii. The eye is always many radii
// away (the radius is derived FROM the eye's range, a dozen pixels' worth), so
// the projected disc never exceeds the quad; the margin only covers the
// perspective widening a strictly-1.0 quad would shave off the silhouette.
const QUAD_MARGIN: f32 = 1.25;

struct MarkerVSOut {
  @builtin(position) clip: vec4<f32>,
  // The quad corner in eye-relative metres: the eye sits at the origin of this
  // frame, so this interpolant IS the ray, before normalizing per fragment.
  @location(0) rayM: vec3<f32>,
};
