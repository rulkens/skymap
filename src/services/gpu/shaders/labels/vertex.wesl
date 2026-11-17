// labels/vertex.wesl — MSDF labels vertex stage.
//
// Projects the anchor through 'lib/projectLabel.wesl' and expands the
// unit-corner attribute into a glyph quad in output px, along the projected
// image-up and its perpendicular, written as NDC at w = 1.  'worldEmMpc'
// (label.worldPos.w) is the em height in Mpc of world space; it becomes an
// angle at the anchor's distance, then px, clamped to [minPx, maxPx].
//
// ## Quad expansion for the outline fringe
//
// When a label sets 'outlineEmFrac', the on-screen footprint extends
// past the atlas rect by 'outlineEmFrac * displayEmPx' screen pixels.
// If the quad stays sized to the atlas rect, the outline clips at the
// glyph's bounding box.  We grow each corner outward by the fringe
// expressed in atlas px; the UV expansion below extrapolates past the
// glyph's atlas rect so the fragment shader can sample the SDF tail.

import package::labels::io::Uniforms;
import package::labels::io::LabelData;
import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::lib::projectLabel::ProjectedLabel;
import package::lib::projectLabel::projectLabel;
import package::lib::projectLabel::scaledLength;

// Atlas em pixel size — must match 'ATLAS_FONT_SIZE' in src/data/fonts.ts.
const ATLAS_EM_PX: f32 = 84.0;
// MSDF distance range in pixels — must match 'DISTANCE_RANGE_PX' in
// src/data/fonts.ts.  Sets the SDF's encoded headroom past the glyph
// contour; tighter ranges clamp the tail and produce banded edges.
const DISTANCE_RANGE_PX: f32 = 32.0;
// Behind the near plane on every corner: a hidden label rasterises nothing.
const HIDDEN_POS: vec4<f32> = vec4<f32>(0.0, 0.0, -1.0, 1.0);

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> labels: array<LabelData>;

fn viewOfSlabPoint(slabPos: vec3<f32>) -> vec3<f32> {
  return (uniforms.viewFromSlab * vec4<f32>(slabPos, 1.0)).xyz;
}

// expandLabelQuad — the quad-expansion body shared by 'vs' (this file) and
// 'vsOcclude' (vertexOcclude.wesl). Takes the RESOLVED occlude weight as a
// parameter rather than reading 'label.occludeWeight' itself: 'vsOcclude'
// resolves it beforehand by folding in an anchor-depth verdict against
// group(1) bindings this module must stay clear of (see vertexOcclude.wesl's
// header for why). One definition of the corner math either way.
fn expandLabelQuad(input: VsIn, label: LabelData, occludeWeight: f32) -> VsOut {
  let worldEmMpc     = label.worldPos.w;
  let outlineEmFrac  = label.sizing.x;
  let minPx          = label.sizing.y;
  let maxPx          = label.sizing.z;
  let fadeAlpha      = label.sizing.w;

  let viewVec = viewOfSlabPoint(label.worldPos.xyz);
  var anchor: ProjectedLabel = projectLabel(viewVec, uniforms.out);
  anchor.visible = anchor.visible && viewVec.z >= uniforms.nearClipMpc;

  // The em as an angle at the anchor, then px; packLabels already folded the
  // em retune in, as the CPU twins 'labelScreenRect' and
  // 'liftedLabelPlacement' apply it.
  let pxPerEm = worldEmMpc / scaledLength(viewVec) * anchor.pxPerRad;
  let displayEmPx = clamp(pxPerEm, minPx, maxPx);
  let pxScale = displayEmPx / ATLAS_EM_PX;

  // Outline fringe in atlas px.  The on-screen fringe is
  // 'outlineEmFrac * displayEmPx' screen pixels, which divides by
  // pxScale to recover atlas-px (because the same pxScale is applied
  // to the corner offset below).
  let fringeAtlasPx = outlineEmFrac * ATLAS_EM_PX;

  // Expand each corner outward by the fringe.  The unit-corner attribute
  // sits in {(0,0),(1,0),(0,1),(1,1)}; remap to {-1,+1} via (corner*2-1)
  // to get an outward direction, then add 'corner*localSize' for the
  // glyph rect, and 'direction*fringeAtlasPx' for the fringe extension.
  let outward = input.corner * 2.0 - vec2<f32>(1.0, 1.0);
  // Atlas +y runs down the glyph, the opposite of image-up.
  let cornerAtlasPx = vec2<f32>(
    input.localOffset.x + input.corner.x * input.localSize.x + outward.x * fringeAtlasPx,
    input.localOffset.y + input.corner.y * input.localSize.y + outward.y * fringeAtlasPx,
  );
  let across = vec2<f32>(-anchor.up.y, anchor.up.x);
  let cornerPx = anchor.px + (across * cornerAtlasPx.x - anchor.up * cornerAtlasPx.y) * pxScale;
  let sizePx = uniforms.out.sizePx;
  let ndc = vec2<f32>(cornerPx.x / sizePx.x * 2.0 - 1.0, 1.0 - cornerPx.y / sizePx.y * 2.0);
  // Mid-depth: the label pass is a depthless OVER composite, so no plane clips it.
  let outPos = select(HIDDEN_POS, vec4<f32>(ndc, 0.5, 1.0), anchor.visible);

  // UV expansion to match the corner expansion.  The UV rect coordinates
  // are already normalised; the fringe in atlas px maps to UV space via
  // '(uvSpan / localSize)'.  The result samples outside the glyph's
  // atlas rect at the fringe — the distance-only region past the glyph
  // contour, which is where the outline band lives.
  let uvSpanX = input.uvRect.z - input.uvRect.x;
  let uvSpanY = input.uvRect.w - input.uvRect.y;
  let uvBase = vec2<f32>(
    mix(input.uvRect.x, input.uvRect.z, input.corner.x),
    mix(input.uvRect.y, input.uvRect.w, input.corner.y),
  );
  let uvFringe = vec2<f32>(
    outward.x * fringeAtlasPx * uvSpanX / max(input.localSize.x, 0.0001),
    outward.y * fringeAtlasPx * uvSpanY / max(input.localSize.y, 0.0001),
  );
  let uv = uvBase + uvFringe;

  // Pre-bake fadeAlpha into every colour channel that flows to the
  // fragment stage.  The fragment stage then just multiplies by the
  // per-band SDF coverage, so fadeAlpha applies uniformly to fill and
  // outline without an extra fragment-side multiply.
  let outColor        = vec4<f32>(label.color.rgb        * fadeAlpha, label.color.a        * fadeAlpha);
  let outOutlineColor = vec4<f32>(label.outlineColor.rgb * fadeAlpha, label.outlineColor.a * fadeAlpha);

  // Convert em-fraction outline width to SDF units:
  //   widthInSdfUnits = (frac * ATLAS_EM_PX) / DISTANCE_RANGE_PX
  let outlineSdf = outlineEmFrac * ATLAS_EM_PX / DISTANCE_RANGE_PX;

  return VsOut(
    outPos,
    uv,
    outColor,
    input.fontIndex,
    outOutlineColor,
    outlineSdf,
    occludeWeight,
  );
}

@vertex
fn vs(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  return expandLabelQuad(input, label, label.occludeWeight);
}
