// lib/sphere.wesl — shared sphere uniform layout + local-to-clip helper.
//
// Every renderer that draws a sphere-shaped body (Earth, planets,
// stars) ends up needing the same thing: an MVP matrix that
// folds model transform + view + projection into one 4x4, and a vertex
// stage that multiplies a unit-sphere local position by it.
// Centralising the uniform struct and the helper here means:
//
//   1. One authoritative byte layout — 'SphereUniforms' is exactly 64
//      bytes (one mat4x4<f32>).  The CPU-side 'composeBodyMvp' writes
//      this exact layout; no per-renderer byte-offset arithmetic needed.
//   2. One definition of 'clip_from_local' to blame when something
//      projects wrong — see below for the MVP decomposition.
//   3. Future sphere renderers (Earth atmospherics, star glows, planet
//      surfaces) import from here rather than rolling their own matrix
//      wiring.
//
// ## Why a combined MVP, not separate M / VP?
//
// The rejected alternative was a three-matrix layout (model, view, proj
// separately).  None of the sphere renderers needs M or VP in isolation
// on the GPU: the vertex stage only ever computes 'mvp * localPos', and
// the world-space position (for lighting) is reconstructed via the
// inverse transform on the CPU and passed as a separate uniform.
// Separate M/VP would add 128 bytes of uniform data that the shader
// never unpacks.  A single combined MVP costs 64 bytes, which fits in
// one GPU cache line.
//
// ## Why NOT a captured '@group/@binding' var?
//
// WESL has no global state.  This module cannot see the renderer's
// '@group(0) @binding(0) var<uniform> u' declaration.  The helper
// 'clip_from_local' therefore takes 'mvp' as an explicit parameter --
// the same "pass cam, don't capture" rationale as 'worldToClip' in
// 'lib/camera.wesl'.  The function is portable to any renderer that
// binds 'SphereUniforms' at any group/binding it chooses.
//
// ## Byte layout
//
//   offset 0..63: mvp (mat4x4<f32>, column-major, 64 bytes)
//   total: 64 bytes.
//
// The CPU-side uploader writes exactly 16 Float32s starting at the
// buffer's base offset.  No padding is needed because mat4x4<f32>
// already satisfies 16-byte alignment.

struct SphereUniforms {
  mvp: mat4x4<f32>,
};

// ── TintedSphereUniforms ─────────────────────────────────────────────
//
// 'SphereUniforms' plus one solid colour — the uniform layout for
// renderers that bind a single per-draw RGB alongside the MVP through a
// non-dynamic uniform buffer.  The star renderer is the current
// consumer (its emissive spectral colour); centralising the struct here
// (rather than duplicating it per renderer) keeps the byte layout a
// single source of truth across the vertex/fragment module pair and its
// CPU-side uploader.  The planet renderer does NOT bind this struct —
// it draws every seeded planet with one instanced draw, so its albedo
// rides in a per-instance vertex attribute instead of a uniform; see
// 'planetRenderer's module header for why instancing replaces a
// per-draw uniform there.
//
// Why not extend 'SphereUniforms' with a colour field?  WGSL has no
// optional fields — the Earth genuinely binds a 64-byte buffer, and
// silently growing the shared struct would force a dead 16-byte tail
// onto every existing uploader.  A second named struct
// keeps each renderer's buffer exactly as large as what its shaders
// read.
//
// ## Byte layout (uniform address space)
//
//   offset  0..63: mvp  (mat4x4<f32>, column-major, 64 bytes)
//   offset 64..75: tint (vec3<f32> — 16-byte ALIGNED, starting at the
//                        already-aligned offset 64; 12 bytes of data)
//   offset 76..79: implicit trailing pad — a struct's size rounds up
//                  to its alignment (16), so 76 rounds to 80.
//   total: 80 bytes.
//
// The CPU side therefore uploads 20 f32s: 16 for the mvp, 3 for the
// tint, one zeroed pad float.  'tint' carries the star's spectral
// emissive colour, linear RGB, correct for the rgba16float HDR
// foreground target.

