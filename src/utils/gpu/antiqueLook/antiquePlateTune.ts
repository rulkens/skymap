/** antiquePlateTune — the panel's `AntiqueTuning` as the plate's uniforms read it. */

import type { AntiqueTuning } from '../../../@types/settings/AntiqueTuning';
import type { AntiquePlateTune } from '../../../@types/rendering/AntiquePlateTune';
import { ANTIQUE_PLATE_ROWS } from '../../../data/rendering/antiqueTuning';
import { hexToGl } from '../../color/hexToGl';

export function antiquePlateTune(tuning: AntiqueTuning): AntiquePlateTune {
  const [r, g, b] = hexToGl(tuning.paperTint);
  return {
    hatchUnits: tuning.hatchUnits,
    washGain: tuning.washGain,
    inkGain: tuning.inkGain,
    lineInk: tuning.lineInk,
    borderWash: tuning.borderWash,
    tint: [r, g, b],
    hidden: ANTIQUE_PLATE_ROWS.reduce(
      (bits, { key }, i) => bits | (tuning.rows[key] ? 0 : 1 << i),
      0,
    ),
  };
}
