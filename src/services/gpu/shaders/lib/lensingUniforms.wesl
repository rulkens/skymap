// lib/lensingUniforms.wesl — shared gravitational-lensing uniform, written
// once per frame in renderFrame. Pulled out of the points 'Uniforms' tail
// into its own block so a second pipeline (the volume raymarch, a later
// phase) can bind the same buffer without re-packing it.
//
// 'enabled' == 0 short-circuits the deflection at zero cost; 'count' gates
// the per-vertex lens loop so unused array slots are never read. 'mode' +
// 'scaleRadius' are the shared profile knobs applied to every lens this
// frame (mode 0 = SIS constant deflection, 1 = NFW g(x)/x; scaleRadius is
// the NFW r_s in Mpc, ignored by SIS). See lib/lensing.wesl for the model.
//
// The @group/@binding decoration is declared by each consuming shader, not
// here: the points + pick vertex stage reads this buffer via the @group(3)
// scene group at @binding(1) (alongside focus at @binding(0)). The standalone
// lensingUniforms bind-group layout exists for a free-group consumer (the volume
// raymarch, VERTEX|FRAGMENT); it binds the same buffer bytes.
//
// Byte layout (272 bytes total). The four header scalars exactly fill the
// first 16-byte slot, so the 16-byte-aligned 'lenses' array starts at byte
// 16 with no padding skew — CPU packer and GPU agree.
//   offset  0 : enabled     u32   master toggle
//   offset  4 : count       u32   active lenses (<= 16)
//   offset  8 : mode        u32   0 = SIS, 1 = NFW
//   offset 12 : scaleRadius f32   NFW r_s in Mpc (SIS ignores)
//   offset 16 : lenses      array<vec4<f32>, 16>  xyz = centre Mpc,
//                                 w = peak deflection rad (theta_E in SIS)
//
// The array length (16) MUST match 'MAX_LENSES' in
// utils/gpu/packLensingUniforms.ts — the CPU packer and this length are the
// single drift point for the layout.

struct LensingUniforms {
  enabled: u32,
  count: u32,
  mode: u32,
  scaleRadius: f32,
  lenses: array<vec4<f32>, 16>,
}