struct TintedSphereUniforms {
  mvp: mat4x4<f32>,
  tint: vec3<f32>,
};

// ── LitBodyUniforms ──────────────────────────────────────────────────
//
// 'SphereUniforms' plus the per-body sun direction — the uniform layout for a
// lit sphere drawn through its own per-draw uniform buffer. Earth is the
// current consumer: its fragment reads a real sun-relative Lambert term
// ('lib/bodyLighting.wesl') instead of a fixed light direction, so the
// terminator tracks the body's actual position relative to the Sun.
//
// Why carry 'sunDirLocal' on the uniform rather than derive it in the shader?
// The sun direction is rotated into the body's LOCAL frame CPU-side
// ('utils/camera/sunDirLocal.ts') so the fragment stays a plain dot product
// even when the body carries an axial tilt — no per-fragment matrix. See the
// 'sunDirLocal' util header for why the transpose is the inverse.
//
// ## Where the ambient floor lives (not here)
//
// The vec3 'sunDirLocal' leaves a 4-byte tail the struct must round over. That
// tail is pure padding — the ambient floor is NOT carried on the uniform. Every
// lit path ('litShade' in 'lib/bodyLighting.wesl') reads the shared 'AMBIENT'
// const directly, and the flat planet instance record has no ambient field at
// all, so the const is the load-bearing single source. A dead uniform field
// would be a second place ambient could appear to live; the tail stays '_pad'.
//
// ## Byte layout (uniform address space)
//
//   offset  0..63: mvp         (mat4x4<f32>, column-major, 64 bytes)
//   offset 64..75: sunDirLocal (vec3<f32> — 16-byte ALIGNED at offset 64;
//                               12 bytes of data)
//   offset 76..79: _pad        (f32 — the vec3's trailing pad, zeroed; ambient
//                               lives in bodyLighting.wesl's AMBIENT const)
//   total: 80 bytes.
//
// The CPU side uploads 20 f32s: 16 mvp + 3 sunDirLocal + 1 zeroed pad. The
// single source of truth for that packing is 'utils/gpu/packLitBodyUniforms.ts'.

struct LitBodyUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  _pad: f32,
};

// ── TexturedBodyUniforms ─────────────────────────────────────────────
//
// 'LitBodyUniforms' plus the two ring radii and the Minnaert limb-darkening
// params — the uniform layout for a textured planet or moon drawn through the
// 'texturedBodyRenderer'. The ring ratios are DATA, not a Saturn-only code path:
// 'ringOuterRatio == 0' means 'this body has no ring', which cleanly
// short-circuits the ring-on-planet shadow branch in the fragment. Only Saturn
// ships non-zero ratios; every other body packs zeros and pays nothing.
//
// Both ratios are expressed in planet-radius units (ring radius / planet
// radius), so the shadow-march maths is unit-free and rides the body's local
// sphere directly.
//
// ## The two trailing pads become the Minnaert params (the sibling trick)
//
// 'limbStrength' and 'limbExponent' reuse what were the struct's two trailing
// pad floats (bytes 88 and 92) — the same pad-slot-becomes-real-field trick the
// sibling structs ('RingUniforms.planetRadiusRatio',
// 'CloudShellUniforms.cloudOpacity') use. Growing the struct here costs no new
// row for them; 'strength == 0' (packed for every body without a Minnaert row)
// is the identity, so the fields are behaviour-neutral until a row opts in.
//
// ## Why 'camPosLocal' joins the struct (a NEW 16-byte tail)
//
// Minnaert's emission-angle cosine 'mu = dot(N, V)' is VIEW-dependent, and the
// lit prefix carries no camera position. The fragment reconstructs the view
// vector from the camera in the body's LOCAL frame (rotated CPU-side, same frame
// as 'sunDirLocal'), so the dot product stays a plain per-fragment cosine even
// under axial tilt. Byte 96 is already a vec3 boundary, so the tail costs one
// fresh 16-byte row: 12 bytes of data + one trailing pad rounding to 112.
//
// ## Byte layout (uniform address space)
//
//   offset  0..63:  mvp            (mat4x4<f32>, column-major, 64 bytes)
//   offset 64..75:  sunDirLocal    (vec3<f32> — 16-byte aligned)
//   offset 76..79:  _pad           (f32 — the vec3's trailing pad, as in
//                                   LitBodyUniforms; ambient lives in the const)
//   offset 80..83:  ringInnerRatio (f32 — ring inner radius / planet radius)
//   offset 84..87:  ringOuterRatio (f32 — ring outer / planet radius; 0 = none)
//   offset 88..91:  limbStrength   (f32 — Minnaert blend, 0 = plain Lambert)
//   offset 92..95:  limbExponent   (f32 — Minnaert k; 1 = plain Lambert)
//   offset 96..107: camPosLocal    (vec3<f32> — 16-byte aligned at 96)
//   offset 108..111: _pad0         (f32 — zeroed; rounds the struct to 112 / 16)
//   total: 112 bytes.
//
// The CPU side uploads 28 f32s. The single source of truth for that packing is
// 'utils/gpu/packTexturedBodyUniforms.ts', which reuses 'packLitBodyUniforms'
// for the shared 80-byte prefix so the two layouts can never drift.

