// lib/lensingUniforms.wesl — shared gravitational-lensing uniform, written
// once per frame in renderFrame. Pulled out of the points 'Uniforms' tail
// into its own block so a second pipeline (the volume raymarch, a later
// phase) can bind the same buffer without re-packing it.
//
// 'enabled' == 0 short-circuits the deflection at zero cost; 'count' gates
// the per-vertex lens loop so unused array slots are never read. 'mode'
// selects the deflection profile for every lens this frame (mode 0 = SIS
// constant deflection, 1 = NFW g(x)/x). Each 'LensData' entry carries its
// own precomputed eye-relative geometry and its own r_s — there is no
// longer a shared global scale-radius word. See lib/lensing.wesl for the model.
//
// The @group/@binding decoration is declared by each consuming shader, not
// here: the points + pick vertex stage reads this buffer via the @group(3)
// scene group at @binding(1) (alongside focus at @binding(0)). The standalone
// lensingUniforms bind-group layout exists for a free-group consumer (the volume
// raymarch, VERTEX|FRAGMENT); it binds the same buffer bytes.
//
// Byte layout (528 bytes total). The four header scalars exactly fill the
// first 16-byte slot, so the 16-byte-aligned 'lenses' array starts at byte
// 16 with no padding skew — CPU packer and GPU agree.
//   offset  0 : enabled     u32   master toggle
//   offset  4 : count       u32   active lenses (<= 16)
//   offset  8 : mode        u32   0 = SIS, 1 = NFW
//   offset 12 : _pad0       u32   (reserved; was scaleRadius before per-lens r_s)
//   offset 16 : lenses      array<LensData, 16>   each LensData is two vec4 = 32 bytes:
//                 geom.xyz  unit eye->lens direction (precomputed CPU-side each frame)
//                 geom.w    eye->lens distance, Mpc (precomputed CPU-side each frame)
//                 params.x  thetaERad: Einstein radius (SIS) or peak deflection (NFW)
//                 params.y  r_s: per-lens NFW scale radius, Mpc (SIS ignores it)
//                 params.zw reserved, zero
//
// Per-lens geometry ('dirLens' + 'dL') is precomputed CPU-side each frame so
// the shader does no per-vertex subtract / 'length' / 'normalize' for each lens.
// r_s is now PER-LENS ('params.y'); the old global 'scaleRadius' header word is
// retired to '_pad0'.
//
// The array length (16) MUST match 'MAX_LENSES' in
// utils/gpu/packLensingUniforms.ts — the CPU packer and this length are the
// single drift point for the layout.

struct LensData {
  geom: vec4<f32>,   // xyz = unit eye->lens dir, w = dL (eye->lens distance, Mpc)
  params: vec4<f32>, // x = thetaERad, y = r_s Mpc, zw = 0 (reserved)
}
struct LensingUniforms {
  enabled: u32,
  count: u32,
  mode: u32,
  _pad0: u32,
  lenses: array<LensData, 16>,
}
