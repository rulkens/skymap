// lightTime/io.wesl — uniforms + vertex output for the light-time spheres.
//
// Everything is in SPHERE-RADIUS units: the radii span ~1e-14..3e2 Mpc and raw
// Mpc squares underflow f32 at the small end. Per sphere the CPU computes, in
// f64, ro = (eye - centre) / R and c = |ro|^2 - 1 — the cancellation near the
// surface is beyond f32 — so each sphere is the unit sphere at the origin.
//
// Layout (192 bytes), TWIN: lightTimeSpheresRenderer.ts. Only `count` slots are live.
//   offset   0 : camForward (vec3) + tanHalfFovY (f32)
//   offset  16 : camRight   (vec3) + aspect      (f32)
//   offset  32 : camUp      (vec3) + count       (f32)
//   offset  48 : rect (vec4) — NDC minX, minY, maxX, maxY of the quad
//   offset  64 : 4 x Sphere, stride 32

struct Sphere {
  // ro.xyz, opacity
  roOpacity: vec4<f32>,
  // c, 0, 0, 0
  c: vec4<f32>,
};

struct Uniforms {
  camForward: vec3<f32>,
  tanHalfFovY: f32,
  camRight: vec3<f32>,
  aspect: f32,
  camUp: vec3<f32>,
  count: f32,
  rect: vec4<f32>,
  spheres: array<Sphere, 4>,
};

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
};
