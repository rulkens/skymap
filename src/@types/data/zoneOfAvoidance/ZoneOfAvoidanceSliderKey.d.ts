import type { ZoneOfAvoidanceTuning } from '../../settings/ZoneOfAvoidanceTuning';

/**
 * Keys of `ZoneOfAvoidanceTuning` that surface as numeric DebugPanel
 * sliders — every scalar knob. `color` is excluded: it's a `Vec3`, not a
 * number, and gets its own bespoke control in the section component.
 */
export type ZoneOfAvoidanceSliderKey = Exclude<keyof ZoneOfAvoidanceTuning, 'color'>;
