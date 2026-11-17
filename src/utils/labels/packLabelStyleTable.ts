/** packLabelStyleTable — every `LABEL_STYLES` row in `LABEL_STYLE_IDS` order, as the shader's `LabelStyle` array. */

import { LABEL_STYLES, LABEL_STYLE_IDS } from '../../data/labels/labelStyles';
import {
  LABEL_STYLE_FLAGS as F,
  LABEL_STYLE_GPU as G,
  LABEL_STYLE_GPU_WORDS,
} from '../../data/labels/labelStyleGpuLayout';
import type { LabelStyleRow } from '../../@types/rendering/LabelStyleRow';

export function packLabelStyleTable(): Float32Array {
  const f32 = new Float32Array(LABEL_STYLE_IDS.length * LABEL_STYLE_GPU_WORDS);
  const u32 = new Uint32Array(f32.buffer);
  LABEL_STYLE_IDS.forEach((id, i) => {
    const row: LabelStyleRow = LABEL_STYLES[id];
    const base = i * LABEL_STYLE_GPU_WORDS;
    f32.set(row.color, base + G.color);
    f32.set(row.outline.color, base + G.outlineColor);
    if (row.leader?.color) f32.set(row.leader.color, base + G.leaderColor);
    f32[base + G.outlineEmFrac] = row.outline.emFrac;
    f32[base + G.emMpc] = 'mpc' in row.textHeight ? row.textHeight.mpc : 0;
    f32[base + G.emTimesRadius] = 'timesRadius' in row.textHeight ? row.textHeight.timesRadius : 0;
    f32[base + G.liftRadii] = row.lift?.radii ?? 0;
    f32[base + G.liftMinPx] = row.lift?.minPx ?? 0;
    f32[base + G.leaderGapPx] = row.leader?.gapPx ?? 0;
    f32[base + G.leaderWidthPx] = row.leader?.widthPx ?? 0;
    u32[base + G.flags] =
      (row.placement === 'above' ? F.above : 0) |
      (row.leader?.from === 'rim' ? F.leaderFromRim : 0) |
      (row.leader?.from === 'centre' ? F.leaderFromCentre : 0) |
      (row.leader?.color ? F.leaderColor : 0);
  });
  return f32;
}
