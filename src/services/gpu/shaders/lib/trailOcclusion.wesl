// lib/trailOcclusion.wesl — how much of a trail point survives the frame's
// opaque bodies: analytic eye-relative spheres plus ONE sampled depth row.
// Declares its own '@group(0)' bindings (as lib/sceneDepth.wesl does), so every
// trail shader shares one layout; trailOcclusionUniforms.ts mirrors the block
// byte-for-byte, pinned by orbitTrailConstants.parity.test.ts.

import package::lib::sceneDepthRay::FAR_DEPTH;
import package::lib::sceneDepthRay::sceneRayDistance;

// Occluder-sphere uniform capacity; TS twin MAX_ORBIT_OCCLUDERS in
// src/data/bodies/orbitTrailConstants.ts ('?static' injects no values).
const MAX_OCCLUDERS: u32 = 16u;

// Scene-depth clearance tolerance, as a FRACTION of the trail point's own
// distance: sceneRayDistance carries a metre-scale absolute error floor
// ('lib/sceneDepthRay.wesl') and the trail point a projection error that both
// grow with range, so an absolute tolerance would either crawl at the limb or
// eat the near arc.
const DEPTH_CLEARANCE_REL: f32 = 0.01;

// The frame's opaque bodies as eye-relative spheres (centre.xyz, radius.w, km),
// 'count' live entries, then the km-scaled frame of the row that stamped
// 'sceneDepth'.
struct OcclusionUniforms {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
  spheres: array<vec4<f32>, MAX_OCCLUDERS>,
  invMvp: mat4x4<f32>,
  camPosKm: vec3<f32>,
  viewportPx: vec2<f32>,
};

@group(0) @binding(0) var<uniform> occ: OcclusionUniforms;
// 'foreground:0's depth, sampled not attached (the hdr target is depthless);
// every texel holds FAR_DEPTH until some row clears it.
@group(0) @binding(1) var sceneDepth: texture_depth_2d;

// Visibility of the eye->x SEGMENT (eye at the origin) past one sphere
// (centre.xyz, radius.w, km): 0 inside it, 1 clear of it, one-pixel limb ramp.
// The [0,1] clamp is what keeps a near arc visible (doc: why occlusion is a segment test).
fn sphereClearance(x: vec3<f32>, sphere: vec4<f32>) -> f32 {
  let c = sphere.xyz;
  let along = clamp(dot(c, x) / max(dot(x, x), 1e-30), 0.0, 1.0);
  let gap = length(along * x - c) - sphere.w;
  let aa = max(fwidth(gap), 1e-6);
  return smoothstep(-aa, aa, gap);
}

// Visibility in [0,1] of the eye-relative trail point 'x' (km) under fragment
// pixel 'fragPx': 1 when nothing stands between it and the eye.
fn trailClearance(x: vec3<f32>, fragPx: vec2<f32>) -> f32 {
  var clear = 1.0;
  for (var i = 0u; i < occ.count; i++) {
    clear *= sphereClearance(x, occ.spheres[i]);
  }

  // The spheres cover the sphere bodies; this covers ONE row's terrain and
  // meshes. The depth texture need not match the viewport (the far
  // placeholder is 1x1), so the texel is rescaled while the ray keeps the
  // fragment's own uv.
  let texel = vec2<i32>(fragPx * vec2<f32>(textureDimensions(sceneDepth)) / occ.viewportPx);
  let depth = textureLoad(sceneDepth, texel, 0);
  if (depth != FAR_DEPTH) {
    let sceneKm = sceneRayDistance(fragPx / occ.viewportPx, depth, occ.invMvp, occ.camPosKm);
    let trailKm = length(x);
    // Symmetric, so a grazing trail fades instead of stippling along the depth staircase.
    let tol = DEPTH_CLEARANCE_REL * trailKm;
    clear *= smoothstep(-tol, tol, sceneKm - trailKm);
  }
  return clear;
}
