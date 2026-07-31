// milkyWayField/io.wesl — uniform layout for the ANALYTIC Milky Way field:
// a Gaussian mixture whose line integral is evaluated per fragment in one
// fullscreen pass, as the closed-form alternative to sampling the same
// density with sprites.
//
// Its own struct, deliberately NOT milkyWayCloud's: nothing here is a
// billboard, so viewProj, the billboard basis and the px clamps are all
// dead weight, while the per-fragment RAY this pass needs has no home in
// that layout at all.
//
// ## Byte layout (canonical — the offset authority for the CPU packer)
//
//   offset 0   : eye: vec4      (xyz camera world position, w unused)
//   offset 16  : camRight: vec4 (world-space camera basis, w unused)
//   offset 32  : camUp: vec4
//   offset 48  : camFwd: vec4
//   offset 64  : params: vec4   (tanHalfFov, aspect, lensShiftX, exposure)
//   offset 80  : counts: vec4   (componentCount, 0, 0, 0)
//   offset 96  : comps: array<vec4, 36>  (THREE vec4 per component, 12 max)
//   total: 672 bytes.
//
// The ray comes from a camera BASIS plus tanHalfFov/aspect rather than an
// inverse view-projection: the engine already holds the basis (it packs the
// same rows for the sprite billboards) and the fov, so this needs no matrix
// inverse and no depth-convention bookkeeping. lensShiftX undoes the
// off-centre framing the engine writes into proj[8]; without it the
// analytic field slides against the sprites whenever a side panel is open.
//
// Per component, three vec4 carry the WORLD-space inverse covariance M of
// exp(-0.5 * p^T*M*p), plus amplitude and colour:
//   [3i]   = (m00, m11, m22, amplitude)
//   [3i+1] = (m01, m02, m12, unused)
//   [3i+2] = (colorR, colorG, colorB, unused)
// Six independent entries, not three sigmas and a tilt: the disc warp shears
// each component (buildGalaxyFieldMixture), and a sheared Gaussian has no
// axis-aligned frame to name sigmas in. Index 1 of M is the DISC POLE (+Y).

struct FieldUniforms {
  eye: vec4<f32>,
  camRight: vec4<f32>,
  camUp: vec4<f32>,
  camFwd: vec4<f32>,
  params: vec4<f32>,
  counts: vec4<f32>,
  // 36 slots = GALAXY_FIELD_MAX_COMPONENTS (12) x 3 vec4. Fixed size
  // because a uniform array cannot be runtime-sized; counts.x says how many
  // are live, and the rest are never read.
  comps: array<vec4<f32>, 36>,
};

@group(0) @binding(0) var<uniform> u: FieldUniforms;
