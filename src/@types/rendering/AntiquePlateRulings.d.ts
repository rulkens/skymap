/**
 * AntiquePlateRulings — the plate's two ruling frames: the sky's, which follows
 * the orientation setting, and a globe's (Earth's geography), which rules and
 * numbers whatever part of the plate that globe covers. Built per frame by
 * `antiquePlateRulings`.
 */

import type { AntiqueRulingFrame } from './AntiqueRulingFrame';

export type AntiquePlateRulings = {
  readonly sky: AntiqueRulingFrame;
  readonly globe: AntiqueRulingFrame | null;
};
