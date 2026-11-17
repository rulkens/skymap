/**
 * projectRecords — every located record onto the output image, through `projectLabel` (the
 * function the label shader runs) or `liftedAnchor` for an 'above' style, so declutter and pick
 * judge each label where it is drawn. The view vector is the hi/lo difference taken in f64.
 * Text size is the shader's rule: em height over view depth × focal px × the em retune, clamped
 * to `LABEL_TEXT_PX`. Pinhole only: the ink rect is axis-aligned, which a rotated (dome) up is not.
 */

import type { LabelStage } from '../../../@types/rendering/LabelStage';
import type { ProjectedLabel } from '../../../@types/rendering/ProjectedLabel';
import type { Vec3 } from '../../../@types/math/Vec3';
import { LABEL_RECORD as W, LABEL_RECORD_WORDS } from '../../../data/labels/labelRecordLayout';
import { LABEL_STYLES, LABEL_STYLE_IDS } from '../../../data/labels/labelStyles';
import { LABEL_TEXT_PX } from '../../../data/labels/labelTextPx';
import { LABEL_EM_PX_RETUNE } from '../../../data/labels/labelSizingDefaults';
import { ATLAS_FONT_SIZE } from '../../../data/fonts';
import { projectLabel } from '../../../utils/labels/projectLabel';
import { liftedAnchor } from '../../../utils/labels/liftedAnchor';

const world: Vec3 = [0, 0, 0];
const view: Vec3 = [0, 0, 0];
const out: ProjectedLabel = { px: [0, 0], pxPerRad: 0, up: [0, 0], visible: false };

export const projectRecords: LabelStage = (records, frame, { projection: p }) => {
  const { f32, u32 } = records;
  const m = p.viewFromWorld;
  const [width, height] = p.sizePx;
  const minPx = LABEL_TEXT_PX.min * p.pxScale;
  const maxPx = LABEL_TEXT_PX.max * p.pxScale;
  for (let i = 0; i < records.count; i++) {
    const base = i * LABEL_RECORD_WORDS;
    frame.visible[i] = 0;
    frame.onScreen[i] = 0;
    if (!frame.located[i]) continue;
    for (let k = 0; k < 3; k++) {
      world[k] = f32[base + W.atHi + k]! - p.camHi[k]! + (f32[base + W.atLo + k]! - p.camLo[k]!);
    }
    for (let r = 0; r < 3; r++)
      view[r] = m[r]! * world[0] + m[3 + r]! * world[1] + m[6 + r]! * world[2];
    const distance = Math.hypot(world[0], world[1], world[2]);
    const radius = f32[base + W.radiusMpc]!;
    const style = LABEL_STYLES[LABEL_STYLE_IDS[u32[base + W.style]!]!];
    if (style.placement === 'above' && 'lift' in style)
      liftedAnchor(view, radius, style.lift, p, out);
    else projectLabel(view, p, out);
    frame.distanceMpc[i] = distance;
    frame.diameterPx[i] = distance > 0 ? ((2 * radius) / distance) * p.focalPx : 0;
    if (!out.visible) continue;

    frame.visible[i] = 1;
    const [x, y] = out.px;
    frame.px[i * 2] = x;
    frame.px[i * 2 + 1] = y;
    frame.up[i * 2] = out.up[0];
    frame.up[i * 2 + 1] = out.up[1];
    frame.pxPerRad[i] = out.pxPerRad;
    frame.onScreen[i] = x >= 0 && x <= width && y >= 0 && y <= height ? 1 : 0;
    const em =
      'mpc' in style.textHeight ? style.textHeight.mpc : style.textHeight.timesRadius * radius;
    const textPx = Math.min(
      Math.max((em / view[2]) * p.focalPx * LABEL_EM_PX_RETUNE, minPx),
      maxPx,
    );
    frame.textPx[i] = textPx;
    const s = textPx / ATLAS_FONT_SIZE;
    const box = records.textBox;
    frame.rect[i * 4] = x + box[i * 4]! * s;
    frame.rect[i * 4 + 1] = y + box[i * 4 + 1]! * s;
    frame.rect[i * 4 + 2] = x + box[i * 4 + 2]! * s;
    frame.rect[i * 4 + 3] = y + box[i * 4 + 3]! * s;
  }
};
