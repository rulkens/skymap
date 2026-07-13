// bakeOccupancy.wesl — coarse max-density brick grid, stage 1 of the
// empty-space-skipping bake.
//
// Each coarse voxel stores the MAX of (dust + gas) over its brick of the
// fine field. The skip-distance pass (bakeSkip.wesl) then treats a coarse
// voxel as empty only when NOTHING in its brick would shade — taking the
// max (not an average or a corner sample) is what makes the later leaps
// SAFE: a thin column clipping one corner of a brick still marks the whole
// brick occupied, so the marcher can never leap over it.
//
// Dispatched in z-slabs like every other bake (watchdog headroom — see
// createPillarsEngine's module header).

struct OccUniforms {
  zBase: u32,
  _p0: u32,
  _p1: u32,
  _p2: u32,
}

@group(0) @binding(0) var<uniform> u: OccUniforms;
@group(0) @binding(1) var field: texture_3d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var outOcc: texture_storage_3d<rgba8unorm, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid_in: vec3<u32>) {
  let gid = vec3<u32>(gid_in.x, gid_in.y, gid_in.z + u.zBase);
  let dims = textureDimensions(outOcc);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) {
    return;
  }
  // Brick bounds in [0,1] volume uv.
  let lo = vec3<f32>(gid) / vec3<f32>(dims);
  let hi = (vec3<f32>(gid) + vec3<f32>(1.0)) / vec3<f32>(dims);

  // 4^3 subsamples across the brick — dense enough to catch a thin column
  // grazing a brick corner at the ~4x fine/coarse ratio the engine uses.
  var m = 0.0;
  for (var z = 0; z < 4; z = z + 1) {
    for (var y = 0; y < 4; y = y + 1) {
      for (var x = 0; x < 4; x = x + 1) {
        let f01 = (vec3<f32>(f32(x), f32(y), f32(z)) + vec3<f32>(0.5)) / 4.0;
        let s = textureSampleLevel(field, samp, mix(lo, hi, f01), 0.0);
        m = max(m, s.r + s.g);
      }
    }
  }
  textureStore(outOcc, vec3<i32>(gid), vec4<f32>(m, 0.0, 0.0, 0.0));
}
