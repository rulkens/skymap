// labels.wgsl — MSDF text rendering with hybrid (clamped) screen-space sizing.
//
// Per-glyph instance: one quad expanded from a unit corner attribute.
// Per-label data lives in a storage buffer indexed by `labelIndex` so
// all glyphs of one label share its world position, color, and fade.
//
// Sizing model: each label has a notional "world em size" (Mpc per em
// of the source font).  The vertex shader projects worldPos to clip
// space, computes how many screen pixels one em occupies at that depth,
// then clamps the result to [minPixelSize, maxPixelSize] before scaling
// each glyph quad accordingly.  This is the "hybrid: world-space with
// min/max pixel clamp" mode from the design spec.

struct Uniforms {
  viewProj   : mat4x4<f32>,
  // viewport pixel dimensions in xy; .zw reserved for future use.
  viewport   : vec4<f32>,
};

struct LabelData {
  // worldPos.xyz = anchor in Mpc; worldPos.w = worldEmMpc (em-size in Mpc)
  worldPos      : vec4<f32>,
  // color.rgb premultiplied; color.a = base alpha (multiplied by fadeAlpha)
  color         : vec4<f32>,
  // x = pixelSize (target em pixel height at natural viewing distance)
  // y = minPixelSize, z = maxPixelSize, w = fadeAlpha
  sizing        : vec4<f32>,
};

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var<storage, read> labels : array<LabelData>;
@group(0) @binding(2) var atlas : texture_2d<f32>;
@group(0) @binding(3) var atlasSampler : sampler;

struct VsIn {
  @location(0) corner       : vec2<f32>, // (0,0) (1,0) (0,1) (1,1)
  @location(1) localOffset  : vec2<f32>, // pen-relative top-left of glyph, atlas px
  @location(2) localSize    : vec2<f32>, // glyph w,h, atlas px
  @location(3) uvRect       : vec4<f32>, // u0 v0 u1 v1
  @location(4) labelIndex   : u32,
};

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv        : vec2<f32>,
  @location(1) color     : vec4<f32>,
};

@vertex
fn vs(input : VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let worldPos    = label.worldPos.xyz;
  let worldEmMpc  = label.worldPos.w;
  let pixelSize   = label.sizing.x;
  let minPx       = label.sizing.y;
  let maxPx       = label.sizing.z;
  let fadeAlpha   = label.sizing.w;

  // Project anchor to clip space.
  let clip = u.viewProj * vec4<f32>(worldPos, 1.0);
  // Perspective-projected pixel height of one em at this depth:
  //   pxPerEm = (worldEmMpc / clip.w) * (viewportH / 2)
  // (clip.w = camera-space depth for a perspective projection)
  let pxPerEm = (worldEmMpc / clip.w) * (u.viewport.y * 0.5);
  let actualPx = clamp(pxPerEm, minPx, maxPx);
  // ratio relative to the target — used to scale the glyph quad.
  let pxScale = actualPx / pixelSize;

  // Glyph corner in atlas px, relative to label anchor.  Atlas Y is
  // top-down; we flip to make Y up in world space (so labels appear
  // above the anchor when localOffsetY is negative).
  let corner_atlas_px = vec2<f32>(
    input.localOffset.x + input.corner.x * input.localSize.x,
    -(input.localOffset.y + input.corner.y * input.localSize.y),
  );
  // Convert atlas px to clip space at depth clip.w:
  //   ndc_per_px = 2 / viewport.xy
  //   then scale by clip.w so the offset is in clip-space (perspective
  //   correct — vertex shader output is multiplied by 1/w during
  //   rasterization, which would otherwise shrink our offsets).
  let ndcOffset = corner_atlas_px * pxScale * (2.0 / u.viewport.xy) * clip.w;

  let outPos = vec4<f32>(clip.x + ndcOffset.x, clip.y + ndcOffset.y, clip.z, clip.w);

  let uv = vec2<f32>(
    mix(input.uvRect.x, input.uvRect.z, input.corner.x),
    mix(input.uvRect.y, input.uvRect.w, input.corner.y),
  );

  let outColor = vec4<f32>(label.color.rgb, label.color.a * fadeAlpha);
  return VsOut(outPos, uv, outColor);
}

fn median3(r : f32, g : f32, b : f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input : VsOut) -> @location(0) vec4<f32> {
  let s = textureSample(atlas, atlasSampler, input.uv).rgb;
  let d = median3(s.r, s.g, s.b) - 0.5;
  let aa = fwidth(d);
  let alpha = smoothstep(-aa, aa, d) * input.color.a;
  // Premultiplied output (the blend state expects premultiplied).
  return vec4<f32>(input.color.rgb * alpha, alpha);
}
