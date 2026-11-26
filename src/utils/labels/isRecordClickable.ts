/**
 * isRecordClickable — record `i` takes clicks while `targetAlpha` says so, it is still drawn (a
 * fading label stays clickable while readable) and it has ink.
 */

import type { LabelFrame } from '../../@types/rendering/LabelFrame';
import type { LabelRecords } from '../../@types/rendering/LabelRecords';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../data/labels/labelRecordLayout';

export function isRecordClickable(records: LabelRecords, frame: LabelFrame, i: number): boolean {
  const base = i * LABEL_RECORD_WORDS;
  return (
    frame.clickable[i] === 1 &&
    records.f32[base + W.alpha]! > 0 &&
    records.u32[base + W.glyphCount]! > 0
  );
}
