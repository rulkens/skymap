// mipBlit.wesl -- fullscreen 2x downsample blit used to fill a texture's mip
// chain one level at a time.
//
// ## Why a render-pass chain, not built-in mipmap generation
//
// WebGPU has NO built-in mipmap generator: 'copyExternalImageToTexture' (and
// 'writeTexture') populate mip level 0 only; every level below stays
// undefined. The only way to fill the rest is to render them ourselves. This
// shader runs once per target level -- each pass samples the level above
// through a linear sampler and writes the half-size level below. A single
// bilinear tap at the destination texel centre averages the 2x2 parent texels,
// which IS the box filter for an exact halving, so the fragment is a one-line
// texture sample with no explicit 4-tap loop.
//
// Both stages live in this one file (no separate io.wesl) because the varying
// 'VSOut' is private to this blit -- nothing else imports it.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

// Binding 0 is the parent level (sampled), binding 1 the linear sampler. The
// child level is the render-pass colour attachment, so it needs no binding.
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSamp: sampler;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Standard 'big triangle' trick -- see compositor/vertex.wesl for the
  // why-not-a-quad rationale. Indices 0,1,2 give uv (0,0),(2,0),(0,2): a single
  // triangle covering [0,1]^2 with the off-screen corners safely clipped.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // One linear tap at the destination texel centre averages the 2x2 parent
  // texels -- the box downsample for an exact 2x reduction.
  return textureSample(srcTex, srcSamp, in.uv);
}
