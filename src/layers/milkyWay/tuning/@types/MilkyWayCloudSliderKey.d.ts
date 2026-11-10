import type { MilkyWayCloudTuning } from '../../../../@types/settings/MilkyWayCloudTuning';

/**
 * Keys of the `cloud` settings group that surface as numeric sliders — every
 * tuning knob, which is exactly `MilkyWayCloudTuning`'s key set.
 */
export type MilkyWayCloudSliderKey = keyof MilkyWayCloudTuning;
