/**
 * FilmSettings — the `settings.film` cluster: the look's switch, the letterbox
 * bars and their ratio, and two all-numeric knob records so each DebugPanel
 * board is one list.
 */

import type { FilmGlow } from './FilmGlow';
import type { FilmGrade } from './FilmGrade';

export type FilmSettings = {
  enabled: boolean;
  letterbox: boolean;
  /** Width over height of the picture the bars leave. */
  letterboxAspect: number;
  grade: FilmGrade;
  glow: FilmGlow;
};
