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
//                                       64..71, pxPerRad 72..75, _pad0 76..79)
//   offset 80  : model: mat4x4<f32>   (64 B; per-cloud world placement)
//   offset 144 : camPosModel: vec4<f32> (the eye in the cloud's model
//                                     space, xyz; w unused)
//   offset 160 : _reserved: vec4<f32>  (zero, unused)
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
// model 20..35, camPosModel 36..39, _reserved 40..43, params0 44..47,
// params1 48..51) or the uniforms are silently garbage.

import package::lib::camera::CameraUniforms;

struct Uniforms {
  // Shared camera prefix — viewProj for clip-space projection, viewportPx
  // for the star pass's NDC-delta -> pixel conversion (the px clamp). All
  // cloud-specific fields live AFTER this 80-byte block.
  cam: CameraUniforms,
  // Per-cloud world placement. The generation pass emits particles in the
  // cloud's own local space; 'model' positions + orients + scales that
  // local space into the scene. Applied to each particle CENTER, and (as a
  // direction) to the per-instance billboard basis built below.
  model: mat4x4<f32>,
  // The eye in the cloud's MODEL space (a point; 'w' unused), from which
  // every instance builds its own eye-facing basis — see
  // 'spriteBillboardOffset'. vec4 so it occupies a clean 16-byte slot.
  camPosModel: vec4<f32>,
  // Zero. Was the second half of the CPU-precomputed view-plane basis; kept
  // as padding so the struct stays 208 bytes and every later offset holds.
  _reserved: vec4<f32>,
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

// spriteBillboardOffset — the unit-scale world offset of one billboard
// corner for one sprite, on a basis facing THE EYE rather than the view
// plane. A view-plane basis differs per dome face or VR eye, so one blob on a
// seam tilted two ways; an eye-facing basis depends only on the instance-
// to-eye direction, so every view of one blob agrees. Mirrors
// bodies/sgrAStarLensing/vertex.wesl.
//
// Built in MODEL space, where the eye is 'camPosModel' and the disk normal is
// the +y the generator emits into, then rotated to world where the corner is
// added. 'model' carries a uniform scale, so the rotated axes come back
// scaled: renormalising AFTER the transform keeps the offset unit-length.
//
// Looking straight down the disk axis collapses the first cross product; an
// in-disk fallback axis then takes over so the basis is defined for every
// viewing direction. Its roll there is arbitrary and costs nothing: both
// sprite fragments are radially symmetric about the centre.

const DISK_NORMAL_MODEL: vec3<f32> = vec3<f32>(0.0, 1.0, 0.0);
const DISK_AXIS_FALLBACK: vec3<f32> = vec3<f32>(1.0, 0.0, 0.0);
// Below this the cross product's direction is noise, not a basis.
const BASIS_DEGENERATE_EPS: f32 = 1e-4;

fn spriteBillboardOffset(
  model: mat4x4<f32>,
  camPosModel: vec3<f32>,
  centerModel: vec3<f32>,
  corner: vec2<f32>,
) -> vec3<f32> {
  let toCenter = centerModel - camPosModel;
  let dist = length(toCenter);
  // dist == 0 leaves the view direction undefined; the disk normal keeps the
  // basis finite rather than NaN.
  let forward = select(DISK_NORMAL_MODEL, toCenter / dist, dist > 0.0);
  var rightModel = cross(DISK_NORMAL_MODEL, forward);
  if (length(rightModel) < BASIS_DEGENERATE_EPS) {
    rightModel = cross(DISK_AXIS_FALLBACK, forward);
  }
  rightModel = normalize(rightModel);
  let upModel = cross(forward, rightModel);
  let right = normalize((model * vec4<f32>(rightModel, 0.0)).xyz);
  let up = normalize((model * vec4<f32>(upModel, 0.0)).xyz);
  return right * corner.x + up * corner.y;
}
