/**
 * FilmSettings — the `settings.film` cluster: the look's switch, the letterbox
 * bars, and two all-numeric knob records so each DebugPanel board is one list.
 */

import type { FilmGlow } from './FilmGlow';
import type { FilmGrade } from './FilmGrade';

export type FilmSettings = {
  enabled: boolean;
  letterbox: boolean;
  grade: FilmGrade;
  glow: FilmGlow;
};
