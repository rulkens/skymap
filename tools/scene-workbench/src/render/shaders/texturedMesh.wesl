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

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@location(0) positionM: vec3<f32>, @location(1) uv: vec2<f32>) -> VsOut {
  var out: VsOut;
  out.pos = cam.viewProj * vec4<f32>(positionM, 1.0);
  out.uv = uv;
  return out;
}

@fragment
fn fs(i: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(textureSample(atlas, samp, i.uv).rgb, 1.0);
}
