// milkyWay/sfMap/sfMapDustBlur.wesl — S4's low-pass divisor: an 8x-downsampled
// copy of sfMapDustDensity's own density (src/utils/galaxy/sfMapDustDensity.ts),
// blurred by box-averaging the PRODUCT rather than the product of two blurs —
// those differ, and only the former is the density field's own low-pass.
// dustPresent.wesl divides the full-res density by this to isolate the octave
// the dust splats can't carry (docs/research/m74-jwst/07-sprite-seeding.md, S4).

const BLUR_FACTOR: u32 = 8u; // mirrors DUST_BLUR_FACTOR in createSfMapAutomaton.ts (TS is authoritative)

@group(0) @binding(0) var srcTex: texture_2d<f32>; // packed sfMap: x=gas, y=recentSf, z=oldActivity, w=dust (unread here)
@group(0) @binding(1) var dstTex: texture_storage_2d<rgba16float, write>;

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
      sum += t.x * t.z; // gas x oldActivity — sfMapDustDensity's own density, not a re-derivation
    }
  }
  // rgba16float: the one storage format that is ALSO filterable, which
  // r16float/r32float are not simultaneously — dustPresent.wesl needs a
  // linear (textureSampleLevel) read of this, not a texel load.
  textureStore(dstTex, vec2<i32>(gid.xy), vec4<f32>(sum / 64.0, 0.0, 0.0, 0.0));
}
