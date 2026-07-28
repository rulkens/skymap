// texturedBody/impostorIo.wesl — inter-stage struct for the SPIKE analytic
// ray-traced sphere variant of the textured-body renderer ('?impostor').
//
// Deliberately a SEPARATE module from 'io.wesl' rather than a second struct
// inside it. Two structs carrying '@builtin(position)' linked into one shader
// module is the documented runtime-only landmine (build + WESL linker both pass,
// 'createShaderModule' rejects), so the impostor pair imports only from here and
// the mesh pair only from 'io.wesl'. Neither module ever reaches the other's
// entry points.
//
// ## Why the varying is the PROXY position, not a uv + normal
//
// The mesh path forwards the equirectangular uv and the unit-sphere normal
// because its rasterised triangle already IS the surface. The impostor's
// triangles are not the surface -- they are a circumscribing proxy whose only
// job is to make the fragment stage run over every pixel the true sphere can
// touch. So the one thing the fragment needs from the vertex stage is a point on
// the view ray: the interpolated PROXY position in body-local space. The
// fragment forms 'rd = normalize(localPos - camPosLocal)' and intersects the unit
// sphere analytically; the surface normal and the uv are both derived from that
// hit, per pixel, at full precision.
//
// The interpolated 'localPos' is NOT a unit vector (the proxy is scaled up), and
// the direction must be renormalized AFTER interpolation -- see the fragment.

struct ImpostorVSOut {
  @builtin(position) clip: vec4<f32>,
  // Interpolated position on the circumscribing proxy sphere, in the body's
  // local frame (body radii). A point on the view ray -- nothing more.
  @location(0) localPos: vec3<f32>,
};
