/**
 * EngineSurveysHandle — survey point-billboard appearance + label controls.
 *
 * Owns the shared per-survey visual knobs (size, brightness, fallback-orientation
 * indicator, real-only filter, depth fade) that flow into `points.wgsl`, plus the
 * per-survey text-label axis. A survey bears a label only when its registry row
 * carries one (the famous-galaxy `galaxyNames` layer today); `setLabelEnabled`
 * writes the survey's item row either way and fires the label fade for the
 * label-bearing surveys, so the curated-atlas name toggle and the billboard knobs
 * live on one cohesive sub-handle.
 */

import type { SurveyId } from '../data/SurveyId';

export type EngineSurveysHandle = {
  /** Set the billboard pixel radius for all rendered points. */
  setSize: (sizePx: number) => void;
  /** Set the global brightness multiplier applied to every star. */
  setBrightness: (value: number) => void;
  /** Toggle the per-galaxy camera-distance depth fade. */
  setDepthFade: (enabled: boolean) => void;
  /** Toggle the magenta tint on galaxies whose orientation is fallback. */
  setHighlightFallback: (enabled: boolean) => void;
  /** Toggle "show only galaxies with real photometric orientation". */
  setRealOnly: (enabled: boolean) => void;
  /** Show/hide the text labels for a survey (famous-galaxy names today). */
  setLabelEnabled(survey: SurveyId, enabled: boolean): void;
};
