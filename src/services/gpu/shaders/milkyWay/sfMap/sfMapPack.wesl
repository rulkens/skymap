// milkyWay/sfMap/sfMapPack.wesl — packs the SSPSF automaton's final
// ping-pong state into one presentable RGBA texture (see GalaxySfMap.ts's
// contract table for the full state/packed mapping): gas column, recent SF
// (eventAge's own decay), activity (the EMA sfMapAutomatonStep.wesl already
// carries in state.z), and the conserved dust channel (state.w). One
// dispatch, run once per automaton rebuild after the last step — never per
// frame. finalTex is still in sfMapAutomatonStep.wesl's MATERIAL
// (Lagrangian) frame; every consumer of THIS pass's output expects WORLD
// coordinates, so this is the one place that un-shears — a single resample
// instead of sfMapAutomatonStep.wesl's old per-generation one (see that
// file's header for why the difference matters). Dust is a smooth
// accumulated field, so the bilinear resample below is fine for it too
// (unlike the discrete ignition state sfMapAutomatonStep.wesl itself must
// never blur). Automaton-only: the fluid generator has no material frame to
// un-shear, so its own repack (sfMapFluidPack.wesl) is a straight copy
// instead.
//
// The output is rgba16float, not rgba8unorm: activity keeps its intentional
// [0,1] clamp below (a real bound on the EMA, independent of storage
// format), but dust is written RAW — colliding swept shells summing past
// ambient is the rim/filament feature, and clamping it away here would
// erase exactly what the snowplough rule exists to produce.

import package::milkyWay::sfMap::sfMapShear::sfMapShearTexels;

const RECENT_SF_TAU: f32 = 12.0; // steps; a look constant, not a measured decay time

struct SfMapUnshear {
  rMin: f32,
  rMax: f32,
  corotationRadius: f32,
  shearRate: f32,
  totalShiftSteps: f32,
}

@group(0) @binding(0) var finalTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> u: SfMapUnshear;

// Bilinear-in-azimuth read of the material state — the ONE resample this
// design allows (this file's header); unlike sfMapAutomatonStep.wesl's
// per-generation self read, this runs once, so a single blur here cannot
// compound like N did. azCount comes from textureDimensions(dst) in cs()
// below, same as sfMapAutomatonStep.wesl (no baked-in grid size —
// sfMapShear.wesl's own precedent).
fn sampleMaterial(ring: u32, azF: f32, azCount: u32) -> vec4<f32> {
  let wrapped = (azF % f32(azCount) + f32(azCount)) % f32(azCount);
  let a0 = u32(floor(wrapped)) % azCount;
  let a1 = (a0 + 1u) % azCount;
  let frac = wrapped - floor(wrapped);
  let c0 = textureLoad(finalTex, vec2<i32>(i32(a0), i32(ring)), 0);
  let c1 = textureLoad(finalTex, vec2<i32>(i32(a1), i32(ring)), 0);
  return mix(c0, c1, frac);
}

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let ring = gid.y;
  // sfMapAutomatonStep.wesl's armForcingAt derives the FORWARD transform: world =
  // material + shear * genStep (a material cell drifts to higher world
  // azimuth as steps accumulate). This output texel IS a world azimuth
  // (gid.x); inverting that transform to find which material azimuth to
  // read gives the MINUS here — the opposite sign from the forward lookup,
  // by construction, not a typo. totalShiftSteps is the number of
  // shear-applying generations that actually ran (steps - 1: step 0 only
  // seeds, see rebuildSfMap), not the raw step count.
  let shear = sfMapShearTexels(ring, dims.y, dims.x, u.rMin, u.rMax, u.corotationRadius, u.shearRate);
  let materialAz = f32(gid.x) - shear * u.totalShiftSteps;
  let state = sampleMaterial(ring, materialAz, dims.x);
  let gas = state.x;
  let eventAge = state.y;
  let activity = clamp(state.z, 0.0, 1.0);
  let dust = state.w;
  let recentSf = exp(-eventAge / RECENT_SF_TAU);
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(gas, recentSf, activity, dust));
}
