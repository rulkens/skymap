// lib/sphere.wesl — shared sphere uniform layouts + local-to-clip helper.
//
// Byte-layout contract: each struct's CPU packer (named per struct) must agree
// byte-for-byte, and the layout tables below run longer than the comment budget
// on that account. A vec3 is 16-byte aligned, so its 4-byte tail is filled with
// a REAL field where one is listed. Every struct below that begins with the
// 80-byte `mvp` + `sunDirLocal` prefix reuses `packLitBodyUniforms` for it.

struct SphereUniforms {
  mvp: mat4x4<f32>,
};

// ── TintedSphereUniforms ─────────────────────────────────────────────
//
// Star renderer. A second struct rather than a colour field on SphereUniforms:
// Earth binds a 64-byte buffer, and iOS rejects a struct larger than its 80-byte
// buffer, so a new field must never grow this past 80.
//
//   offset  0..63: mvp     (mat4x4<f32>, column-major)
//   offset 64..75: tint    (vec3<f32>, linear RGB for the rgba16float HDR target)
//   offset 76..79: opacity (f32, straight alpha for the OVER blend)
//   total: 80 bytes (20 f32s).

struct TintedSphereUniforms {
  mvp: mat4x4<f32>,
  tint: vec3<f32>,
  opacity: f32,
};

// ── LitBodyUniforms ──────────────────────────────────────────────────
//
// `sunDirLocal` is rotated into the body's LOCAL frame CPU-side
// (`utils/camera/sunDirLocal.ts`), so the fragment stays a plain dot product under
// axial tilt. The 4-byte tail is padding, not an ambient field: lit paths read the
// shared `AMBIENT` const in `lib/bodyLighting.wesl` directly.
//
//   offset  0..63: mvp         (mat4x4<f32>, column-major)
//   offset 64..75: sunDirLocal (vec3<f32>)
//   offset 76..79: _pad        (f32, zeroed)
//   total: 80 bytes (20 f32s). Packer: `layers/body/render/packLitBodyUniforms.ts`.

struct LitBodyUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  _pad: f32,
};

// ── TexturedBodyUniforms ─────────────────────────────────────────────
//
// `ringOuterRatio == 0` means "no ring" and short-circuits the ring-shadow branch;
// both ratios are in planet-radius units. `limbStrength == 0` is the Minnaert
// identity. `camPosLocal` is in the body's local frame (same as `sunDirLocal`) for
// the view-dependent Minnaert mu. `camAltitudeSq` and `vpCamRelLocal` are the
// contact-range depth pair, see `lib/analyticSphere.wesl`'s depth section.
//
//   offset  0..63:   mvp            (mat4x4<f32>, column-major)
//   offset 64..75:   sunDirLocal    (vec3<f32>)
//   offset 76..79:   _pad           (f32)
//   offset 80..83:   ringInnerRatio (f32, ring inner / planet radius)
//   offset 84..87:   ringOuterRatio (f32, ring outer / planet radius; 0 = none)
//   offset 88..91:   limbStrength   (f32, Minnaert blend; 0 = plain Lambert)
//   offset 92..95:   limbExponent   (f32, Minnaert k; 1 = plain Lambert)
//   offset 96..107:  camPosLocal    (vec3<f32>)
//   offset 108..111: camAltitudeSq  (f32)
//   offset 112..175: vpCamRelLocal  (mat4x4<f32>)
//   total: 176 bytes (44 f32s). Packer: `layers/body/render/packTexturedBodyUniforms.ts`.

struct TexturedBodyUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  _pad: f32,
  ringInnerRatio: f32,
  ringOuterRatio: f32,
  limbStrength: f32,
  limbExponent: f32,
  camPosLocal: vec3<f32>,
  camAltitudeSq: f32,
  vpCamRelLocal: mat4x4<f32>,
};

// ── RingUniforms ─────────────────────────────────────────────────────
//
// The annulus is authored at unit OUTER radius, so in mesh frame the planet is a
// sphere of `planetRadiusRatio`; dividing a ring point by it lands in BODY-radius
// units (planet = unit sphere), the frame of the planet-on-ring shadow test.
// `camPosLocal` is in that same frame and gates the albedo floor: a ring point in
// FRONT of the planet's disc keeps its lit brightness. `innerRatio` punches the
// hole per draw and normalizes the strip u, so one geometry serves any ring.
//
//   offset  0..63: mvp               (mat4x4<f32>, column-major)
//   offset 64..75: sunDirLocal       (vec3<f32>)
//   offset 76..79: planetRadiusRatio (f32, planet radius / ring OUTER radius)
//   offset 80..91: camPosLocal       (vec3<f32>, planet-radius units)
//   offset 92..95: innerRatio        (f32, ring inner / ring OUTER radius)
//   total: 96 bytes (24 f32s). Packer: `layers/body/render/packRingUniforms.ts`.

struct RingUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  planetRadiusRatio: f32,
  camPosLocal: vec3<f32>,
  innerRatio: f32,
};

