/**
 * filmDefaults — the film look's calibration, settled by eye on the spike; the
 * slider ranges are in spec §4,
 * docs/superpowers/specs/2026-11-13-film-look-design.md
 */

import type { FilmSettings } from '../../@types/settings/FilmSettings';

export const DEFAULT_FILM: FilmSettings = {
  enabled: false,
  letterbox: false,
  grade: {
    contrast: 1.1,
    lift: 0.02,
    splitTone: 0.5,
    grain: 0.06,
    grainSizePx: 2,
    vignette: 0.35,
    chromaticPx: 3,
    softnessPx: 3,
    squeeze: 1.5,
  },
  glow: {
    cap: 12,
    streakThreshold: 1.5,
    streakStrength: 1,
    streakLength: 1,
    streakTint: 0.7,
    veil: 0.3,
  },
};