struct TexturedBodyUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  _pad: f32,
  ringInnerRatio: f32,
  ringOuterRatio: f32,
  limbStrength: f32,
  limbExponent: f32,
  camPosLocal: vec3<f32>,
  _pad0: f32,
};

// ── RingUniforms ─────────────────────────────────────────────────────
//
// The uniform layout for the ring renderer -- the OTHER half of Saturn's
// rings. The textured body draws the ring's shadow ON the planet
// ('TexturedBodyUniforms' above); this draws the translucent annulus itself,
// with the planet's shadow cast ON the ring.
//
// It carries the same MVP + body-local sun direction prefix as 'LitBodyUniforms'
// (the ring rides the host body's exact 'composeBodyMvp' frame, and the sun is
// rotated into that local frame CPU-side), then two ring-shape scalars the
// fragment needs:
//
//   - 'planetRadiusRatio' = planet radius / ring OUTER radius (in (0, 1)).
//     The annulus is authored at unit outer radius, so in that mesh frame the
//     planet is a sphere of this radius. Dividing a ring point by it rescales
//     into BODY-RADIUS units, where the planet is the UNIT sphere and the ring
//     radii exceed 1 -- the frame the planet-on-ring shadow ray-sphere test runs
//     in. It fills the vec3's trailing 4-byte slot, so it is a REAL field, not a
//     pad (contrast 'LitBodyUniforms._pad').
//   - 'camPosLocal' = the camera in the host body's local frame, in PLANET-radius
//     units (planet = unit sphere) -- the same frame/units the annulus point
//     lands in after '/ planetRadiusRatio'. The fragment casts a view ray from it
//     through each ring point to ask 'does this ring point sit in FRONT of the
//     planet's disc?', which gates the albedo floor (a ring in front of the
//     planet keeps its own lit brightness; a translucent ring over open space
//     does not). It fills 'camPosLocal's own vec3 -- the trailing slot below is
//     the real 'innerRatio', the 'planetRadiusRatio' trick again.
//   - 'innerRatio' = ring inner radius / ring OUTER radius (in (0, 1)). The ring
//     geometry is a ring-agnostic disc; this punches the hole per-draw (the
//     fragment discards radii below it) and normalizes the radius for the strip
//     u, so ONE geometry serves any ring's proportions.
//
// ## Byte layout (uniform address space)
//
//   offset  0..63: mvp               (mat4x4<f32>, column-major, 64 bytes)
//   offset 64..75: sunDirLocal       (vec3<f32> -- 16-byte aligned at 64)
//   offset 76..79: planetRadiusRatio (f32 -- fills sunDirLocal's 4th slot)
//   offset 80..91: camPosLocal       (vec3<f32> -- 16-byte aligned at 80)
//   offset 92..95: innerRatio        (f32 -- fills camPosLocal's 4th slot)
//   total: 96 bytes.
//
// The CPU side uploads 24 f32s. The single source of truth for that packing is
// 'utils/gpu/packRingUniforms.ts'.