// ── EarthSurfaceUniforms ─────────────────────────────────────────────
//
// `camPosLocal` is needed for view-dependent GGX specular (the ocean glint).
// `ambientLight` and `oceanRoughness` are the user-tunable Earth-scoped overrides
// of the `AMBIENT` const in `lib/bodyLighting.wesl` and `OCEAN_ROUGHNESS` in
// `lib/pbr.wesl`; the fragment reads the uniform, not the const.
// `cloudShellRadius` is the unit-sphere radius of the shell the surface shadow
// fragment intersects.
//
//   offset   0..63:  mvp                 (mat4x4<f32>, column-major)
//   offset  64..75:  sunDirLocal         (vec3<f32>)
//   offset  76..79:  roughnessBase       (f32)
//   offset  80..91:  camPosLocal         (vec3<f32>)
//   offset  92..95:  f0                  (f32)
//   offset  96..99:  sunIrradiance       (f32)
//   offset 100..103: cloudShadowStrength (f32)
//   offset 104..107: cloudShellRadius    (f32)
//   offset 108..111: ambientLight        (f32, night-side floor)
//   offset 112..115: oceanRoughness      (f32, open-water GGX roughness)
//   offset 116..123: _pad0, _pad1        (f32, zeroed, round to 16-byte)
//   total: 128 bytes (32 f32s). Packer: `layers/body/render/packEarthSurfaceUniforms.ts`.

struct EarthSurfaceUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  roughnessBase: f32,
  camPosLocal: vec3<f32>,
  f0: f32,
  sunIrradiance: f32,
  cloudShadowStrength: f32,
  cloudShellRadius: f32,
  ambientLight: f32,
  oceanRoughness: f32,
  _pad0: f32,
  _pad1: f32,
};

// ── CloudShellUniforms ───────────────────────────────────────────────
//
// `sunIrradiance` is the SAME value the surface scales its direct term by
// (`EARTH_SURFACE_PARAMS.sunIrradiance`), not a second constant: unscaled, the
// shell topped out at raw Lambert (~1) over a ground scaled ~3x, so cloud rendered
// dimmer than ground. The fragment scales only the DIRECT term, leaving the
// ambient floor (and so the night side) untouched. `ambientLight` is likewise
// `EARTH_SURFACE_PARAMS.ambientLight`, so the deck dims in lockstep with the
// ground. `cloudOpacity` comes from `CLOUD_SHELL_PARAMS.opacity`.
//
//   offset  0..63: mvp           (mat4x4<f32>, column-major)
//   offset 64..75: sunDirLocal   (vec3<f32>)
//   offset 76..79: cloudOpacity  (f32, coverage-to-alpha multiplier)
//   offset 80..83: sunIrradiance (f32)
//   offset 84..87: ambientLight  (f32)
//   offset 88..95: _pad1, _pad2  (f32 x2)
//   total: 96 bytes (24 f32s). Packer: `layers/body/render/packCloudShellUniforms.ts`.

struct CloudShellUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  cloudOpacity: f32,
  sunIrradiance: f32,
  ambientLight: f32,
  _pad1: f32,
  _pad2: f32,
};

// ── AtmosphereUniforms ───────────────────────────────────────────────
//
// The proxy sphere is scaled by `composeBodyMvp` to the ATMOSPHERE-TOP radius, so
// in mesh-local frame the top is the UNIT sphere (implicit, no field) and the
// ground sphere has radius `bottomRadius`; normalized altitude is
// `h = (r_local - bottomRadius) / (1 - bottomRadius)`. `camPosLocal` is in
// atmosphere-top units. `invMvp` is the f64-computed inverse of `mvp` (narrowed at
// upload), used by the froxel bake and apply to unproject a screen position into
// the shell's local frame; it is packed for every body, inside or outside. The
// ring ratios are in atmosphere-top units; `ringOuterRatio == 0` is the no-ring
// sentinel.
//
//   offset   0..63:  mvp            (mat4x4<f32>, column-major)
//   offset  64..75:  sunDirLocal    (vec3<f32>)
//   offset  76..79:  bottomRadius   (f32)
//   offset  80..91:  camPosLocal    (vec3<f32>)
//   offset  92..95:  _pad1          (f32, zeroed)
//   offset  96..99:  exposure       (f32, in-scatter intensity scale)
//   offset 100..103: ringInnerRatio (f32)
//   offset 104..107: ringOuterRatio (f32)
//   offset 108..111: froxelSliceKm  (f32, aerial froxel slice depth)
//   offset 112..175: invMvp         (mat4x4<f32>)
//   total: 176 bytes (44 f32s). Packer: `layers/body/render/packAtmosphereUniforms.ts`.

struct AtmosphereUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  bottomRadius: f32,
  camPosLocal: vec3<f32>,
  _pad1: f32,
  exposure: f32,
  ringInnerRatio: f32,
  ringOuterRatio: f32,
  froxelSliceKm: f32,
  invMvp: mat4x4<f32>,
};

// WESL has no global state, so `mvp` is a parameter (as `worldToClip` in
// `lib/camera.wesl`), keeping this portable to any binding layout.
fn clip_from_local(mvp: mat4x4<f32>, localPos: vec3<f32>) -> vec4<f32> {
  return mvp * vec4<f32>(localPos, 1.0);
}
