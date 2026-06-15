import type { FlowSliderKey } from './FlowSliderKey';
import type { FlowSliderSurface } from './FlowSliderSurface';

/** UI metadata for one numeric flow-overlay slider, iterated by both panels. */
export type FlowSliderField = {
  key: FlowSliderKey;
  label: string;
  surface: FlowSliderSurface;
  /** Inclusive min for the range input. */
  min: number;
  /** Inclusive max — the UI owns the visible ceiling (single source of truth). */
  max: number;
  /** Slider granularity. */
  step: number;
  /** Pre-format the current value for the readout (e.g. `toFixed`/rounded count). */
  format: (value: number) => string;
  /** Optional hover tooltip. */
  title?: string;
};
