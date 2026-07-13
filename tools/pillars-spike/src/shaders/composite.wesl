// composite.wesl — final tone-map pass: HDR scene + bloom → display.
//
// Adapted from the galaxy-renderer's composite (see tools/galaxy-renderer/
// src/engine/shaders/composite.wesl). Order is physical: add bloom in
// linear HDR, scale by exposure, THEN tone-map (the last step touching
// unbounded values); saturation, vignette, grain and gamma are
// display-space grades after.
//
// Two deviations from the source:
//   - This pass also performs the UPSCALE from the (possibly sub-res) HDR
//     render target to the full-res canvas — the linear sampler does the
//     filtering for free, which is the whole render-scale performance
//     lever (quality select in the UI).
//   - A hashed grain dither (±0.5/255, display space) breaks up the 8-bit
//     banding that smooth dark nebula gradients otherwise show on the
//     swap chain. Post-tonemap dither is the standard cure.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::noise::hash21Hq;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
struct Post { a: vec4<f32>, b: vec4<f32> } // a: exposure,bloom,saturation,vignette  b: x tonemap mode, y frame
@group(0) @binding(3) var<uniform> u: Post;

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a=2.51; let b=0.03; let c=2.43; let d=0.59; let e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn uncharted2(x: vec3<f32>) -> vec3<f32> {
  let A=0.15; let B=0.50; let C=0.10; let D=0.20; let E=0.02; let F=0.30;
  return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F)) - E/F;
}
fn tonemap(x: vec3<f32>, mode: f32) -> vec3<f32> {
  if (mode < 0.5) { return aces(x); }
  if (mode < 1.5) { return x / (1.0 + x); }                                     // Reinhard
  if (mode < 2.5) { let w = 3.0; return x * (1.0 + x / (w * w)) / (1.0 + x); }  // Reinhard extended
  if (mode < 3.5) { return uncharted2(x) / uncharted2(vec3<f32>(11.2)); }       // Uncharted 2 (filmic)
  return clamp(x, vec3<f32>(0.0), vec3<f32>(1.0));                              // Linear
}

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  var hdr = textureSample(sceneTex, samp, i.uv).rgb;
  let bloom = textureSample(bloomTex, samp, i.uv).rgb;
  hdr = hdr + bloom * u.a.y;
  hdr = hdr * u.a.x;
  var c = tonemap(hdr, u.b.x);
  let l = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
  c = mix(vec3<f32>(l), c, u.a.z);
  // vignette
  let d = distance(i.uv, vec2<f32>(0.5, 0.5));
  c = c * (1.0 - u.a.w * smoothstep(0.35, 0.85, d));
  // grain dither — hashed per pixel per frame, ±0.5 LSB in display space.
  let grain = hash21Hq(i.pos.xy + vec2<f32>(u.b.y * 3.11, u.b.y * 7.97)) - 0.5;
  c = pow(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 / 2.2)) + grain * (1.0 / 255.0);
  return vec4<f32>(c, 1.0);
}
