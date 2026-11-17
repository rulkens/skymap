/**
 * targetAlpha — the alpha each label heads for, from the rules every label obeys (spec D6),
 * written once here instead of per Layer. Focus, hover and select match by packed pick word.
 *  - no position, or behind the eye: 0
 *  - "focused only": 0 unless it names the focused subject
 *  - the toggle's handed value (per item by `fadeKey`) × the record's reveal band by distance
 *  - the style's `appear` band over apparent diameter, unless the subject is hovered or selected
 *  - fades out as its subject fills the view (`overflowFade`)
 *  - the toggle's focus recession, unless it names the focused subject
 *  - on the near slab, 0 while a body stands between the eye and the subject
 * A label is clickable while it shows and its subject is the focus or inside the focus sphere.
 */

import type { LabelStage } from '../../../@types/rendering/LabelStage';
import type { OccluderBody } from '../../../@types/scene/OccluderBody';
import type { Vec3 } from '../../../@types/math/Vec3';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../../data/labels/labelRecordLayout';
import { LABEL_STYLES, LABEL_STYLE_IDS } from '../../../data/labels/labelStyles';
import { NEAR0 } from '../frame/slabs';
import { fadeBand } from '../../../utils/math/fadeBand';
import { smoothstep } from '../../../utils/math/smoothstep';
import { overflowFade } from '../../../utils/scene/overflowFade';
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
  const nearSlab = inputs.director.slab === NEAR0;
  for (let k = 0; k < 3; k++) eye[k] = p.camHi[k]! + p.camLo[k]!;
  query.bodies = inputs.occluders;

  for (let i = 0; i < records.count; i++) {
    frame.target[i] = 0;
    frame.clickable[i] = 0;
    if (!frame.visible[i]) continue;
    const base = i * LABEL_RECORD_WORDS;
    const pick = u32[base + W.pick]!;
    const focused = pick !== 0 && pick === focusPickId;
    if (inputs.focusedOnly && !focused) continue;

    const source = records.source[i]!;
    const fade = inputs.toggleFades[source]!;
    let alpha = typeof fade === 'number' ? fade : (fade[records.fadeKeys[i] ?? ''] ?? 0);
    reveal.fullAt = f32[base + W.revealNear]!;
    reveal.goneAt = f32[base + W.revealFar]!;
    alpha *= fadeBand(reveal, frame.distanceMpc[i]!);
    const diameterPx = frame.diameterPx[i]!;
    const style = LABEL_STYLES[LABEL_STYLE_IDS[u32[base + W.style]!]!];
    const named = pick !== 0 && (pick === hoveredPick || pick === selectedPick);
    if ('appear' in style && !named) {
      const { fromPx, bandPx } = style.appear;
      alpha *= smoothstep(fromPx, fromPx + bandPx, diameterPx);
    }
    if (f32[base + W.radiusMpc]! > 0) alpha *= overflowFade(diameterPx, shortSidePx);
    if (!focused) alpha *= inputs.recessions[source]!;
    if (!(alpha > 0)) continue;

    for (let k = 0; k < 3; k++) subject[k] = f32[base + W.atHi + k]! + f32[base + W.atLo + k]!;
    if (nearSlab && subjectOccludedByBodies(query)) continue;
    frame.target[i] = alpha;
    frame.clickable[i] =
      pick !== 0 && (focused || isPickableUnderFocus(subject, inputs.focus)) ? 1 : 0;
  }
};
