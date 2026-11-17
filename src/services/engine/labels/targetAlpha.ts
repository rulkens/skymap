/**
 * targetAlpha — the alpha each label heads for, from the rules every label obeys (spec D6),
 * written once here instead of per Layer. Focus, hover and select match by packed pick word.
 *  - no position, behind the eye, or nearer than the director's `nearHideMpc`: 0
 *  - "focused only": 0 unless it names the focused, hovered or selected subject
 *  - the toggle's handed value (per item by `fadeKey`) × the record's reveal band by distance
 *  - the style's `appear` band over apparent diameter, unless the subject is hovered or selected
 *  - fades out as its subject fills the view (both through `subjectSizeFade`)
 *  - the toggle's focus recession, unless it names the focused, hovered or selected subject
 *  - 0 while a body stands between the eye and the subject
 * A label is clickable while it shows and its subject is the focus or inside the focus sphere.
 */

import type { LabelStage } from '../../../@types/rendering/LabelStage';
import type { OccluderBody } from '../../../@types/scene/OccluderBody';
import type { Vec3 } from '../../../@types/math/Vec3';
import {
  LABEL_RECORD as W,
  LABEL_RECORD_FLAGS,
  LABEL_RECORD_WORDS,
} from '../../../data/labels/labelRecordLayout';
import { LABEL_STYLES, LABEL_STYLE_IDS } from '../../../data/labels/labelStyles';
import { fadeBand } from '../../../utils/math/fadeBand';
import { subjectSizeFade } from '../../../utils/labels/subjectSizeFade';
import { subjectOccludedByBodies } from '../../../utils/occlusion/subjectOccludedByBodies';
import { isPickableUnderFocus } from '../../../utils/structure/isPickableUnderFocus';

// One reused query, so the per-record occlusion test allocates nothing.
const subject: Vec3 = [0, 0, 0];
const eye: Vec3 = [0, 0, 0];
const query: { subjectMpc: Vec3; camPosMpc: Vec3; bodies: readonly OccluderBody[] } = {
  subjectMpc: subject,
  camPosMpc: eye,
  bodies: [],
};
const reveal = { fullAt: 0, goneAt: 0 };

export const targetAlpha: LabelStage = (records, frame, inputs) => {
  const { f32, u32 } = records;
  const { projection: p, focusPickId, hoveredPick, selectedPick } = inputs;
  const shortSidePx = Math.min(p.sizePx[0], p.sizePx[1]);
  const nearHideMpc = inputs.director.nearHideMpc ?? 0;
  for (let k = 0; k < 3; k++) eye[k] = p.camHi[k]! + p.camLo[k]!;
  query.bodies = inputs.occluders;

  for (let i = 0; i < records.count; i++) {
    frame.target[i] = 0;
    frame.clickable[i] = 0;
    const base = i * LABEL_RECORD_WORDS;
    const pick = u32[base + W.pick]!;
    const named = pick !== 0 && (pick === hoveredPick || pick === selectedPick);
    frame.named[i] = named ? 1 : 0;
    if (!frame.visible[i] || frame.depthMpc[i]! < nearHideMpc) continue;
    const focused = pick !== 0 && pick === focusPickId;
    if (inputs.focusedOnly && !focused && !named) continue;

    const source = records.source[i]!;
    const fade = inputs.toggleFades[source]!;
    let alpha = typeof fade === 'number' ? fade : (fade[records.fadeKeys[i] ?? ''] ?? 0);
    reveal.fullAt = f32[base + W.revealNear]!;
    reveal.goneAt = f32[base + W.revealFar]!;
    alpha *= fadeBand(reveal, frame.distanceMpc[i]!);
    const diameterPx = frame.diameterPx[i]!;
    const style =
      LABEL_STYLES[LABEL_STYLE_IDS[u32[base + W.style]! & LABEL_RECORD_FLAGS.styleMask]!];
    alpha *= subjectSizeFade(style, diameterPx, shortSidePx, !named);
    if (!focused && !named) alpha *= inputs.recessions[source]!;
    if (!(alpha > 0)) continue;

    for (let k = 0; k < 3; k++) subject[k] = f32[base + W.atHi + k]! + f32[base + W.atLo + k]!;
    if (subjectOccludedByBodies(query)) continue;
    frame.target[i] = alpha;
    frame.clickable[i] =
      pick !== 0 && (focused || isPickableUnderFocus(subject, inputs.focus)) ? 1 : 0;
  }
};
