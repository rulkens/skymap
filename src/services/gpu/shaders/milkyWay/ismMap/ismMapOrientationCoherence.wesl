// milkyWay/ismMap/ismMapOrientationCoherence.wesl — stage 4 (final): the
// blurred tensor (Jxx,Jxy,Jyy) -> coherence-scaled double-angle vector
// (cos2theta, sin2theta), no eigen-solve needed. Along-filament sign is
// (Jyy-Jxx, -2*Jxy), rotated pi/2 from the ACROSS-ridge gradient form
// (Jxx-Jyy, 2*Jxy) — negating it turns a pitch-0 azimuthal ridge into
// exactly 90deg (the deleted buildIsmMapOrientation.test.ts's regression).
// Written into orientationTex's .xy; rgba16float not rg16float — see
// createGalaxyEngine.ts's orientationTex comment on storage-format support.

const EPS: f32 = 1e-12;

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(dst);
  if (any(gid.xy >= dims)) {
    return;
  }
  let j = textureLoad(srcTex, vec2<i32>(gid.xy), 0).xyz;
  let jxx = j.x;
  let jxy = j.y;
  let jyy = j.z;
  let denom = jxx + jyy;
  if (denom < EPS) {
    textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(0.0, 0.0, 0.0, 0.0));
    return;
  }
  let cos2t = (jyy - jxx) / denom;
  let sin2t = (-2.0 * jxy) / denom;
  textureStore(dst, vec2<i32>(gid.xy), vec4<f32>(cos2t, sin2t, 0.0, 0.0));
}
