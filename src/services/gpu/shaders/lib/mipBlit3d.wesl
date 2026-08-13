// mipBlit3d.wesl -- fills a 3D texture's mip chain one (level, z-slice) pass
// at a time via GPURenderPassColorAttachment.depthSlice; a fullscreen UV
// alone can't tell one destination slice from another, so z comes from the
// per-draw MipBlit3dUniforms instead.
//
// fs_box: one trilinear tap at u.boxZ (x/y free from the UV, as in
// mipBlit.wesl) -- the display chain's box filter. fs_max: eight
// textureLoad taps over the 2x2x2 parent footprint (x/y from the fragment's
// own position, z from u.srcZLow/srcZHigh), normalised to deviation space
// before the max reduction -- see the plan for why raw-value max isn't safe.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct MipBlit3dUniforms {
  boxZ: f32,
  srcZLow: u32,
  srcZHigh: u32,
  center: f32,
  halfRange: f32,
};

@group(0) @binding(0) var srcTex: texture_3d<f32>;
@group(0) @binding(1) var srcSamp: sampler;
@group(0) @binding(2) var<uniform> u: MipBlit3dUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Same 'big triangle' trick as mipBlit.wesl's vs -- see that file.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}

@fragment
fn fs_box(in: VSOut) -> @location(0) vec4<f32> {
  // Normalise the parent-texel-space z the caller packed into u.boxZ against
  // THIS view's own depth, then let trilinear filtering do the 2x2x2 box.
  let depth = f32(textureDimensions(srcTex).z);
  let zNorm = (u.boxZ + 0.5) / depth;
  return textureSampleLevel(srcTex, srcSamp, vec3<f32>(in.uv, zNorm), 0.0);
}

fn deviation(x: f32) -> f32 {
  return abs(x - u.center) / u.halfRange;
}

@fragment
fn fs_max(in: VSOut) -> @location(0) vec4<f32> {
  // x/y come from this fragment's own framebuffer position (no rasteriser UV
  // trick needed here since textureLoad wants integer texel indices anyway);
  // z is the caller's explicit 2-slice footprint.
  let dims = vec2<i32>(textureDimensions(srcTex).xy);
  let dstX = i32(in.clip.x);
  let dstY = i32(in.clip.y);
  let xLow = min(dstX * 2, dims.x - 1);
  let xHigh = min(dstX * 2 + 1, dims.x - 1);
  let yLow = min(dstY * 2, dims.y - 1);
  let yHigh = min(dstY * 2 + 1, dims.y - 1);
  let zLow = i32(u.srcZLow);
  let zHigh = i32(u.srcZHigh);

  var m = 0.0;
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xLow, yLow, zLow), 0).r));
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xHigh, yLow, zLow), 0).r));
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xLow, yHigh, zLow), 0).r));
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xHigh, yHigh, zLow), 0).r));
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xLow, yLow, zHigh), 0).r));
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xHigh, yLow, zHigh), 0).r));
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xLow, yHigh, zHigh), 0).r));
  m = max(m, deviation(textureLoad(srcTex, vec3<i32>(xHigh, yHigh, zHigh), 0).r));
  return vec4<f32>(m, 0.0, 0.0, 0.0);
}
