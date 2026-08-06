// milkyWay/ismMap/ismMapFluidPack.wesl — the fluid generator's own final
// repack. ismMapFluidStep.wesl already advects directly in WORLD/grid
// coordinates every step (see its header), so unlike ismMapPack.wesl (the
// automaton's material-frame un-shear) there is nothing to invert here —
// this is a straight 1:1 texel copy. State order already matches the packed
// slot order (GalaxyIsmMap.ts's contract table), so this pass reorders
// nothing: only eventAge -> recentSf and the activity clamp change shape.

const RECENT_SF_TAU: f32 = 12.0; // mirrors ismMapPack.wesl's own look constant — same presentation meaning, same value

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let state = textureLoad(srcTex, vec2<i32>(gid.xy), 0);
  let gas = state.x;
  let eventAge = state.y;
  let activity = clamp(state.z, 0.0, 1.0);
  let dust = state.w;
  let recentSf = exp(-eventAge / RECENT_SF_TAU);
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(gas, recentSf, activity, dust));
}
