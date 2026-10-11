/**
 * packLabels — the CPU pack loop behind `LabelRenderer.setLabels`: per-label
 * storage records into `labelF32`, per-glyph instance records into the shared
 * glyph buffer. Pure over its typed arrays so the byte layout is testable
 * without a GPU device or a renderer.
 */

import type { PackLabelsArgs } from '../../../../@types/rendering/PackLabelsArgs';
import {
  LABEL_MAX_PX_DEFAULT,
  LABEL_MIN_PX_DEFAULT,
  LABEL_WORLD_EM_MPC_DEFAULT,
} from '../../../../data/labels/labelSizingDefaults';
import { GLYPH_INSTANCE_BYTES, LABEL_DATA_BYTES } from '../../../../data/labels/labelBufferStrides';

/** Returns the glyph count written; glyphs past `maxGlyphs` are dropped. */
export function packLabels(args: PackLabelsArgs): number {
  const { labels, textLayout, layerIndexOf, labelF32, glyphF32, glyphU32, maxGlyphs } = args;
  let glyphCount = 0;

  for (let li = 0; li < labels.length; li++) {
    const label = labels[li]!;
    // No font fallback — Label.font is required at the type level.
    const quads = textLayout.layout(label);

    // Write the per-label storage record unconditionally — even when
    // `quads` is empty.  Keeping the per-label index stable
    // across the outer loop matters because each glyph carries its
    // labelIndex by position; if we skipped a label whose text produced
    // no known glyphs, every subsequent glyph would point to the wrong
    // label entry.  An unused storage slot is harmless (no glyph
    // references it, the GPU never reads it).
    //
    //   [0..3]   worldPos     (x, y, z, worldEmMpc)
    //   [4..7]   color        (r*a, g*a, b*a, a — premultiplied)
    //   [8..11]  sizing       (outlineEmFrac, minPx, maxPx, fadeAlpha)
    //   [12..15] outlineColor (r*a, g*a, b*a, a)
    //   [16]     occludeWeight
    //   [17]     occludeNearKm        ([18..19] are struct padding)
    //   [20..23] subjectPos   (x, y, z, 0 — the depth verdict's own point)
    const labelBase = li * (LABEL_DATA_BYTES / 4);
    labelF32[labelBase + 0] = label.worldPos[0];
    labelF32[labelBase + 1] = label.worldPos[1];
    labelF32[labelBase + 2] = label.worldPos[2];
    labelF32[labelBase + 3] = label.worldEmMpc ?? LABEL_WORLD_EM_MPC_DEFAULT;

    // Public colour API is STRAIGHT RGBA — producers write the natural
    // form (`[1, 0, 0, 0.5]` is "half-transparent red"); the fragment
    // shader composites in premultiplied space, so we multiply r/g/b
    // by a here on the write boundary.
    const color = label.color ?? [1, 1, 1, 1];
    const ca = color[3]!;
    labelF32[labelBase + 4] = color[0]! * ca;
    labelF32[labelBase + 5] = color[1]! * ca;
    labelF32[labelBase + 6] = color[2]! * ca;
    labelF32[labelBase + 7] = ca;

    labelF32[labelBase + 8] = label.outlineEmFrac ?? 0;
    labelF32[labelBase + 9] = label.minPixelSize ?? LABEL_MIN_PX_DEFAULT;
    labelF32[labelBase + 10] = label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT;
    labelF32[labelBase + 11] = label.fadeAlpha ?? 1;

    // outline colour — same straight → premultiplied conversion as fill.
    // Default [0,0,0,0] makes outlineEmFrac irrelevant (band alpha is 0).
    const outlineColor = label.outlineColor ?? [0, 0, 0, 0];
    const oa = outlineColor[3]!;
    labelF32[labelBase + 12] = outlineColor[0]! * oa;
    labelF32[labelBase + 13] = outlineColor[1]! * oa;
    labelF32[labelBase + 14] = outlineColor[2]! * oa;
    labelF32[labelBase + 15] = oa;

    // Default 1 = today's per-pixel rule, so a producer that says nothing
    // about its subject's depth keeps the behaviour it had.
    labelF32[labelBase + 16] = label.occludeWeight ?? 1;
    // Default 0 leaves the sampled-depth channel inert: no scene texel is
    // nearer than the eye, and at weight 1 the `max` already saturates.
    labelF32[labelBase + 17] = label.occludeNearKm ?? 0;

    // Falls back to worldPos when unset (every label the director never
    // lifts, where the two already coincide) — see Label2D.occludeSubjectPos.
    const subjectPos = label.occludeSubjectPos ?? label.worldPos;
    labelF32[labelBase + 20] = subjectPos[0];
    labelF32[labelBase + 21] = subjectPos[1];
    labelF32[labelBase + 22] = subjectPos[2];
    labelF32[labelBase + 23] = 0; // w unused

    // Resolve the label's font to its GPU texture-array layer index
    // ONCE per label, outside the inner glyph loop — every glyph in
    // a label shares the same layer.
    const fontIndex = layerIndexOf[label.font];

    // Write per-glyph instance records (40 bytes = 10 × 4 = 8 × f32 + 2 × u32).
    for (const q of quads) {
      if (glyphCount >= maxGlyphs) break;
      // f32 base index inside the shared ArrayBuffer view.  10 slots/glyph
      // (8 floats + 2 uints reinterpreted via the u32 view at the same
      // offsets — slots 8 and 9).
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
