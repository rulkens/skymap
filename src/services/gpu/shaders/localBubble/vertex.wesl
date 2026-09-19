// localBubble/vertex.wesl — vertex stage for the Local Bubble cavity-wall
// shell mesh. 'position'/'normal' arrive as vec4 (w=1/w=0 respectively — see
// shellMeshFormat.ts) because WebGPU has no float16x3 vertex format; the w
// lane is discarded here. 'Camera' is renderer-private, not lib::camera's
// shared CameraUniforms: the shell's Fresnel term needs an eye position,
// which that shared struct deliberately excludes (see its own header).

struct Uniforms {
  model: mat4x4<f32>,
  tint: vec3<f32>,
  opacity: f32,
  _reserved: vec4<f32>,
};

struct Camera {
  viewProj: mat4x4<f32>,
  eye: vec3<f32>,
  _pad: f32,
};

struct VSOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<uniform> cam: Camera;

@vertex
fn vs(
  @location(0) position: vec4<f32>,
  @location(1) normal: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  let worldPos4 = u.model * vec4<f32>(position.xyz, 1.0);
  out.worldPos = worldPos4.xyz;
  out.worldNormal = (u.model * vec4<f32>(normal.xyz, 0.0)).xyz;
  out.clipPos = cam.viewProj * worldPos4;
  return out;
}
