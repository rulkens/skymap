// labels/vertex.wesl — MSDF labels vertex stage.
//
// Expands the unit-corner attribute into a glyph quad in clip space,
// applying the hybrid (clamped screen-space) sizing math. See
// labels/io.wesl's docblock for why we clamp and what 'world em' means.

import package::labels::io::Uniforms;
import package::labels::io::LabelData;
import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::lib::camera::worldToClip;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> labels: array<LabelData>;

@vertex
fn vs(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let worldPos   = label.worldPos.xyz;
  let worldEmMpc = label.worldPos.w;
  let pixelSize  = label.sizing.x;
  let minPx      = label.sizing.y;
  let maxPx      = label.sizing.z;
  let fadeAlpha  = label.sizing.w;

  // Project anchor to clip space.
  let clip = worldToClip(u.cam, worldPos);

  // Perspective-projected pixel height of one em at this depth:
  //   pxPerEm = (worldEmMpc / clip.w) * (viewportH / 2)
  // (clip.w = camera-space depth for a perspective projection.)
  let pxPerEm = (worldEmMpc / clip.w) * (u.cam.viewportPx.y * 0.5);
  let actualPx = clamp(pxPerEm, minPx, maxPx);
  // Ratio relative to the target — used to scale the glyph quad.
  let pxScale = actualPx / pixelSize;

  // Glyph corner in atlas px, relative to label anchor. Atlas Y is
  // top-down; we flip to make Y up in world space (so labels appear
  // above the anchor when localOffsetY is negative).
  let cornerAtlasPx = vec2<f32>(
    input.localOffset.x + input.corner.x * input.localSize.x,
    -(input.localOffset.y + input.corner.y * input.localSize.y),
  );

  // Convert atlas px to clip space at depth clip.w:
  //   ndc_per_px = 2 / viewport.xy
  // Then scale by clip.w so the offset is in clip-space (perspective
  // correct — vertex output is divided by w during rasterisation,
  // which would otherwise shrink our offsets).
  let ndcOffset = cornerAtlasPx * pxScale * (2.0 / u.cam.viewportPx) * clip.w;

  let outPos = vec4<f32>(clip.x + ndcOffset.x, clip.y + ndcOffset.y, clip.z, clip.w);

  let uv = vec2<f32>(
    mix(input.uvRect.x, input.uvRect.z, input.corner.x),
    mix(input.uvRect.y, input.uvRect.w, input.corner.y),
  );

  let outColor = vec4<f32>(label.color.rgb, label.color.a * fadeAlpha);
  return VsOut(outPos, uv, outColor);
}
