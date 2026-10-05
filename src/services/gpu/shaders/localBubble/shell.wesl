// localBubble/shell.wesl — the Local Bubble cavity-wall shell: vertex stage
// projects the baked mesh; fragment stage shades it with the same additive
// Fresnel rim as horizonShell/fragment.wesl (pow(1 - |N·V|, 3)), renormalising
// the interpolated normal so flat per-vertex normals don't show as facets.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;

struct Uniforms {
  cam: CameraUniforms,
  model: mat4x4<f32>,
  eye: vec3<f32>,
  opacity: f32,
  tint: vec3<f32>,
  _pad: f32,
};

struct VSOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const RIM_POWER: f32 = 3.0;

@vertex
fn vs(
  @location(0) position: vec4<f32>,
  @location(1) normal: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  out.worldPos = (u.model * vec4<f32>(position.xyz, 1.0)).xyz;
  out.worldNormal = (u.model * vec4<f32>(normal.xyz, 0.0)).xyz;
  out.clipPos = worldToClip(u.cam, out.worldPos);
  return out;
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4<f32> {
  let n = normalize(input.worldNormal);
  let v = normalize(u.eye - input.worldPos);
  let rim = pow(1.0 - abs(dot(n, v)), RIM_POWER);
  let value = rim * u.opacity;
  return vec4<f32>(u.tint * value, value);
}
