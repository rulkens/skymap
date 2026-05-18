// labels/vertex.wesl — MSDF labels vertex stage.
//
// Expands the unit-corner attribute into a glyph quad in clip space,
// applying perspective-driven sizing.  'worldEmMpc' (label.worldPos.w)
// is the em height expressed in Mpc of world space; the vertex stage
// projects it through the camera's clip.w to obtain a screen-pixel
// height, clamps to [minPx, maxPx] for legibility, and scales the
// atlas-baked glyph quad to match.  Labels therefore grow as the
// camera approaches (natural perspective), bounded below and above.
// See labels/io.wesl's docblock for the full sizing model.

import package::labels::io::Uniforms;
import package::labels::io::LabelData;
import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::worldLenToPx;
import package::lib::billboard::pxToClipOffset;

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
  let worldEmMpc = label.worldPos.w;   // primary size driver — world-space em height in Mpc
  // sizing.x (pixelSize) is a legacy buffer slot, kept for layout stability.
  // The new model reads worldEmMpc instead; sizing.x is intentionally ignored.
  let minPx      = label.sizing.y;
  let maxPx      = label.sizing.z;
  let fadeAlpha  = label.sizing.w;

  // Project anchor to clip space.
  let clip = worldToClip(u.cam, worldPos);

  // Perspective-driven size: project 'worldEmMpc' (an em height in Mpc
  // of world space) into screen pixels at the anchor's depth.  The
  // shared 'worldLenToPx' helper encapsulates the standard
  // perspective NDC→screen projection ((L / clip.w) * viewport.y / 2);
  // see lib/billboard.wesl for the canonical derivation.  Clamping to
  // [minPx, maxPx] is label-specific — bounds the result for
  // legibility at extreme distances and very close approach — so it
  // stays inline here.
  let pxPerEm = worldLenToPx(u.cam, worldEmMpc, clip.w);
  let displayEmPx = clamp(pxPerEm, minPx, maxPx);
  let pxScale = displayEmPx / ATLAS_EM_PX;

  // Glyph corner in atlas px, relative to label anchor. Atlas Y is
  // top-down; we flip to make Y up in world space (so labels appear
  // above the anchor when localOffsetY is negative).
  let cornerAtlasPx = vec2<f32>(
    input.localOffset.x + input.corner.x * input.localSize.x,
    -(input.localOffset.y + input.corner.y * input.localSize.y),
  );

  // Convert atlas px to clip space at depth clip.w using the shared
  // 'pxToClipOffset' helper — it applies the (2 / viewport) NDC step
  // and multiplies by clip.w so the GPU's perspective divide recovers
  // the right pixel size.  See lib/billboard.wesl for the derivation.
  let ndcOffset = pxToClipOffset(u.cam, cornerAtlasPx * pxScale, clip.w);

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
