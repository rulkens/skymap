// localBubble/shell.wesl — the Local Bubble cavity-wall shell: vertex stage
// projects the baked mesh; fragment stage shades it with the same additive
// Fresnel rim as horizonShell/fragment.wesl (lib/fresnel.wesl), renormalising
// the interpolated normal so flat per-vertex normals don't show as facets.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::fresnel::fresnelRim;

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

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const RIM_POWER: f32 = 3.0;

@vertex
fn vs(
  @location(0) position: vec4<f32>,
  @location(1) normal: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  out.worldPos = (uniforms.model * vec4<f32>(position.xyz, 1.0)).xyz;
  out.worldNormal = (uniforms.model * vec4<f32>(normal.xyz, 0.0)).xyz;
  out.clipPos = worldToClip(uniforms.cam, out.worldPos);
  return out;
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4<f32> {
  let normal = normalize(input.worldNormal);
  let viewDir = normalize(uniforms.eye - input.worldPos);
  let rim = fresnelRim(normal, viewDir, RIM_POWER);
  let value = rim * uniforms.opacity;
  return vec4<f32>(uniforms.tint * value, value);
}
