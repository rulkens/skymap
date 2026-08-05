// milkyWay/sfMap/sfMapDustBlur.wesl — S4's low-pass divisor: an 8x-downsampled
// copy of the PLACEMENT density, blurred by box-averaging the density rather
// than the product of two blurs — those differ, and only the former is the
// density field's own low-pass. dustDetail.wesl divides the full-res density
// by this to isolate the octave the dust splats can't carry
// (docs/research/m74-jwst/07-sprite-seeding.md, S4).
//
// 'sweptMix' blends the same two channels 'GalaxyDustTuning.sweptMix' blends
// CPU-side (src/@types/galaxy/GalaxyDustTuning.ts): the legacy gas x
// oldActivity product at 0, the conserved swept-dust channel (w) at 1. No
// mean-normalization here, unlike the CPU seeding blend — dustDetail.wesl
// only ever reads this as a RATIO against the full-res density, and a ratio
// is scale-invariant.

const BLUR_FACTOR: u32 = 8u; // mirrors DUST_BLUR_FACTOR in createSfMapAutomaton.ts (TS is authoritative)
// Mirrors SF_MAP_AMBIENT_DUST (sweptDustOvershoot.ts) — parity-tested in
// constants.parity.test.ts. CONTRACT: dustDetail.wesl's numerator must blend
// the identical overshoot term, or the detail ratio drifts with sweptMix.
const SF_MAP_AMBIENT_DUST: f32 = 1.0;

struct DustBlurParams {
  sweptMix: f32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>; // packed sfMap: x=gas, y=recentSf, z=oldActivity, w=dust
@group(0) @binding(1) var dstTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: DustBlurParams;

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dstTex);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }
  // dstTex is exactly srcTex/BLUR_FACTOR (SF_MAP_AZ/SF_MAP_RINGS both divide
  // evenly), so each dst texel owns one whole, non-overlapping 8x8 src block.
  var sum: f32 = 0.0;
  for (var j: u32 = 0u; j < BLUR_FACTOR; j++) {
    for (var i: u32 = 0u; i < BLUR_FACTOR; i++) {
      let t = textureLoad(
        srcTex,
        vec2<i32>(i32(gid.x * BLUR_FACTOR + i), i32(gid.y * BLUR_FACTOR + j)),
        0,
      );
      sum += mix(t.x * t.z, max(t.w - SF_MAP_AMBIENT_DUST, 0.0), params.sweptMix);
    }
  }
  // rgba16float: the one storage format that is ALSO filterable, which
  // r16float/r32float are not simultaneously — dustPresent.wesl needs a
  // linear (textureSampleLevel) read of this, not a texel load.
  textureStore(dstTex, vec2<i32>(gid.xy), vec4<f32>(sum / 64.0, 0.0, 0.0, 0.0));
}
