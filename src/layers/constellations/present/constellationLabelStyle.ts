/**
 * constellationLabelStyle — dim steel-blue captions for the stick figures: a
 * near-field em (anchors are parsecs out), clamps ~half the structure
 * labels' (16–48px vs 35–150px). Eye-tuned; re-tune by editing this module.
 */

import type { ConstellationLabelStyle } from '../@types/ConstellationLabelStyle';

export const CONSTELLATION_LABEL_STYLE: ConstellationLabelStyle = {
  labelColor: [0.7, 0.8, 0.92, 0.84],
  worldEmMpc: 0.00003,
  minPixelSize: 16,
  maxPixelSize: 48,
  outlineColor: [0, 0, 0, 0.1],
  outlineEmFrac: 0.16,
};
