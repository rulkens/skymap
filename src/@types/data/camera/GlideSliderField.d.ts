import type { GlideTuning } from '../../camera/GlideTuning';

/** UI metadata for one focus-glide calibration slider, iterated by the DebugPanel. */
export type GlideSliderField = {
  key: keyof GlideTuning;
  label: string;
  /** Inclusive min for the slider. */
  min: number;
  /** Inclusive max — the UI owns the visible ceiling (single source of truth). */
  max: number;
  /** Granularity; `Slider` derives the readout's decimal places from it. */
  step: number;
};
