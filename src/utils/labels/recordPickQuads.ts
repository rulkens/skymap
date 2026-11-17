/**
 * recordPickQuads — the clickable label records as pick rectangles, from the ink boxes
 * `projectRecords` made this frame (no re-projection), nearest subject first: the quads share
 * one depth band and the first drawn owns a contested pixel. A record is clickable while
 * `targetAlpha` says so, it is still drawn (a fading label stays clickable while readable) and it
 * has ink. Each box grows by the grace padding and the painted outline, as `labelPickQuads` does.
 */

import type { LabelFrame } from '../../@types/rendering/LabelFrame';
import type { LabelPickQuad } from '../../@types/rendering/LabelPickQuad';
import type { LabelRecords } from '../../@types/rendering/LabelRecords';
import {
  LABEL_RECORD as W,
  LABEL_RECORD_FLAGS,
  LABEL_RECORD_WORDS,
} from '../../data/labels/labelRecordLayout';
import { LABEL_STYLES, LABEL_STYLE_IDS } from '../../data/labels/labelStyles';
import { LABEL_PICK_GRACE_PADDING_PX } from '../../data/labels/labelPickGracePaddingPx';

export function recordPickQuads(records: LabelRecords, frame: LabelFrame): LabelPickQuad[] {
  const { f32, u32 } = records;
  const picked: number[] = [];
  for (let i = 0; i < records.count; i++) {
    const base = i * LABEL_RECORD_WORDS;
    if (frame.clickable[i] && f32[base + W.alpha]! > 0 && u32[base + W.glyphCount]! > 0) {
      picked.push(i);
    }
  }
  picked.sort((a, b) => frame.distanceMpc[a]! - frame.distanceMpc[b]!);
  return picked.map((i) => {
    const base = i * LABEL_RECORD_WORDS;
    const styleIndex = u32[base + W.style]! & LABEL_RECORD_FLAGS.styleMask;
    const pad =
      LABEL_PICK_GRACE_PADDING_PX +
      LABEL_STYLES[LABEL_STYLE_IDS[styleIndex]!].outline.emFrac * frame.textPx[i]!;
    return {
      rect: {
        x0: frame.rect[i * 4]! - pad,
        y0: frame.rect[i * 4 + 1]! - pad,
        x1: frame.rect[i * 4 + 2]! + pad,
        y1: frame.rect[i * 4 + 3]! + pad,
      },
      packedId: u32[base + W.pick]!,
    };
  });
}
