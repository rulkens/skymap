import type { MilkyWayTuning } from '../../settings/MilkyWayTuning';

/**
 * Keys of `MilkyWaySettings` that surface as numeric sliders — i.e. every
 * tuning knob, which is exactly `MilkyWayTuning`'s key set (the two visibility
 * axes are booleans and belong to their own toggles).
 */
export type MilkyWaySliderKey = keyof MilkyWayTuning;