struct RingUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  planetRadiusRatio: f32,
  camPosLocal: vec3<f32>,
  innerRatio: f32,
};

// ── EarthSurfaceUniforms ─────────────────────────────────────────────
//
// The uniform layout for the photoreal-Earth surface pass. It is a SIBLING of
// 'TexturedBodyUniforms', NOT an overload of 'LitBodyUniforms' -- planets,
// moons and the ring bind those; only Earth's dedicated surface fragment binds
// this. It carries the same MVP + body-local sun-direction prefix as
// 'LitBodyUniforms' (so it reuses that packer for the shared 80-byte prefix and
// the two layouts can never drift), then the physically-based shading params
// the Earth fragment needs.
//
// Two vec3 tails are filled with REAL fields rather than padding, the same
// trick 'RingUniforms.planetRadiusRatio' uses:
//   - 'roughnessBase' fills 'sunDirLocal's trailing 4-byte slot (byte 76).
//   - 'f0' fills 'camPosLocal's trailing slot (byte 92).
//
// 'camPosLocal' (the camera in the body's local frame) is the one field beyond
// the design spec's literal list: GGX specular is view-dependent, and the lit
// prefix carries no camera position, so the ocean glint is uncomputable without
// this view vector.
//
// 'cloudShadowStrength' and 'cloudShellRadius' are the cloud-shell fields:
// 'cloudShadowStrength' scales how darkly the shell shadows the surface, and
// 'cloudShellRadius' is the unit-sphere local radius of the shell the surface
// shadow fragment intersects. Both are bound but UNUSED in plan A -- present now
// so plan D (cloud shell) reads the slots without reshaping the struct.
//
// 'ambientLight' fills what was the struct's original trailing pad (byte 108):
// the night-side ambient floor lifting Earth's unlit hemisphere off pure black.
// It is the user-tunable Earth-scoped override of the shared 'AMBIENT' const in
// 'lib/bodyLighting.wesl' -- that const stays every OTHER lit body's floor, this
// slot carries Earth's. So the fragment reads 'u.ambientLight', not the const.
//
// 'oceanRoughness' opens a fresh 16-byte row (byte 112): the GGX perceptual
// roughness the material ocean mask selects wholesale for open water -- the dial
// that sets how broad the sun glint reads. It is the user-tunable Earth-scoped
// override of the 'OCEAN_ROUGHNESS' const in 'lib/pbr.wesl' -- that const stays
// the seed / documentation home (and any future non-Earth water), this slot
// carries Earth's. So the fragment reads 'u.oceanRoughness', not the const.
//
// ## No page-table window (Task 5)
//
// This struct used to carry the page-table window ('zWin'/'winX0'/'winY0')
// and a debug LOD-tint toggle in the row 'oceanRoughness' opened. Both died
// with the page table itself: tile detail now draws in a separate pass
// ('earthSurfaceTileRenderer', over this base globe) that carries its own
// per-tile addressing, and the LOD-tint debug view has no per-fragment
// residency source left in THIS shader to visualise. The struct is back to
// its pre-virtual-texture 128 bytes, with two trailing pad floats rather
// than growing a fourth row.
//
// ## Byte layout (uniform address space)
//
//   offset   0..63:  mvp                 (mat4x4<f32>, column-major, 64 bytes)
//   offset  64..75:  sunDirLocal         (vec3<f32> -- 16-byte aligned at 64)
//   offset  76..79:  roughnessBase       (f32 -- fills sunDirLocal's 4th slot)
//   offset  80..91:  camPosLocal         (vec3<f32> -- 16-byte aligned at 80)
//   offset  92..95:  f0                  (f32 -- fills camPosLocal's 4th slot)
//   offset  96..99:  sunIrradiance       (f32)
//   offset 100..103: cloudShadowStrength (f32 -- unused in plan A)
//   offset 104..107: cloudShellRadius    (f32 -- unit-sphere shell radius; unused in A)
//   offset 108..111: ambientLight        (f32 -- night-side floor; Earth-scoped)
//   offset 112..115: oceanRoughness      (f32 -- open-water GGX roughness; Earth-scoped)
//   offset 116..123: _pad0/_pad1         (f32 x2 -- zeroed, rounds to 128 / 16-byte)
//   total: 128 bytes.
//
// The CPU side uploads 32 f32s. The single source of truth for that packing is
// 'utils/gpu/packEarthSurfaceUniforms.ts', which reuses 'packLitBodyUniforms'
// for the shared 80-byte prefix.

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
// The uniform layout for the translucent cloud shell drawn just above Earth's
// surface. It is a SIBLING of 'RingUniforms' / 'TexturedBodyUniforms', NOT an
// overload of 'LitBodyUniforms': a body-agnostic translucent shell lit by the
// same body-local 'sunDirLocal' as the surface, reusing that packer for the
// shared 80-byte prefix so the two layouts can never drift.
//
// It carries two fields beyond the lit prefix. The first, 'cloudOpacity', a
// per-shell coverage-to-alpha multiplier, fills the vec3's trailing 4-byte slot
// (byte 76). That makes it a REAL field, not a pad -- the same
// 'RingUniforms.planetRadiusRatio' trick, so the sibling adds a real field
// beyond the lit prefix rather than growing a dead tail.
//
// The second, 'sunIrradiance', opens a fresh 16-byte row because the vec3 tail is
// already spent on 'cloudOpacity'. It is the SAME sun irradiance the surface
// scales its direct term by ('EARTH_SURFACE_PARAMS.sunIrradiance'), passed at the
// pack site -- NOT a second constant. Without it the shell's lit output topped out
// at the raw Lambert term (peak ~1) while the surface beneath it was scaled ~3x,
// so the brightest real feature -- cloud (albedo ~0.8) -- rendered dimmer than the
// ground. The fragment scales the DIRECT (sun-lit) portion of the Lambert term by
// it and leaves the ambient floor untouched, mirroring the surface, so the night
// side is unchanged.
//
// 'ambientLight' fills the first of that row's trailing pads (byte 84): the SAME
// night-side ambient floor the surface reads from 'EARTH_SURFACE_PARAMS.ambientLight'
// (the user-tunable Earth-scoped override of the shared 'AMBIENT' const), so the
// deck's night side dims in lockstep with the ground beneath it. The fragment
// reads 'u.ambientLight' in place of the const.
//
// ## Byte layout (uniform address space)
//
//   offset  0..63: mvp           (mat4x4<f32>, column-major, 64 bytes)
//   offset 64..75: sunDirLocal   (vec3<f32> -- 16-byte aligned at 64)
//   offset 76..79: cloudOpacity  (f32 -- fills the vec3's 4th slot; a real field)
//   offset 80..83: sunIrradiance (f32 -- new row; direct-term scale)
//   offset 84..87: ambientLight  (f32 -- night-side floor; Earth-scoped)
//   offset 88..95: _pad1/2       (f32 x2 -- rounds the struct to 96 / 16-byte)
//   total: 96 bytes.
//
// The CPU side uploads 24 f32s. The single source of truth for that packing is
// 'utils/gpu/packCloudShellUniforms.ts', which reuses 'packLitBodyUniforms' for
// the shared 80-byte prefix. 'cloudOpacity' is sourced from
// 'CLOUD_SHELL_PARAMS.opacity'; 'sunIrradiance' + 'ambientLight' from
// 'EARTH_SURFACE_PARAMS'.

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
// The uniform layout for the atmosphere in-scatter shell drawn just outside
// Earth's cloud shell. It is a SIBLING of 'RingUniforms' / 'CloudShellUniforms',
// NOT an overload of 'LitBodyUniforms': only Earth's dedicated atmosphere
// fragment binds this. It carries the same MVP + body-local 'sunDirLocal'
// prefix as 'LitBodyUniforms' (so it reuses that packer for the shared 80-byte
// prefix and the two layouts can never drift), then the in-scatter params the
// fragment needs.
//
// ## The atmosphere-top-unit-sphere convention
//
// The proxy sphere is scaled by 'composeBodyMvp' to the ATMOSPHERE-TOP radius,
// so in the mesh's local frame the atmosphere top is the UNIT sphere
// ('topRadius == 1', implicit -- no field) and the ground sphere has radius
// 'bottomRadius' in (0, 1) -- the exact 'planetRadiusRatio' trick 'RingUniforms'
// uses. The shell fragment maps its local altitude to the LUT radial axis via
// 'bottomRadius' alone: normalized altitude
// 'h = (r_local - bottomRadius) / (1 - bottomRadius)'.
//
// Two vec3 tails are filled with REAL fields rather than padding, the same
// trick 'RingUniforms.planetRadiusRatio' uses:
//   - 'bottomRadius'  fills 'sunDirLocal's trailing 4-byte slot (byte 76).
//   - 'sunIrradiance' fills 'camPosLocal's trailing slot (byte 92).
//
// 'camPosLocal' (the camera in atmosphere-top-radius units, sphere centre at the
// origin) is the view vector the in-scatter integral needs, which the lit prefix
// does not carry.
//
// ## Byte layout (uniform address space)
//
//   offset   0..63:  mvp           (mat4x4<f32>, column-major, 64 bytes)
//   offset  64..75:  sunDirLocal   (vec3<f32> -- 16-byte aligned at 64)
//   offset  76..79:  bottomRadius  (f32 -- fills sunDirLocal's 4th slot)
//   offset  80..91:  camPosLocal   (vec3<f32> -- 16-byte aligned at 80)
//   offset  92..95:  sunIrradiance (f32 -- fills camPosLocal's 4th slot)
//   offset  96..99:  exposure       (f32 -- in-scatter intensity scale)
//   offset 100..103: ringInnerRatio (f32 -- ring inner / atmosphere top; 0 = none)
//   offset 104..107: ringOuterRatio (f32 -- ring outer / atmosphere top; 0 = none)
//   offset 108..111: _pad0          (f32 -- rounds the struct to 112 / 16-byte)
//   total: 112 bytes.
//
// The ring ratios express the host body's ring annulus in this mesh's LOCAL
// units (atmosphere top == 1), so the shell fragment can ask 'does the ring
// block this fragment's view of the atmosphere?' with a plane test in its own
// frame. 'ringOuterRatio == 0' is the no-ring sentinel -- the same data-gate
// 'TexturedBodyUniforms' uses -- so every ringless body short-circuits.
//
// The CPU side uploads 28 f32s. The single source of truth for that packing is
// 'utils/gpu/packAtmosphereUniforms.ts', which reuses 'packLitBodyUniforms' for
// the shared 80-byte prefix.

struct AtmosphereUniforms {
  mvp: mat4x4<f32>,
  sunDirLocal: vec3<f32>,
  bottomRadius: f32,
  camPosLocal: vec3<f32>,
  sunIrradiance: f32,
  exposure: f32,
  ringInnerRatio: f32,
  ringOuterRatio: f32,
  _pad0: f32,
};

// ── clip_from_local ──────────────────────────────────────────────────
//
// Transform a unit-sphere local-space position to homogeneous clip
// space.  The MVP matrix folds model (scale + translate to world
// position) + view + projection into one product, computed CPU-side
// by 'composeBodyMvp' and uploaded once per draw.
//
// Why pass 'mvp' as a parameter rather than a module-level binding?
// See the module header -- WESL has no global state; taking 'mvp' as
// a parameter makes this helper portable to any renderer's binding
// layout, matching the 'worldToClip' convention in 'lib/camera.wesl'.
//
// Equivalent inline form: 'u.mvp * vec4<f32>(localPos, 1.0)'.

fn clip_from_local(mvp: mat4x4<f32>, localPos: vec3<f32>) -> vec4<f32> {
  return mvp * vec4<f32>(localPos, 1.0);
}
