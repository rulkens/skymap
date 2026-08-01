// milkyWayField/io.wesl — layout for the ANALYTIC Milky Way field: a
// Gaussian mixture whose line integral is evaluated per fragment, one
// instanced quad per component, as the closed-form alternative to sampling
// the same density with sprites.
//
// Its own struct, deliberately NOT milkyWayCloud's: nothing here is a
// billboard, so viewProj, the billboard basis and the px clamps are all
// dead weight, while the per-fragment RAY this pass needs has no home in
// that layout at all.
//
// ## Byte layout (canonical — the offset authority for the CPU packer)
//
// HEADER (uniform, binding 0) — camera + params only, unchanged every frame
// in shape though its bytes are rewritten every frame (the fade/exposure
// terms in 'params' track the camera):
//
//   offset 0   : eye: vec4      (xyz camera world position, w unused)
//   offset 16  : camRight: vec4 (world-space camera basis, w unused)
//   offset 32  : camUp: vec4
//   offset 48  : camFwd: vec4
//   offset 64  : params: vec4   (tanHalfFov, aspect, lensShiftX, exposure)
//   offset 80  : counts: vec4   (emissionCount, dustOffset, dustCount, primaryCount)
//   total: 96 bytes.
//
// counts.x is the live EMISSION component count — the central galaxy's plus
// every extra's, drawn one quad each (see splat.wesl). counts.y/.z locate
// the dust slice that follows them: dustOffset == emissionCount (dust is
// always appended AFTER every emission component), dustCount its length.
// Dust components are NEVER drawn as quads — the draw call's instance count
// is counts.x, not counts.x + counts.z — each primary emission fragment
// instead walks the dust slice itself (splat.wesl's fs). counts.w is
// primaryCount, the CENTRAL galaxy's own emission share of counts.x (its
// components are packed first): the gate 'instanceIndex < primaryCount'
// is what keeps an extra's emission from ever reading the primary's dust.
//
// COMPS (read-only storage, binding 1) — every mixture's components back to
// back (the central galaxy's emission, then each background extra's,
// already carried into world space — see transformGalaxyFieldComponent.ts —
// then the central galaxy's dust slice last), four vec4 each. A storage
// array has no fixed capacity the way a uniform array does, which is the
// whole reason this lives in its own binding: a uniform's 64 KiB caps it
// near 1000 components (~3 galaxies' worth), and N extras must be able to
// outgrow that. The CPU packer sizes the backing GPUBuffer to counts.x +
// counts.z (growing, never per-frame).
//
// The ray comes from a camera BASIS plus tanHalfFov/aspect rather than an
// inverse view-projection: the engine already holds the basis (it packs the
// same rows for the sprite billboards) and the fov, so this needs no matrix
// inverse and no depth-convention bookkeeping. lensShiftX undoes the
// off-centre framing the engine writes into proj[8]; without it the
// analytic field slides against the sprites whenever a side panel is open.
//
// Per component, four vec4 carry the WORLD-space inverse covariance M of
// exp(-0.5*(p-center)^T*M*(p-center)), plus amplitude, colour and a centre:
//   [4i]   = (m00, m11, m22, amplitude)
//   [4i+1] = (m01, m02, m12, boundRadius)
//   [4i+2] = (colorR, colorG, colorB, unused)
//   [4i+3] = (cx, cy, cz, unused)
// Six independent M entries, not three sigmas and a tilt: a component's own
// warp shear (buildGalaxyFieldMixture, linearised about its centre) tilts it
// out of any axis-aligned frame. Index 1 of M is the DISC POLE (+Y).
// boundRadius (world-space max sigma, warp-inflated — see
// GalaxyFieldComponent) sizes splat.wesl's per-instance quad.
//
// Dust components (past dustOffset) reuse this exact 4-vec4 record with two
// re-readings, not two new lanes: [4i].w (amplitude for emission) is the
// component's central V-band extinction density, per unit length; [4i+2].xyz
// (color for emission) is the per-channel A_lambda/A_V extinction ratio
// (galaxyDustMixture.ts's DUST_EXTINCTION_RGB), not a tint. [4i+1].w
// (boundRadius) and [4i+3].xyz (center) mean the same thing they do for an
// emission component.

struct FieldUniforms {
  eye: vec4<f32>,
  camRight: vec4<f32>,
  camUp: vec4<f32>,
  camFwd: vec4<f32>,
  params: vec4<f32>,
  counts: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: FieldUniforms;
@group(0) @binding(1) var<storage, read> comps: array<vec4<f32>>;
