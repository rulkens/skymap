/**
 * UI metadata for one tuning slider, iterated by a DebugPanel section.
 * `K` is the per-domain slider-key union (e.g. `MilkyWaySliderKey`); domains
 * that need a surface discriminator (flow) intersect it on rather than
 * carrying it here, since it is one registry's shape, not a shared one.
 */
export type SliderField<K extends string> = {
  key: K;
  label: string;
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
