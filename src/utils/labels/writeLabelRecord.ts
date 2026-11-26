/**
 * writeLabelRecord — one description's GPU words at record `at`. Every word is written, so a
 * recycled slot keeps nothing stale. An anchored position is left at zero for `resolveAnchors`;
 * alpha starts at 0 and only the envelope raises it.
 */

import { packPickWord } from '../../data/selectionEncoding';
import type { LabelDescription } from '../../@types/rendering/LabelDescription';
import type { LabelRecords } from '../../@types/rendering/LabelRecords';
import type { LabelStyleId } from '../../@types/rendering/LabelStyleId';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../data/labels/labelRecordLayout';
import { LABEL_STYLES, LABEL_STYLE_IDS } from '../../data/labels/labelStyles';
import { CAPTION_PRIORITY_SCALE } from '../../data/labels/captionPriorityScale';
import { packRgba8Unorm } from '../color/packRgba8Unorm';
import { writeHiLoVertex } from '../math/writeHiLoVertex';

// writeHiLoVertex packs [hi3, lo3]; the record splits them around radiusMpc.
const hiLo = new Float32Array(6);

export function writeLabelRecord(
  records: Pick<LabelRecords, 'f32' | 'u32'>,
  at: number,
  description: LabelDescription,
  style: LabelStyleId,
  glyphs: number,
  glyphCount: number,
): void {
  const { f32, u32 } = records;
  const base = at * LABEL_RECORD_WORDS;
  const { position, pick, revealBand } = description;
  if ('anchorId' in position) hiLo.fill(0);
  else writeHiLoVertex(position, 0, hiLo, 0);
  for (let k = 0; k < 3; k++) {
    f32[base + W.atHi + k] = hiLo[k]!;
    f32[base + W.atLo + k] = hiLo[3 + k]!;
  }
  f32[base + W.radiusMpc] = description.subjectRadiusMpc ?? 0;
  f32[base + W.alpha] = 0;
  u32[base + W.pick] = pick ? packPickWord(pick.code, pick.index) : 0;
  u32[base + W.style] = LABEL_STYLE_IDS.indexOf(style);
  u32[base + W.tint] = description.color ? packRgba8Unorm(description.color) : 0;
  u32[base + W.glyphs] = glyphs;
  u32[base + W.glyphCount] = glyphCount;
  f32[base + W.rank] =
    (description.priority ?? LABEL_STYLES[style].priority) * CAPTION_PRIORITY_SCALE;
  f32[base + W.revealNear] = revealBand?.fullAt ?? 0;
  f32[base + W.revealFar] = revealBand?.goneAt ?? Infinity;
}
