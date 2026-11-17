/**
 * declutterRecords — greedy declutter in rank order: a label survives unless its padded ink
 * rect intersects one already kept. Rank is the record's priority band plus its subject's
 * apparent diameter, clamped below the band scale, so size only orders labels within a band;
 * a hovered or selected label outranks every band (spec D6.4).
 * A label that shows nothing (target 0, no ink) or whose anchor is off the image survives and
 * never blocks. The order is kept between frames, so the insertion sort runs over a nearly sorted
 * list; ties keep record order.
 */

import type { LabelStage } from '../../../@types/rendering/LabelStage';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../../data/labels/labelRecordLayout';
import { CAPTION_PRIORITY_SCALE } from '../../../data/labels/captionPriorityScale';

export const declutterRecords: LabelStage = (records, frame, { director, projection }) => {
  const { f32, u32 } = records;
  const n = records.count;
  const { order, rank, rect } = frame;
  if (frame.orderCount !== n) {
    for (let i = 0; i < n; i++) order[i] = i;
    frame.orderCount = n;
  }
  for (let i = 0; i < n; i++) {
    rank[i] = frame.named[i]
      ? Infinity
      : f32[i * LABEL_RECORD_WORDS + W.rank]! +
        Math.min(frame.diameterPx[i]!, CAPTION_PRIORITY_SCALE - 1);
  }
  for (let j = 1; j < n; j++) {
    const i = order[j]!;
    let k = j - 1;
    while (
      k >= 0 &&
      (rank[order[k]!]! < rank[i]! || (rank[order[k]!] === rank[i] && order[k]! > i))
    ) {
      order[k + 1] = order[k]!;
      k--;
    }
    order[k + 1] = i;
  }

  const pad = director.declutterPadPx * projection.pxScale;
  let kept = 0;
  for (let j = 0; j < n; j++) {
    const i = order[j]!;
    frame.survivor[i] = 1;
    const shows = frame.target[i]! > 0 && u32[i * LABEL_RECORD_WORDS + W.glyphCount]! > 0;
    if (!shows || !frame.onScreen[i]) continue;
    const x0 = rect[i * 4]! - pad;
    const y0 = rect[i * 4 + 1]! - pad;
    const x1 = rect[i * 4 + 2]! + pad;
    const y1 = rect[i * 4 + 3]! + pad;
    let collides = false;
    for (let a = 0; a < kept && !collides; a++) {
      const o = frame.accepted[a]! * 4;
      collides = x0 < rect[o + 2]! && x1 > rect[o]! && y0 < rect[o + 3]! && y1 > rect[o + 1]!;
    }
    if (collides) frame.survivor[i] = 0;
    else frame.accepted[kept++] = i;
  }
};
