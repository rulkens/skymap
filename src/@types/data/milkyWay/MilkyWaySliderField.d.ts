import type { MilkyWaySliderKey } from './MilkyWaySliderKey';

/**
 * UI metadata for one Milky-Way star-cloud tuning slider, iterated by the
 * DebugPanel section. No `surface` discriminator (unlike `FlowSliderField`):
 * every one of these knobs is dev-only, so there is exactly one surface.
 */
export type MilkyWaySliderField = {
  key: MilkyWaySliderKey;
  label: string;
  /** Inclusive min for the range input. */
  min: number;
  /** Inclusive max — the UI owns the visible ceiling (single source of truth). */
  max: number;
  /** Slider granularity. */
  step: number;
  /** Pre-format the current value for the readout. */
  format: (value: number) => string;
  /** Optional hover tooltip. */
  title?: string;
};
