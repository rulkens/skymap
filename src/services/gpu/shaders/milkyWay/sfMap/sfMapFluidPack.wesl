// milkyWay/sfMap/sfMapFluidPack.wesl — the fluid generator's own final
// repack. sfMapFluidStep.wesl already advects directly in WORLD/grid
// coordinates every step (see its header), so unlike sfMapPack.wesl (the
// automaton's material-frame un-shear) there is nothing to invert here —
// this is a straight 1:1 texel copy that only reshapes the channel layout
// (age -> recentSf, oldActivity clamp) to match what every sfMap consumer
// (readback, present, dust blur) expects, same as sfMapPack.wesl's own tail.

const RECENT_SF_TAU: f32 = 12.0; // mirrors sfMapPack.wesl's own look constant — same presentation meaning, same value

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
  let age = state.y;
  let dust = state.z;
  let oldActivity = clamp(state.w, 0.0, 1.0);
  let recentSf = exp(-age / RECENT_SF_TAU);
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(gas, recentSf, oldActivity, dust));
}
