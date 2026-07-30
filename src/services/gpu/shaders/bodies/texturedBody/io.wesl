// texturedBody/io.wesl — inter-stage struct for the textured planet / moon
// renderer.
//
// One authoritative inter-stage declaration makes vertex/fragment @location
// drift structurally impossible -- the same reasoning 'earth/io.wesl' states. If
// the two stages each declared their own copy, a field reorder or a changed
// @location on one side would silently mis-wire the interpolants.
//
// This is also the module's ONLY '@builtin(position)'-bearing struct, and the
// fragment's output struct deliberately carries none. Two of them linked into
// one shader module is the documented runtime-only landmine: the build and the
// WESL linker both pass, and 'createShaderModule' rejects.
//
// ## Why the varying is the PROXY position, and nothing else
//
// A mesh-drawn body forwards the equirectangular uv and the unit-sphere normal,
// because its rasterised triangle already IS the surface. These triangles are
// not the surface -- they are a circumscribing proxy shell whose only job is to
// make the fragment stage run over every pixel the true sphere can touch. So the
// one thing the fragment needs from the vertex stage is a point on the view ray:
// the interpolated proxy position in body-local space. The fragment forms
// 'rd = normalize(localPos - camPosLocal)' and intersects the unit sphere
// analytically; the surface normal, the uv and the depth are all derived from
// that hit, per pixel, at full precision.
//
// The interpolated 'localPos' is NOT a unit vector (the proxy is scaled up), and
// the direction must be renormalized AFTER interpolation -- see the fragment.

struct TexturedBodyVSOut {
  @builtin(position) clip: vec4<f32>,
  // Interpolated position on the circumscribing proxy sphere, in the body's
  // local frame (body radii). A point on the view ray -- nothing more.
  @location(0) localPos: vec3<f32>,
};
