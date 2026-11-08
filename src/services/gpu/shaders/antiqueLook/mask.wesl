// antiqueLook/mask.wesl — the look's one per-pixel record of the scene's bodies, the
// `mask` layer (`ANTIQUE_FULL_LAYERS`): r body cover, g land share, b land mapped, a limb
// ink. Every later pass reads this layer, never foreground:0 or the land row, so a rig
// that resamples its views needs to resample only this one row.
//
// Cover outside an atmosphere is foreground:0's alpha. Inside one the day sky drawn into
// that row carries alpha ~1 too, so `antiqueLook.ts` binds the row's DEPTH there instead
// and sets FLAG_DEPTH_COVER: reversed-Z, so any depth above the far clear (0) is a surface.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;

// foreground:0's colour or depth32float: only a textureLoad layout takes both.
@group(0) @binding(0) var bodyTex: texture_2d<f32>;
// The land map (r land share, g covered: Earth's oceans, Mars's dark albedo), or a 1×1 empty texture.
@group(0) @binding(1) var landTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: AntiqueUniforms;

const FLAG_DEPTH_COVER: u32 = 8u;
// `depthEdge`'s second difference of depth over the nearest tap's depth.
const DEPTH_JUMP: f32 = 0.05;

fn body(ip: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(bodyTex));
  return textureLoad(bodyTex, clamp(ip, vec2<i32>(0), size - 1), 0);
}

fn cover(ip: vec2<i32>) -> f32 {
  let t = body(ip);
  return select(t.a, f32(t.r > 0.0), (u.flags & FLAG_DEPTH_COVER) != 0u);
}

// Where the scene's depth breaks: a rover against the ground behind it, a crater
// rim against the plain beyond. Only with depth bound. Reversed-Z depth is linear in
// screen space across any plane, so its second difference is ~0 on open ground at any
// slant and jumps at an occluding edge: relative to the nearest tap, DEPTH_JUMP ≈ a 5%
// step in range.
fn depthEdge(ip: vec2<i32>, o: i32) -> f32 {
  if ((u.flags & FLAG_DEPTH_COVER) == 0u) {
    return 0.0;
  }
  let c = body(ip).r;
  let l = body(ip - vec2<i32>(o, 0)).r;
  let r = body(ip + vec2<i32>(o, 0)).r;
  let d = body(ip - vec2<i32>(0, o)).r;
  let t = body(ip + vec2<i32>(0, o)).r;
  let nearest = max(max(c, max(l, r)), max(d, t));
  let jump = max(abs(l + r - 2.0 * c), abs(d + t - 2.0 * c)) / max(nearest, 1e-30);
  return smoothstep(DEPTH_JUMP * 0.7, DEPTH_JUMP * 1.3, jump);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let ip = vec2<i32>(in.pos.xy);
  let landSize = vec2<i32>(textureDimensions(landTex));
  let land = textureLoad(landTex, min(ip, landSize - 1), 0).rg;
  // The limb is inked one print unit across the cover's edge.
  let o = i32(round(u.unit));
  let gx = cover(ip + vec2<i32>(o, 0)) - cover(ip - vec2<i32>(o, 0));
  let gy = cover(ip + vec2<i32>(0, o)) - cover(ip - vec2<i32>(0, o));
  let limb = max(smoothstep(0.25, 0.7, length(vec2<f32>(gx, gy))), depthEdge(ip, o));
  return vec4<f32>(cover(ip), land, limb);
}
