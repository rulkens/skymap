// milkyWayField/sfMapPack.wesl — packs the SSPSF automaton's final
// ping-pong state into one presentable RGBA texture: gas column, recent SF
// (age's own decay), older SF (the activity EMA sfMapStep.wesl already
// carries in state.w). One dispatch, run once per rebuildSfMap after the
// last step — never per frame.

const RECENT_SF_TAU: f32 = 12.0; // steps; a look constant, not a measured decay time

@group(0) @binding(0) var finalTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let state = textureLoad(finalTex, vec2<i32>(gid.xy), 0);
  let gas = state.x;
  let age = state.y;
  let oldActivity = clamp(state.w, 0.0, 1.0);
  let recentSf = exp(-age / RECENT_SF_TAU);
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(gas, recentSf, oldActivity, 0.0));
}
