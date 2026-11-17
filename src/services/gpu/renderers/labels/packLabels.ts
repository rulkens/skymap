/**
 * packLabels — the CPU pack loop behind `LabelRenderer.setLabels`: per-label
 * storage records into `labelF32`, per-glyph instance records into the shared
 * glyph buffer. Pure over its typed arrays so the byte layout is testable
 * without a GPU device or a renderer.
 */

import type { PackLabelsArgs } from '../../../../@types/rendering/PackLabelsArgs';
import {
  LABEL_EM_PX_RETUNE,
  LABEL_MAX_PX_DEFAULT,
  LABEL_MIN_PX_DEFAULT,
  LABEL_WORLD_EM_MPC_DEFAULT,
} from '../../../../data/labels/labelSizingDefaults';
import { textLayoutOf } from '../../labelLayout/textLayoutOf';
import {
  GLYPH_INSTANCE_BYTES,
  LABEL_DATA_BYTES,
  LABEL_DATA_OFFSETS as AT,
} from '../../../../data/labels/labelBufferStrides';
import { LABEL_LIFT } from '../../../../data/labels/labelLift';
import { packRgba8Unorm } from '../../../../utils/color/packRgba8Unorm';

const WHITE = [1, 1, 1, 1] as const;

/** Returns the glyph count written; glyphs past `maxGlyphs` are dropped. */
export function packLabels(args: PackLabelsArgs): number {
  const { labels, metricsByFont, layerIndexOf, labelF32, labelU32, glyphF32, glyphU32, maxGlyphs } =
    args;
  let glyphCount = 0;

  for (let li = 0; li < labels.length; li++) {
    const label = labels[li]!;
    const { quads, bbox } = textLayoutOf(metricsByFont, label);

    // Write the per-label storage record unconditionally — even when
    // `quads` is empty.  Keeping the per-label index stable
    // across the outer loop matters because each glyph carries its
    // labelIndex by position; if we skipped a label whose text produced
    // no known glyphs, every subsequent glyph would point to the wrong
    // label entry.  An unused storage slot is harmless (no glyph
    // references it, the GPU never reads it).
    // Slot layout: see the byte table in labelBufferStrides.ts.
    const labelBase = li * (LABEL_DATA_BYTES / 4);
    labelF32[labelBase + AT.worldPos / 4 + 0] = label.worldPos[0];
    labelF32[labelBase + AT.worldPos / 4 + 1] = label.worldPos[1];
    labelF32[labelBase + AT.worldPos / 4 + 2] = label.worldPos[2];
    // The retune rides the em here so the shader holds no copy of it.
    labelF32[labelBase + AT.worldPos / 4 + 3] =
      (label.worldEmMpc ?? LABEL_WORLD_EM_MPC_DEFAULT) * LABEL_EM_PX_RETUNE;

    // Public colour API is STRAIGHT RGBA — producers write the natural
    // form (`[1, 0, 0, 0.5]` is "half-transparent red"); the fragment
    // shader composites in premultiplied space, so we multiply r/g/b
    // by a here on the write boundary.
    const color = label.color ?? WHITE;
    const ca = color[3]!;
    labelF32[labelBase + AT.color / 4 + 0] = color[0]! * ca;
    labelF32[labelBase + AT.color / 4 + 1] = color[1]! * ca;
    labelF32[labelBase + AT.color / 4 + 2] = color[2]! * ca;
    labelF32[labelBase + AT.color / 4 + 3] = ca;

    labelF32[labelBase + AT.sizing / 4 + 0] = label.outlineEmFrac ?? 0;
    labelF32[labelBase + AT.sizing / 4 + 1] = label.minPixelSize ?? LABEL_MIN_PX_DEFAULT;
    labelF32[labelBase + AT.sizing / 4 + 2] = label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT;
    labelF32[labelBase + AT.sizing / 4 + 3] = label.fadeAlpha ?? 1;

    // outline colour — same straight → premultiplied conversion as fill.
    // Default [0,0,0,0] makes outlineEmFrac irrelevant (band alpha is 0).
    const outlineColor = label.outlineColor ?? [0, 0, 0, 0];
    const oa = outlineColor[3]!;
    labelF32[labelBase + AT.outlineColor / 4 + 0] = outlineColor[0]! * oa;
    labelF32[labelBase + AT.outlineColor / 4 + 1] = outlineColor[1]! * oa;
    labelF32[labelBase + AT.outlineColor / 4 + 2] = outlineColor[2]! * oa;
    labelF32[labelBase + AT.outlineColor / 4 + 3] = oa;

    // Default 1 = the per-pixel rule.
    labelF32[labelBase + AT.occludeWeight / 4] = label.occludeWeight ?? 1;
    // Default 0 leaves the sampled-depth channel inert: no scene texel is
    // nearer than the eye, and at weight 1 the `max` already saturates.
    labelF32[labelBase + AT.occludeNearKm / 4] = label.occludeNearKm ?? 0;

    // The lift: every word is written, so a recycled slot keeps no stale leader.
    const lift = label.lift;
    const leader = lift?.leader;
    labelU32[labelBase + AT.leaderRgba / 4] = packRgba8Unorm(leader?.color ?? color);
    labelF32[labelBase + AT.inkBottom / 4] = bbox?.maxY ?? 0;
    labelF32[labelBase + AT.radiusMpc / 4] = lift?.radiusMpc ?? 0;
    labelF32[labelBase + AT.leaderGapPx / 4] = leader?.gapPx ?? 0;
    labelU32[labelBase + AT.lift / 4] = !lift
      ? LABEL_LIFT.none
      : leader?.base === 'rim'
        ? LABEL_LIFT.leaderFromRim
        : LABEL_LIFT.leaderFromCentre;
    labelF32[labelBase + AT.leaderWidthPx / 4] = leader?.widthPx ?? 0;

    const fontIndex = layerIndexOf[label.font];

    for (const q of quads) {
      if (glyphCount >= maxGlyphs) break;
      const f32Base = glyphCount * (GLYPH_INSTANCE_BYTES / 4);
      glyphF32[f32Base + 0] = q.localOffsetX;
      glyphF32[f32Base + 1] = q.localOffsetY;
      glyphF32[f32Base + 2] = q.localSizeW;
      glyphF32[f32Base + 3] = q.localSizeH;
      glyphF32[f32Base + 4] = q.uvU0;
      glyphF32[f32Base + 5] = q.uvV0;
      glyphF32[f32Base + 6] = q.uvU1;
      glyphF32[f32Base + 7] = q.uvV1;
      // labelIndex + fontIndex are u32; write them through the
      // Uint32Array view so the bit patterns are exact (the
      // Float32Array view would reinterpret an int payload as
      // garbage floating-point bits).
      glyphU32[f32Base + 8] = li;
      glyphU32[f32Base + 9] = fontIndex;
      glyphCount++;
    }
  }

  return glyphCount;
}
