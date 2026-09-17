// texturedMesh.wesl — the MVS mesh, unlit: the photogrammetric texture IS the
// evidence the layer exists to show, and a lighting model would add a second
// opinion about a surface the reconstruction already decided.
// uvs arrive exactly as glTF stores them — origin top-left, matching WebGPU's
// texture space, so 'uploadTexturedMesh' uploads with flipY: false (the
// inverse of the whole-globe uploads in docs/RENDERER.md).

import package::lib::sceneCamera::SceneCamera;

@group(0) @binding(0) var<uniform> cam: SceneCamera;
@group(1) @binding(0) var atlas: texture_2d<f32>;
@group(1) @binding(1) var samp: sampler;

// Preview mask, mesh-local metres; packMaskPolygon.ts writes it. count < 3 means no mask.
struct MaskPolygon {
  count: u32,
  _pad: u32,
  cornersM: array<vec2f>,
};

@group(1) @binding(2) var<storage, read> maskPolygon: MaskPolygon;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) localXY: vec2<f32>,
};

// Even-odd crossing, half-open in y — the exact rule of insideRing.ts, so the preview
// shows what crop-mesh cuts. Reads the module-scope binding: WGSL cannot pass a
// runtime-sized array to a function.
fn insideMask(p: vec2f) -> bool {
  let n = maskPolygon.count;
  if (n < 3u) {
    return true;
  }
  var inside = false;
  var j = n - 1u;
  for (var i = 0u; i < n; i++) {
    let a = maskPolygon.cornersM[i];
    let b = maskPolygon.cornersM[j];
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

@vertex
fn vs(@location(0) positionM: vec3<f32>, @location(1) uv: vec2<f32>) -> VsOut {
  var out: VsOut;
  out.pos = cam.viewProj * vec4<f32>(positionM, 1.0);
  out.uv = uv;
  out.localXY = positionM.xy; // the vertex buffer is already mesh-local
  return out;
}

@fragment
fn fs(i: VsOut) -> @location(0) vec4<f32> {
  // Sampled before the discard, so the implicit-derivative call stays in uniform control flow.
  let texel = textureSample(atlas, samp, i.uv);
  if (!insideMask(i.localXY)) {
    discard;
  }
  return vec4<f32>(texel.rgb, 1.0);
}
