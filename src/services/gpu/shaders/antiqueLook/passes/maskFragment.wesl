// antiqueLook/passes/maskFragment.wesl — the look's one per-pixel record of the scene's bodies, the
// `mask` layer (`ANTIQUE_FULL_LAYERS`): r body cover, g land share, b land mapped (1) or
// not (0), or NEARER_SURFACE, a limb ink. Every later pass reads this layer, never
// foreground:0 or the land row, so a rig that resamples its views needs only this row.
//
// Cover outside an atmosphere is foreground:0's alpha. Inside one the day sky drawn into
// that row carries alpha ~1 too, so FLAG_DEPTH_COVER reads cover off the row's DEPTH
// instead: reversed-Z, so any depth above the far clear (0) is a surface.

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::io::VSOut;
import package::antiqueLook::shared::plateBodies::PlateBodies;
import package::antiqueLook::shared::plateBodies::castPlateBody;

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
@group(0) @binding(3) var<uniform> uniforms: AntiqueUniforms;
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

fn texelAt(tex: texture_2d<f32>, texelPos: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(tex));
  return textureLoad(tex, clamp(texelPos, vec2<i32>(0), size - 1), 0);
}

fn depthAt(texelPos: vec2<i32>) -> f32 {
  return texelAt(depthTex, texelPos).r;
}

fn cover(texelPos: vec2<i32>) -> f32 {
  return select(texelAt(bodyTex, texelPos).a, f32(depthAt(texelPos) > 0.0), (uniforms.flags & FLAG_DEPTH_COVER) != 0u);
}

// fragment.wesl's `viewRay`.
fn viewRay(uv: vec2<f32>) -> vec3<f32> {
  let top = mix(uniforms.rayTL.xyz, uniforms.rayTR.xyz, uv.x);
  let bottom = mix(uniforms.rayBL.xyz, uniforms.rayBR.xyz, uv.x);
  return normalize(mix(top, bottom, uv.y));
}

// The depth holds a surface well in front of the nearest globe the plate casts here.
// Reversed-Z infinite far: depth = near / view z, so the surface's range along the ray
// is near / (depth · ray·forward), in that globe's radii once near is.
fn nearerSurface(texelPos: vec2<i32>, uv: vec2<f32>) -> bool {
  let depth = depthAt(texelPos);
  if (depth <= 0.0) {
    return false;
  }
  let ray = viewRay(uv);
  var hitDistance = 1e30;
  var near = 0.0;
  for (var bodyIndex = 0u; bodyIndex < min(plate.count, 4u); bodyIndex++) {
    let hit = castPlateBody(ray, plate.items[bodyIndex]);
    if (hit.t < hitDistance) {
      hitDistance = hit.t;
      near = depthScale.nearRadii[bodyIndex];
    }
  }
  let range = near / (depth * max(dot(ray, depthScale.forward.xyz), 1e-6));
  return hitDistance < 1e30 && near > 0.0 && range < hitDistance - NEARER_RADII;
}

// Where the scene's depth breaks: a rover against the ground behind it, a crater
// rim against the plain beyond. Reversed-Z depth is linear in screen space across any
// plane, so its second difference is ~0 on open ground at any slant and jumps at an
// occluding edge: relative to the nearest tap, DEPTH_JUMP ≈ a 5% step in range.
fn depthEdge(texelPos: vec2<i32>, reach: i32) -> f32 {
  let depthCentre = depthAt(texelPos);
  let depthLeft = depthAt(texelPos - vec2<i32>(reach, 0));
  let depthRight = depthAt(texelPos + vec2<i32>(reach, 0));
  let depthAbove = depthAt(texelPos - vec2<i32>(0, reach));
  let depthBelow = depthAt(texelPos + vec2<i32>(0, reach));
  let nearest = max(max(depthCentre, max(depthLeft, depthRight)), max(depthAbove, depthBelow));
  let jump = max(abs(depthLeft + depthRight - 2.0 * depthCentre), abs(depthAbove + depthBelow - 2.0 * depthCentre)) / max(nearest, 1e-30);
  return smoothstep(DEPTH_JUMP * 0.7, DEPTH_JUMP * 1.3, jump);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let texelPos = vec2<i32>(in.pos.xy);
  let land = texelAt(landTex, texelPos).rg;
  let nearer = nearerSurface(texelPos, in.uv);
  // The limb is inked one print unit across the cover's edge.
  let reach = i32(round(uniforms.unit));
  let gradX = cover(texelPos + vec2<i32>(reach, 0)) - cover(texelPos - vec2<i32>(reach, 0));
  let gradY = cover(texelPos + vec2<i32>(0, reach)) - cover(texelPos - vec2<i32>(0, reach));
  var limb = smoothstep(0.25, 0.7, length(vec2<f32>(gradX, gradY)));
  // Depth's own edges ink where it is the cover, and on a nearer body: its outline over
  // the globe behind (a one-sided step) and its own parts. Not on a cast globe's relief.
  let inside = (uniforms.flags & FLAG_DEPTH_COVER) != 0u;
  if (inside || nearer) {
    limb = max(limb, depthEdge(texelPos, reach));
  }
  let mapped = select(step(0.5, land.g), NEARER_SURFACE, nearer);
  return vec4<f32>(cover(texelPos), select(land.r, 0.0, nearer), mapped, limb);
}
