// labels/vertex.wesl — MSDF labels vertex stage.
//
// Expands the unit-corner attribute into a glyph quad in clip space,
// applying pixel-anchored sizing.  'pixelSize' on each label is the
// target screen-pixel height of one em; the shader clamps to
// [minPx, maxPx] and scales the atlas-baked glyph quad to match.
// See labels/io.wesl's docblock for the broader rationale.

import package::labels::io::Uniforms;
import package::labels::io::LabelData;
import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::lib::camera::worldToClip;

// Atlas em pixel size — must match 'ATLAS_FONT_SIZE' in src/data/fonts.ts.
// Hardcoded rather than passed as a uniform because it's a build-time
// constant of the atlas binary, not a per-frame value.  If the atlas
// is ever rebuilt at a different size, update both this constant and
// the fonts.ts export in the same commit.
const ATLAS_EM_PX: f32 = 42.0;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> labels: array<LabelData>;

@vertex
fn vs(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let worldPos   = label.worldPos.xyz;
  // label.worldPos.w (worldEmMpc) is deprecated since the shader
  // switched to pixel-anchored sizing.  Still written by
  // labelRenderer.ts for buffer-layout stability; intentionally not
  // read here.
  let pixelSize  = label.sizing.x;
  let minPx      = label.sizing.y;
  let maxPx      = label.sizing.z;
  let fadeAlpha  = label.sizing.w;

  // Project anchor to clip space.
  let clip = worldToClip(u.cam, worldPos);

  // Pixel-anchored size: 'pixelSize' IS the screen-pixel height of one
  // em, clamped to the per-label legibility floor / ceiling.  The
  // scale factor maps atlas-baked em pixels to the target on-screen
  // height so 'glyph_px = atlas_glyph_px * pxScale'.  An em-tall glyph
  // (atlas_glyph_px == ATLAS_EM_PX) ends up at exactly displayEmPx px.
  let displayEmPx = clamp(pixelSize, minPx, maxPx);
  let pxScale = displayEmPx / ATLAS_EM_PX;

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
  // fontIndex flows from the per-glyph instance attribute to a flat
  // varying so the fragment shader samples the right atlas layer for
  // this glyph's font.  All glyphs of one label carry the same
  // fontIndex (resolved CPU-side from label.font), but the value is
  // per-glyph because that's the only attribute channel the per-glyph
  // instance buffer exposes.
  return VsOut(outPos, uv, outColor, input.fontIndex);
}
