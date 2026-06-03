// blit.wesl — the tonemap resolve shader.
//
// 'vsFullscreen' emits the standard 3-vertex fullscreen triangle (one oversized
// triangle that covers the viewport — cheaper than a quad and avoids the
// diagonal-seam sampling artefact two triangles can show). 'fsTonemap' samples
// the HDR accumulation texture, scales by exposure, applies a Reinhard
// 'hdr/(hdr+1)' curve, a contrast power, then sRGB gamma-encodes for the
// swap-chain.
//
// The accum sample flips V ('1.0 - uv.y') because the fullscreen triangle's UVs
// are computed in clip space (y-up) while the texture is y-down — the flip keeps
// the resolved image upright.
//
// The 'Blit' uniform is 16 bytes (two f32 + 8 bytes padding to the 16-byte
// minimum uniform-buffer alignment): exposure at offset 0, contrast at offset 4.

struct FsOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex
fn vsFullscreen(@builtin(vertex_index) vi: u32) -> FsOut {
  var p = array<vec2<f32>,3>(vec2<f32>(-1.,-1.), vec2<f32>(3.,-1.), vec2<f32>(-1.,3.));
  let xy = p[vi];
  var o: FsOut; o.pos = vec4<f32>(xy,0.,1.); o.uv = xy*0.5 + vec2<f32>(0.5); return o;
}

struct Blit { exposure:f32, contrast:f32 };
@group(0) @binding(0) var accum: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> bp: Blit;
@fragment
fn fsTonemap(i: FsOut) -> @location(0) vec4<f32> {
  let hdr = textureSampleLevel(accum, samp, vec2<f32>(i.uv.x, 1.0 - i.uv.y), 0.0).rgb * bp.exposure;
  var mapped = hdr / (hdr + vec3<f32>(1.0));                          // Reinhard tonemap
  mapped = pow(max(mapped, vec3<f32>(0.0)), vec3<f32>(bp.contrast));  // contrast: >1 deepens, <1 lifts
  return vec4<f32>(pow(mapped, vec3<f32>(1.0/2.2)), 1.0);             // gamma encode to sRGB
}
