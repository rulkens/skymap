// antiqueLook/mask.wesl — the look's one per-pixel record of the scene's bodies, the
// `mask` layer (`ANTIQUE_FULL_LAYERS`): r body cover, g land share, b land mapped (1) or
// not (0), or NEARER_SURFACE, a limb ink. Every later pass reads this layer, never
// foreground:0 or the land row, so a rig that resamples its views needs only this row.
//
// Cover outside an atmosphere is foreground:0's alpha. Inside one the day sky drawn into
// that row carries alpha ~1 too, so FLAG_DEPTH_COVER reads cover off the row's DEPTH
// instead: reversed-Z, so any depth above the far clear (0) is a surface.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::plateBodies::PlateBodies;
import package::antiqueLook::plateBodies::castPlateBody;

// The depth row's scale for the plate's globes (`packAntiqueMaskDepth.ts`).
struct MaskDepth {
  forward: vec4<f32>, // xyz the camera's forward, world axes
  nearRadii: vec4<f32>, // per plate body: the depth row's near plane in its radii; 0 = no metric depth
}

@group(0) @binding(0) var bodyTex: texture_2d<f32>;
// foreground:0's depth32float, reversed-Z infinite far, or the far-cleared placeholder.
@group(0) @binding(1) var depthTex: texture_2d<f32>;
// The land map (r land share, g covered: Earth's oceans, Mars's dark albedo), or a 1×1 empty texture.
@group(0) @binding(2) var landTex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> u: AntiqueUniforms;
@group(0) @binding(4) var<uniform> plate: PlateBodies;
@group(0) @binding(5) var<uniform> depthScale: MaskDepth;

const FLAG_DEPTH_COVER: u32 = 8u;
// `depthEdge`'s second difference of depth over the nearest tap's depth.
const DEPTH_JUMP: f32 = 0.05;
// b where the depth holds a surface nearer than the globe the plate would cast there
// (a spacecraft over Earth): the plate prints it as a plain body. Below reduce's 0.5
// "mapped" threshold, so the land map stays off it. Mirrored in fragment.wesl.
const NEARER_SURFACE: f32 = 0.25;
// How far in front of a cast globe, in its radii, a surface must lie to be another
// body: clear of relief and oblateness (Earth's ~0.005), short of a low orbit (~0.03).
const NEARER_RADII: f32 = 0.015;

fn texelAt(tex: texture_2d<f32>, ip: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(tex));
  return textureLoad(tex, clamp(ip, vec2<i32>(0), size - 1), 0);
}

fn depthAt(ip: vec2<i32>) -> f32 {
  return texelAt(depthTex, ip).r;
}

fn cover(ip: vec2<i32>) -> f32 {
  return select(texelAt(bodyTex, ip).a, f32(depthAt(ip) > 0.0), (u.flags & FLAG_DEPTH_COVER) != 0u);
}

// fragment.wesl's `viewRay`.
fn viewRay(uv: vec2<f32>) -> vec3<f32> {
  let top = mix(u.rayTL.xyz, u.rayTR.xyz, uv.x);
  let bottom = mix(u.rayBL.xyz, u.rayBR.xyz, uv.x);
  return normalize(mix(top, bottom, uv.y));
}

// The depth holds a surface well in front of the nearest globe the plate casts here.
// Reversed-Z infinite far: depth = near / view z, so the surface's range along the ray
// is near / (depth · ray·forward), in that globe's radii once near is.
fn nearerSurface(ip: vec2<i32>, uv: vec2<f32>) -> bool {
  let depth = depthAt(ip);
  if (depth <= 0.0) {
    return false;
  }
  let ray = viewRay(uv);
  var t = 1e30;
  var near = 0.0;
  for (var i = 0u; i < min(plate.count, 4u); i++) {
    let h = castPlateBody(ray, plate.items[i]);
    if (h.t < t) {
      t = h.t;
      near = depthScale.nearRadii[i];
    }
  }
  let range = near / (depth * max(dot(ray, depthScale.forward.xyz), 1e-6));
  return t < 1e30 && near > 0.0 && range < t - NEARER_RADII;
}

// Where the scene's depth breaks: a rover against the ground behind it, a crater
// rim against the plain beyond. Reversed-Z depth is linear in screen space across any
// plane, so its second difference is ~0 on open ground at any slant and jumps at an
// occluding edge: relative to the nearest tap, DEPTH_JUMP ≈ a 5% step in range.
fn depthEdge(ip: vec2<i32>, o: i32) -> f32 {
  let c = depthAt(ip);
  let l = depthAt(ip - vec2<i32>(o, 0));
  let r = depthAt(ip + vec2<i32>(o, 0));
  let d = depthAt(ip - vec2<i32>(0, o));
  let t = depthAt(ip + vec2<i32>(0, o));
  let nearest = max(max(c, max(l, r)), max(d, t));
  let jump = max(abs(l + r - 2.0 * c), abs(d + t - 2.0 * c)) / max(nearest, 1e-30);
  return smoothstep(DEPTH_JUMP * 0.7, DEPTH_JUMP * 1.3, jump);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let ip = vec2<i32>(in.pos.xy);
  let land = texelAt(landTex, ip).rg;
  let nearer = nearerSurface(ip, in.uv);
  // The limb is inked one print unit across the cover's edge.
  let o = i32(round(u.unit));
  let gx = cover(ip + vec2<i32>(o, 0)) - cover(ip - vec2<i32>(o, 0));
  let gy = cover(ip + vec2<i32>(0, o)) - cover(ip - vec2<i32>(0, o));
  var limb = smoothstep(0.25, 0.7, length(vec2<f32>(gx, gy)));
  // Depth's own edges ink where it is the cover, and on a nearer body: its outline over
  // the globe behind (a one-sided step) and its own parts. Not on a cast globe's relief.
  let inside = (u.flags & FLAG_DEPTH_COVER) != 0u;
  if (inside || nearer) {
    limb = max(limb, depthEdge(ip, o));
  }
  let mapped = select(step(0.5, land.g), NEARER_SURFACE, nearer);
  return vec4<f32>(cover(ip), select(land.r, 0.0, nearer), mapped, limb);
}
