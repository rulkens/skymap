// mipBlit3d.wesl -- fills a 3D texture's mip chain one (level, z-slice) pass
// at a time via GPURenderPassColorAttachment.depthSlice; a fullscreen UV
// alone can't tell one destination slice from another, so z comes from the
// per-draw MipBlit3dUniforms instead.
//
// fs_box: one trilinear tap at u.boxZ (x/y free from the UV, as in
// mipBlit.wesl) -- the display chain's box filter. fs_max: dynamic
// textureLoad taps over the parent footprint per axis (2-wide, 3-wide at a
// trailing odd-dimension edge -- see tapRange), normalised to deviation
// space before the max reduction -- see the plan for why raw-value max isn't
// safe.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct MipBlit3dUniforms {
  boxZ: f32,
  dstZ: u32,
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

// Inclusive [low, high] parent-index range dst index 'd' reduces along one
// axis of size parentDim. Normally 2-wide (2d, 2d+1); at the LAST dst index
// on an odd-sized axis, floor(parentDim/2) undercounts dst cells by one
// parent slice, so that final cell widens to 3-wide (2d, 2d+1, parentDim-1)
// to still cover it -- otherwise the trailing slice/row/column is never read
// and fs_max under-reports the true max there.
fn tapRange(d: i32, parentDim: i32) -> vec2<i32> {
  let dstDim = max(1, parentDim / 2);
  let low = d * 2;
  var high = low + 1;
  if (d == dstDim - 1 && (parentDim % 2) == 1) {
    high = parentDim - 1;
  }
  return vec2<i32>(low, high);
}

@fragment
fn fs_max(in: VSOut) -> @location(0) vec4<f32> {
  // x/y come from this fragment's own framebuffer position (no rasteriser UV
  // trick needed here since textureLoad wants integer texel indices anyway);
  // z is the caller's dst slice index. Parent dims come straight off the
  // bound (single-level) source view, same as fs_box's own depth lookup.
  let dims = vec3<i32>(textureDimensions(srcTex));
  let xRange = tapRange(i32(in.clip.x), dims.x);
  let yRange = tapRange(i32(in.clip.y), dims.y);
  let zRange = tapRange(i32(u.dstZ), dims.z);

  var m = 0.0;
  for (var z = zRange.x; z <= zRange.y; z = z + 1) {
    for (var y = yRange.x; y <= yRange.y; y = y + 1) {
      for (var x = xRange.x; x <= xRange.y; x = x + 1) {
        m = max(m, deviation(textureLoad(srcTex, vec3<i32>(x, y, z), 0).r));
      }
    }
  }
  return vec4<f32>(m, 0.0, 0.0, 0.0);
}
