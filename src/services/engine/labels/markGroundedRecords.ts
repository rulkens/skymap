/**
 * markGroundedRecords — flags a record whose subject is under a pixel and stands on a body's
 * ground (`subjectWithinRelief`). The sampled depth at such a subject's pixel is one terrain texel
 * spanning kilometres, inside the baked site height's LOD error, so its verdict is noise (rover
 * captions flickered over Mars): the shader skips it and the body-sphere test alone decides. Off
 * the ground the depth verdict is sound and must stay, since the inner-bound sphere misses the
 * last degrees above a horizon. The word is rewritten, and marked for upload, only on a change.
 */

import type { LabelStage } from '../../../@types/rendering/LabelStage';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  LABEL_RECORD as W,
  LABEL_RECORD_FLAGS,
  LABEL_RECORD_WORDS,
} from '../../../data/labels/labelRecordLayout';
import { subjectWithinRelief } from '../../../utils/occlusion/subjectWithinRelief';
import { markRecordsDirty } from '../../../utils/labels/markRecordsDirty';

const subject: Vec3 = [0, 0, 0];

export const markGroundedRecords: LabelStage = (records, frame, { occluders }) => {
  const { f32, u32 } = records;
  for (let i = 0; i < records.count; i++) {
    const base = i * LABEL_RECORD_WORDS;
    let grounded = false;
    if (frame.located[i] && frame.diameterPx[i]! < 1 && occluders.length > 0) {
      for (let k = 0; k < 3; k++) subject[k] = f32[base + W.atHi + k]! + f32[base + W.atLo + k]!;
      grounded = subjectWithinRelief(subject, occluders);
    }
    const word = u32[base + W.style]!;
    const next = grounded
      ? word | LABEL_RECORD_FLAGS.grounded
      : word & LABEL_RECORD_FLAGS.styleMask;
    if (next !== word) {
      u32[base + W.style] = next;
      markRecordsDirty(records, i, i + 1);
    }
  }
};
