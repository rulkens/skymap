// milkyWay/sprites/io.wesl — shared interface module for the Milky Way
// point-cloud draw passes (stars + dust).
//
// The point cloud draws a generated star/dust particle set as two
// billboard passes: an ADDITIVE star pass (soft radial glows that sum their
// light) and a MULTIPLICATIVE dust pass (per-channel transmittance that
// darkens + reddens the light behind it). Both passes read the SAME uniform
// buffer, so its layout is declared once here and imported by each pass.
//
// ## Why the binding lives HERE, not in each pass file
//
// The points/milkyWay io convention keeps only the struct in io.wesl and
// re-declares the '@group(0) @binding(0)' binding in every consuming file,
// because those families were told 'importing a binding var across modules
// is not supported'. That guidance is stale for this plugin version: the
// generation compute passes already import a module-scope 'var<uniform>'
// across files ('import package::milkyWay::sprites::generate::gen' in
// generateStars.wesl), and it links. We lean on that: 'u' is declared once
// here and imported by stars.wesl / dust.wesl, so the binding number and
// the struct type have exactly ONE definition and cannot drift between the
// two passes.
//
// ## Why stars and dust are still SEPARATE pass modules
//
// The two passes must NOT share one shader module. WebGPU's 'auto' pipeline
// layout derives a bind-group layout from the entry points a module
// exposes; two pipelines that share a module but reference the binding with
// divergent stage visibility fail the group-equivalent check (the
// auto-layout trap in project memory). stars.wesl and dust.wesl are
// therefore disjoint, self-contained vs+fs modules — each compiles its own
// GPUShaderModule from this shared io — so each pipeline derives its own
// consistent layout and the trap cannot fire.
//
// ## Byte layout (canonical — the offset authority for the CPU packer)
//
//   offset 0   : cam: CameraUniforms  (80 B; viewProj 0..63, viewportPx
//                                       64..71, _pad0 72..75, _pad1 76..79)
//   offset 80  : model: mat4x4<f32>   (64 B; per-cloud world placement)
//   offset 144 : camRight: vec4<f32>  (xyz billboard right + 0)
//   offset 160 : camUp: vec4<f32>     (xyz billboard up + 0)
//   offset 176 : params0: vec4<f32>   (fadeAlpha, exposure, modelScale,
//                                       softness)
//   offset 192 : params1: vec4<f32>   (starPxMin, starPxMax, starSizeScale,
//                                       lodApparent)
//   total: 208 bytes (MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE).
//
// Every group is 16-byte aligned: mat4x4 and vec4 both align to 16, and the
// embedded CameraUniforms ends at 80 (a 16-byte boundary), so 'model' lands
// at 80 with no implicit padding. The CPU-side Float32Array must write each
// field at the matching f32 index (viewProj 0..15, viewportPx 16..17,
// model 20..35, camRight 36..39, camUp 40..43, params0 44..47,
// params1 48..51) or the uniforms are silently garbage.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  // Shared camera prefix — viewProj for clip-space projection, viewportPx
  // for the star pass's NDC-delta -> pixel conversion (the px clamp). All
  // cloud-specific fields live AFTER this 80-byte block.
  cam: CameraUniforms,
  // Per-cloud world placement. The generation pass emits particles in the
  // cloud's own local space; 'model' positions + orients + scales that
  // local space into the scene. Applied to each particle CENTER only — the
  // billboard corner offset is added in world space along camRight/camUp
  // AFTER the model transform, so the sprites always face the camera
  // regardless of the model's rotation.
  model: mat4x4<f32>,
  // Camera-facing billboard basis (world space), xyz in .xyz, .w unused.
  // Precomputed CPU-side from the view matrix so every particle expands its
  // quad along the same screen-aligned axes without a per-vertex basis
  // build. vec4 (not vec3) so the two vectors occupy clean 16-byte slots.
  camRight: vec4<f32>,
  camUp: vec4<f32>,
  // params0 = (fadeAlpha, exposure, modelScale, softness).
  //   fadeAlpha  — visibility fade in [0, 1] (apparent-size fade x toggle
  //                opacity, composed CPU-side). Stars multiply it into EMISSION
  //                (a faded star adds no light); dust mixes T toward the
  //                multiplicative identity (a faded dust lane stops
  //                darkening the scene). See each pass's fragment.
  //   exposure   — star-pass intensity multiplier on the radial falloff
  //                (the tool's 'starIntensity').
  //   modelScale — uniform world-space scale applied to each particle's
  //                billboard half-extent (inSize * modelScale). Kept
  //                separate from 'model' so the CPU can scale sprite size
  //                without decomposing the matrix.
  //   softness   — star-pass fragment profile blend: 0 = the tight core+glow
  //                falloff, 1 = a broad Gaussian. Both profiles are
  //                normalised to the same integral over the unit disc, so
  //                this changes sprite SHAPE without changing how much light
  //                the sprite emits. Dust ignores it.
  params0: vec4<f32>,
  // params1 = (starPxMin, starPxMax, starSizeScale, lodApparent). The star
  // pass clamps each sprite's on-screen half-extent to the
  // [starPxMin, starPxMax] pixel range: starPxMin is the anti-sparkle FLOOR
  // (a distant star never shrinks below a stable dot, killing sub-pixel
  // twinkle); starPxMax CAPS foreground swell on close flythroughs.
  // starSizeScale is a further dimensionless multiplier on each star's
  // world-space half-extent, applied BEFORE that pixel clamp (see
  // stars.wesl) -- the one knob for shrinking or growing the whole star
  // population without touching the generated data. lodApparent is the NDC
  // apparent-size scale of the flux-conserving star LOD (0 disables):
  // stars projecting smaller than roughly their hashed fraction of it are
  // vertex-culled and the survivors brightened so total light holds. Dust
  // ignores all four (it uses a fixed NDC clamp instead).
  params1: vec4<f32>,
};

// The single '@group(0) @binding(0)' binding, imported by both pass modules
// (see the module header for why a binding var is shared rather than
// re-declared). Its type 'Uniforms' travels with it through the linker, so
// consumers import only 'u'.
@group(0) @binding(0) var<uniform> u: Uniforms;
