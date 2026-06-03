/**
 * volume.wgsl — the density-volume raymarch module (vsFull / fsVolume), ported
 * to behavioural parity with the spike's volumeWGSL.
 *
 * A fullscreen triangle whose fragment shader marches the SAME world cube
 * [-1,1]^3 the flow trails live in, sampling the overdensity field (delta,
 * carried in the field texture's alpha channel) front-to-back. The emitted glow
 * lines up with the flow and labels, so a structure label can be eyeballed
 * against a reconstructed overdensity. It blends additively into the shared HDR
 * target, so the tonemap treats the glow like any other emission.
 *
 * ### One deliberate divergence from the spike: no 'eye' field
 *
 * The spike's Vol struct carried an 'eye' (camera position) field, but the
 * fragment never reads it — the ray origin is reconstructed by unprojecting the
 * near plane through invMvp (ro = near.xyz / near.w), which already yields the
 * eye for that pixel. So we drop 'eye' from the struct and the uniform buffer,
 * shrinking it from 96 to 80 bytes. The ray is reconstructed identically: ro
 * from the near point, rd = normalize(far point minus ro).
 *
 * NOTE: no backtick may appear inside this template literal's comments — it
 * would terminate the JS string.
 *
 * Volume uniform 'Vol' byte layout (buffer is 80 bytes):
 *   invMvp     mat4x4<f32> @ 0   (64 bytes)
 *   gain       f32         @ 64
 *   dMax       f32         @ 68
 *   alphaScale f32         @ 72
 *   (4 bytes tail padding to a 16-byte multiple)
 */

export const volumeWgsl: string = /* wgsl */ `
const STEPS: i32 = 128;                       // raymarch samples across the cube
const LOWCOL = vec3<f32>(0.05, 0.18, 0.55);   // colour at faint overdensity
const HIGHCOL = vec3<f32>(1.0, 0.72, 0.38);   // colour at the densest knots
const TRANS_CUTOFF: f32 = 0.01;               // early-out once the ray has gone opaque

struct Vol { invMvp: mat4x4<f32>, gain: f32, dMax: f32, alphaScale: f32 };
@group(0) @binding(0) var<uniform> vol: Vol;
@group(0) @binding(1) var densTex: texture_3d<f32>;   // rgb = velocity, a = overdensity delta
@group(0) @binding(2) var densSamp: sampler;

struct FsOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex
fn vsFull(@builtin(vertex_index) vi: u32) -> FsOut {
  var p = array<vec2<f32>,3>(vec2<f32>(-1.,-1.), vec2<f32>(3.,-1.), vec2<f32>(-1.,3.));
  let xy = p[vi];
  var o: FsOut; o.pos = vec4<f32>(xy,0.,1.); o.uv = xy*0.5 + vec2<f32>(0.5); return o;
}

@fragment
fn fsVolume(i: FsOut) -> @location(0) vec4<f32> {
  // reconstruct a world-space ray for this pixel from the inverse view-projection.
  // ro comes from the near plane unprojection (this is the eye for this pixel),
  // so no separate eye uniform is needed.
  let ndc = i.uv * 2.0 - vec2<f32>(1.0);
  let near = vol.invMvp * vec4<f32>(ndc, 0.0, 1.0);
  let far  = vol.invMvp * vec4<f32>(ndc, 1.0, 1.0);
  let ro = near.xyz / near.w;
  let rd = normalize(far.xyz / far.w - ro);

  // slab intersection with the [-1,1] world cube
  let inv = 1.0 / rd;
  let ta = (vec3<f32>(-1.0) - ro) * inv;
  let tb = (vec3<f32>( 1.0) - ro) * inv;
  let tlo = min(ta, tb);
  let thi = max(ta, tb);
  let tEnter = max(max(tlo.x, tlo.y), tlo.z);
  let tExit  = min(min(thi.x, thi.y), thi.z);
  let tStart = max(tEnter, 0.0);
  if (tExit <= tStart) { discard; }

  // front-to-back emission/absorption: emitted glow grows, transmittance shrinks
  let dt = (tExit - tStart) / f32(STEPS);
  var t = tStart + dt * 0.5;
  var emitted = vec3<f32>(0.0);
  var trans = 1.0;
  for (var s: i32 = 0; s < STEPS; s = s + 1) {
    let voxel = (ro + rd * t) * 0.5 + vec3<f32>(0.5);    // inverse of gridToWorld
    let delta = max(textureSampleLevel(densTex, densSamp, voxel, 0.0).w, 0.0);
    let dn = clamp(delta / vol.dMax, 0.0, 1.0);
    let col = mix(LOWCOL, HIGHCOL, dn) * dn * vol.gain;
    let a = clamp(dn * vol.alphaScale * dt, 0.0, 1.0);
    emitted = emitted + trans * col * a;
    trans = trans * (1.0 - a);
    t = t + dt;
    if (trans < TRANS_CUTOFF) { break; }
  }
  return vec4<f32>(emitted, 1.0 - trans);
}`;
